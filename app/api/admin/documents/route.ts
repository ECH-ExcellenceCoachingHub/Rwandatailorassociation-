import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { documentStore } from "@/lib/storage/document";
import { getEnv } from "@/lib/env";
import {
  apiBadRequest,
  apiCreated,
  apiNotFound,
  apiTooManyRequests,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/documents
 *
 * Upload a bank statement or MoMo statement as evidence. The file is stored
 * (local disk or S3, per STORAGE_DRIVER) and a Document row records it so the
 * admin can view or download it later. Every upload is audited under the
 * uploader's name.
 *
 * The body is multipart/form-data:
 *   file        — the statement PDF (required)
 *   type        — "BANK_STATEMENT" | "MOMO_STATEMENT" (required)
 *   title       — human label, defaults to the file name
 *   memberId    — optional member the evidence relates to
 *   associationId — which association this evidence belongs to; required for
 *                   an association admin, optional (any) for a super admin.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.DOCUMENTS_UPLOAD);

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `document-upload:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many uploads. Please wait.", limit.retryAfter);
  }

  const env = getEnv();
  const maxBytes = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const type = formData?.get("type");
  const title = formData?.get("title");
  const memberId = formData?.get("memberId");
  const associationIdParam = formData?.get("associationId");

  if (!(file instanceof File) || file.size === 0) {
    return apiBadRequest("Attach a statement file");
  }
  if (file.size > maxBytes) {
    return apiBadRequest(
      `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the ${env.STORAGE_MAX_UPLOAD_MB} MB limit`
    );
  }
  if (type !== "BANK_STATEMENT" && type !== "MOMO_STATEMENT") {
    return apiBadRequest('type must be "BANK_STATEMENT" or "MOMO_STATEMENT"');
  }

  const associationId = resolveAssociationScope(context, associationIdParam as string | null);
  if (!associationId) {
    return apiBadRequest("Choose an association to store this evidence under");
  }

  // The document belongs to an association; an association admin must not be
  // able to file evidence under another's tenant.
  const association = await prisma.association.findUnique({
    where: { id: associationId },
    select: { id: true, code: true, name: true },
  });
  if (!association) return apiNotFound("No such association");

  const buffer = Buffer.from(await file.arrayBuffer());
  const store = await documentStore();
  const storageKey = await store.put(buffer, file.type, file.name);

  const document = await prisma.document.create({
    data: {
      associationId,
      memberId: memberId as string | null || undefined,
      type: type as "BANK_STATEMENT" | "MOMO_STATEMENT",
      title: (title as string) || file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buffer.length,
      uploadedById: context.user.id,
    },
    select: {
      id: true,
      type: true,
      title: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      association: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
      entityType: "Document",
      entityId: document.id,
      associationId,
      metadata: {
        type: document.type,
        title: document.title,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        storage: env.STORAGE_DRIVER,
      },
    },
    context
  );

  return apiCreated(document);
});

/**
 * GET /api/admin/documents?associationId=&type=&memberId=&page=&pageSize=
 *
 * List evidence documents. A super admin sees everything; an association
 * admin is scoped to their own association. Results are newest first.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.DOCUMENTS_VIEW);

  const params = request.nextUrl.searchParams;
  const associationId = resolveAssociationScope(context, params.get("associationId"));
  const type = params.get("type");
  const memberId = params.get("memberId") || undefined;
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "25")));

  const where: Record<string, unknown> = { deletedAt: null };
  if (associationId) where.associationId = associationId;
  if (type === "BANK_STATEMENT" || type === "MOMO_STATEMENT") where.type = type;
  if (memberId) where.memberId = memberId;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        memberId: true,
        association: { select: { id: true, code: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return apiSuccess({
    items: documents,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
