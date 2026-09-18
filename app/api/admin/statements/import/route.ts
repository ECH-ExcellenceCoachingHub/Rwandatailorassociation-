import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { commitStatementImport } from "@/lib/services/statement-commit";
import {
  extractPayerName,
  extractPayerPhone,
  type ParsedRow,
} from "@/lib/services/statement-import";
import {
  apiBadRequest,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/statements/import
 *
 * Commits the rows an administrator reviewed and ticked.
 *
 * The client sends back the parsed rows it was shown, plus the fingerprints of
 * the rows selected. Re-parsing server-side instead would be marginally
 * tidier, but it would mean the admin confirms one parse and the system
 * commits a different one — they must be the same rows that were on screen.
 *
 * Every amount is re-validated here regardless, and the ledger applies its own
 * constraints, so a tampered payload cannot post a value the ledger would not
 * otherwise accept. What it CAN do is post a payment the admin did not see —
 * which is why this endpoint requires the manual-match permission and is
 * audited with the attesting user against every row.
 */
const rowSchema = z.object({
  fingerprint: z.string().min(8).max(64),
  // Decides whether this row's external id uses the bank reference or its
  // fingerprint. Defaulted rather than required so a client that predates the
  // field still imports correctly, as the first occurrence.
  occurrence: z.number().int().min(1).max(1000).default(1),
  date: z.string(),
  rawLine: z.string().max(1000),
  description: z.string().max(500),
  bankReference: z.string().max(64).nullable(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  direction: z.enum(["CREDIT", "DEBIT"]),
  balanceAfter: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().max(300)).max(10),
});

const schema = z.object({
  fileName: z.string().min(1).max(255),
  fileHash: z.string().min(8).max(64),
  rows: z.array(rowSchema).min(1).max(2000),
  selectedFingerprints: z.array(z.string()).min(1).max(2000),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Deliberately the manual-match permission, not merely reconcile: importing a
  // statement credits members on an administrator's word, which is the same
  // authority as matching an unmatched payment by hand.
  const context = await requireApiPermission(PERMISSIONS.PAYMENTS_MATCH_MANUAL);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Select an association before importing a statement");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `stmt-import:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many imports. Please wait.", limit.retryAfter);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return apiBadRequest(
      "The import request was not valid. Re-upload the statement and try again."
    );
  }

  const association = await prisma.association.findUniqueOrThrow({
    where: { id: associationId },
    select: { id: true, code: true, currency: true },
  });

  const rows: ParsedRow[] = parsed.data.rows.map((row) => ({
    ...row,
    date: new Date(row.date),
    // Re-derived here rather than accepted from the payload. Both fields feed
    // member matching, so taking them from the client would let a tampered
    // request aim a payment at a chosen member. The extractors are pure
    // functions of the submitted line, so this reproduces exactly what the
    // administrator reviewed on screen.
    payerName: extractPayerName(row.description),
    payerPhone: extractPayerPhone(row.rawLine),
  }));

  const invalidDate = rows.find((row) => Number.isNaN(row.date.getTime()));
  if (invalidDate) {
    return apiBadRequest("One of the rows has an unreadable date");
  }

  const result = await commitStatementImport({
    rows,
    selectedFingerprints: parsed.data.selectedFingerprints,
    association,
    adminUserId: context.user.id,
    fileName: parsed.data.fileName,
    fileHash: parsed.data.fileHash,
  });

  return apiSuccess(result);
});
