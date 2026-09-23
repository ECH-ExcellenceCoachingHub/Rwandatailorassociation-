import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CorrectionError, correctLoanBalance } from "@/lib/services/balance-corrections";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter each amount in francs, e.g. 15000");

const schema = z.object({
  outstanding: z.object({
    principal: amount,
    interest: amount,
    fees: amount,
    penalty: amount,
  }),
  reason: z
    .string()
    .trim()
    .min(5, "Explain why the figures are being corrected")
    .max(500, "Keep the reason under 500 characters"),
});

/**
 * POST /api/admin/loans/[id]/correction
 *
 * Sets a loan's outstanding principal, interest, fees and penalty to the
 * figures they should be, when repayment allocation or the nightly jobs got
 * them wrong. Posted as an ADJUSTMENT on the loan ledger; needs `loans.adjust`.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.LOANS_ADJUST);
    const { id } = await params;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `loan-correction:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "The request was not valid");
    }

    const loan = await prisma.loan.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });
    if (!loan) return apiNotFound("Loan not found");
    assertSameAssociation(context, loan, "Loan");

    try {
      const result = await correctLoanBalance({
        loanId: id,
        outstanding: parsed.data.outstanding,
        reason: parsed.data.reason,
        actorId: context.user.id,
      });
      return apiSuccess({ message: `Loan corrected (${result.reference}).`, ...result });
    } catch (error) {
      if (error instanceof CorrectionError) return apiBadRequest(error.message);
      throw error;
    }
  }
);
