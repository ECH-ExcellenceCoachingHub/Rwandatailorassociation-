import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { LedgerError } from "@/lib/services/ledger";
import {
  CorrectionError,
  recordMissedDeposit,
  setSavingsBalance,
} from "@/lib/services/balance-corrections";
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
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount in francs, e.g. 15000");

const reason = z
  .string()
  .trim()
  .min(5, "Explain why the figure is being corrected")
  .max(500, "Keep the reason under 500 characters");

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("deposit"),
    amount,
    channel: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
    externalReference: z.string().trim().max(120).optional(),
    reason,
  }),
  z.object({
    kind: z.literal("set-balance"),
    targetBalance: amount,
    reason,
  }),
]);

/**
 * POST /api/admin/members/[id]/savings-correction
 *
 * Puts a member's savings right by hand when the automatic matching got them
 * wrong: either records a deposit it missed, or sets the balance to a stated
 * figure by ADJUSTMENT. Needs `savings.adjust`.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    // Both kinds need `savings.adjust`, which only a super admin holds by
    // default: a hand-entered deposit changes a balance as surely as an
    // adjustment does.
    const context = await requireApiPermission(PERMISSIONS.SAVINGS_ADJUST);
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "The request was not valid");
    }
    const input = parsed.data;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `savings-correction:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });
    if (!member) return apiNotFound("Member not found");
    assertSameAssociation(context, member, "Member");

    try {
      if (input.kind === "deposit") {
        const posted = await recordMissedDeposit({
          memberId: id,
          amount: input.amount,
          channel: input.channel,
          externalReference: input.externalReference || null,
          reason: input.reason,
          actorId: context.user.id,
        });
        return apiSuccess({ message: `Deposit ${posted.reference} recorded.`, ...posted });
      }

      const posted = await setSavingsBalance({
        memberId: id,
        targetBalance: input.targetBalance,
        reason: input.reason,
        actorId: context.user.id,
      });
      return apiSuccess({ message: `Balance corrected (${posted.reference}).`, ...posted });
    } catch (error) {
      if (error instanceof CorrectionError || error instanceof LedgerError) {
        return apiBadRequest(error.message);
      }
      throw error;
    }
  }
);
