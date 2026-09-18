import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { deletePayment } from "@/lib/services/reconciliation";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters — it is recorded in the audit log"),
});

/**
 * DELETE /api/admin/payments/[id]
 *
 * Discards a payment that can never be attributed to a member — the
 * association's own transfers, bank charges, a misparsed statement line.
 *
 * Requires `payments.reconcile` and a written reason. The service layer
 * refuses outright to delete anything that reached the ledger: money that has
 * moved is corrected by reversal, never by deletion. The full record is
 * written to the audit log before the row is removed.
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.PAYMENTS_RECONCILE);
    const { id } = await params;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `payment-delete:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) {
      return apiBadRequest("Too many requests. Please slow down.");
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      // Surfaced directly rather than as "correct the highlighted fields":
      // this dialog has one field, and a generic message leaves the admin
      // guessing what was wrong with it.
      return apiBadRequest(
        parsed.error.issues[0]?.message ?? "The request was not valid",
        details
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!payment) return apiNotFound("Payment not found");

    // Defence in depth: an admin from another association must not be able to
    // delete this payment even with a valid id.
    assertSameAssociation(context, payment, "Payment");

    const result = await deletePayment({
      paymentId: id,
      adminUserId: context.user.id,
      reason: parsed.data.reason,
    });

    if (!result.ok) return apiBadRequest(result.message);

    // The confirmation the administrator reads is written in the browser, in
    // their own language; the service's English sentence stays on the server.
    return apiSuccess({ deleted: true });
  }
);
