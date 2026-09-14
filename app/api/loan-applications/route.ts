import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiMember } from "@/lib/auth/guards";
import { submitLoanApplication } from "@/lib/services/loans";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import {
  apiBadRequest,
  apiCreated,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const schema = z.object({
  loanProductId: z.string().min(1, "Choose a loan product"),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  purpose: z
    .string()
    .trim()
    .min(10, "Describe what the loan is for, in at least 10 characters")
    .max(500),
  termMonths: z.coerce.number().int().min(1).max(120),
  // LOAN_REPAYMENT_FREQUENCY: "Repayment is monthly, on the same date each
  // month." The other four values remain in the database enum because older
  // loans carry them, but nothing new may be created outside the rule.
  frequency: z.literal("MONTHLY"),
  // What the member has pledged, when they are asking for more than the share
  // they may take against their own savings. Without these the COLLATERAL
  // blocker in assessBorrowing could never be satisfied, which made every
  // request above the own-share limit permanently unapprovable.
  collateralDescription: z.string().trim().min(3).max(500).optional(),
  collateralValue: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid value")
    .optional(),
  guarantors: z
    .array(
      z.object({
        fullName: z.string().trim().min(2),
        phone: z.string().trim().optional(),
        nationalId: z.string().trim().optional(),
        memberId: z.string().optional(),
      })
    )
    .max(5)
    .optional(),
});

/**
 * POST /api/loan-applications
 *
 * Eligibility is evaluated entirely server-side against the member's stored
 * savings balance and the product's configured rules. The client's own view of
 * what it thinks the member can borrow is advisory and never trusted — the
 * borrowing ceiling shown on the dashboard is a convenience, this is the
 * decision.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiMember();

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `loan-application:${context.user.id}:${ip}`,
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
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const result = await submitLoanApplication({
    memberId: context.member!.id,
    loanProductId: parsed.data.loanProductId,
    requestedAmount: parsed.data.amount,
    purpose: parsed.data.purpose,
    termMonths: parsed.data.termMonths,
    frequency: parsed.data.frequency,
    guarantors: parsed.data.guarantors,
    collateralDescription: parsed.data.collateralDescription,
    collateralValue: parsed.data.collateralValue,
  });

  if (!result.ok) {
    // Surface every failing rule at once, so the member can fix the whole
    // application rather than discovering problems one at a time.
    return apiBadRequest("You are not eligible for this loan", {
      _: result.failures.map((f) => f.message),
    });
  }

  void notify({
    userId: context.user.id,
    event: NOTIFICATION_EVENTS.LOAN_SUBMITTED,
    context: { amount: parsed.data.amount, reference: result.reference },
    entityType: "LoanApplication",
    entityId: result.applicationId,
  });

  return apiCreated({
    reference: result.reference,
    message:
      "Your loan application has been submitted. You will be notified once it has been reviewed.",
  });
});
