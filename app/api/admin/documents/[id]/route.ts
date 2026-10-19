import { type NextRequest } from "next/server";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { documentStore } from "@/lib/storage/document";
import { apiNotFound, apiSuccess, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/admin/documents/[id]
 *
 * Download or view a stored evidence document. The bytes are brokered through
 * this handler so they are never directly fetchable by URL, and so every
 * download is audited.
 *
 * Accepts `?download=1` to force an attachment download; otherwise the browser
 * may render it inline (PDFs open in the tab).
 */
export const GET = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const context = await requireApiPermission(PERMISSIONS.DOCUMENTS_VIEW);

    const document = await prisma.document.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        type: true,
        title: true,
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        associationId: true,
        association: { select: { id: true, code: true, name: true } },
      },
    });

    if (!document) return apiNotFound("No such document");

    // Tenant isolation: an association admin may not read another's evidence.
    assertSameAssociation(context, document, "Document");

    const store = await documentStore();
    const stored = await store.get(document.storageKey);
    if (!stored) return apiNotFound("The stored file could not be read");

    const download = request.nextUrl.searchParams.get("download") === "1";

    await recordAudit(
      {
        action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
        entityType: "Document",
        entityId: document.id,
        associationId: document.associationId,
        metadata: { action: "VIEW_DOWNLOAD", download: Boolean(download) },
      },
      context
    );

    const headers = new Headers({
      "Content-Type": stored.mimeType,
      "Content-Length": String(stored.size),
      "Cache-Control": "private, max-age=60",
    });
    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${stored.originalName}"`);
    } else {
      headers.set("Content-Disposition", `inline; filename="${stored.originalName}"`);
    }

    return new Response(new Uint8Array(stored.buffer!), { headers });
  }
);

/**
 * DELETE /api/admin/documents/[id]
 *
 * Soft-delete an evidence document (deletedAt is set; the file itself is kept
 * so an audit trail of what existed is never silently erased). Requires the
 * verify/manage permission — removing evidence is a management act, not an
 * upload act.
 */
export const DELETE = withErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const context = await requireApiPermission(PERMISSIONS.DOCUMENTS_VERIFY);

    const document = await prisma.document.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, type: true, title: true, storageKey: true, associationId: true },
    });

    if (!document) return apiNotFound("No such document");

    assertSameAssociation(context, document, "Document");

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
        entityType: "Document",
        entityId: document.id,
        associationId: document.associationId,
        metadata: { action: "DELETE", type: document.type, title: document.title },
      },
      context
    );

    return apiSuccess({ ok: true });
  }
);
