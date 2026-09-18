import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { deletePayments, findQueuedPaymentIds } from "@/lib/services/reconciliation";
import {
  apiBadRequest,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/payments/bulk-delete
 *
 * Clears several unattributable payments from the queue at once.
 *
 * Two modes:
 *   • `paymentIds` — the rows the administrator ticked.
 *   • `scope: "ALL_QUEUED"` — every unmatched or failed payment in their
 *     association. The ids are resolved server-side rather than sent by the
 *     browser, so "all" cannot be widened by a crafted request.
 *
 * Payments that reached the ledger are refused individually and reported back;
 * the rest still go. Each deletion is audited separately at CRITICAL severity.
 */
const schema = z
  .object({
    paymentIds: z.array(z.string().min(1)).max(1000).optional(),
    scope: z.literal("ALL_QUEUED").optional(),
    reason: z
      .string()
      .trim()
      .min(10, "Give a reason of at least 10 characters — it is recorded in the audit log"),
  })
  .refine((value) => value.scope === "ALL_QUEUED" || (value.paymentIds?.length ?? 0) > 0, {
    message: "Select at least one payment to delete",
    path: ["paymentIds"],
  });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.PAYMENTS_RECONCILE);
  const associationId = resolveAssociationScope(context);

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `payment-bulk-delete:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many requests. Please wait.", limit.retryAfter);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    // The first message is surfaced directly so the dialog shows what is
    // actually wrong rather than a generic "correct the highlighted fields".
    return apiBadRequest(
      parsed.error.issues[0]?.message ?? "The request was not valid",
      details
    );
  }

  const paymentIds =
    parsed.data.scope === "ALL_QUEUED"
      ? await findQueuedPaymentIds(associationId)
      : (parsed.data.paymentIds ?? []);

  if (paymentIds.length === 0) {
    return apiBadRequest("There are no payments to delete");
  }

  const result = await deletePayments({
    paymentIds,
    associationId,
    adminUserId: context.user.id,
    reason: parsed.data.reason,
  });

  return apiSuccess(result);
});
