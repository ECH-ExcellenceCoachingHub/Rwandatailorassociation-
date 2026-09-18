import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiMember } from "@/lib/auth/guards";
import { GuaranteeError, respondToGuarantee } from "@/lib/services/guarantors";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept") }),
  z.object({
    decision: z.literal("decline"),
    reason: z.string().trim().max(300).optional(),
  }),
]);

/**
 * POST /api/guarantees/[id] — a guarantor accepts or declines.
 *
 * The answering member comes from the session and must be the member named on
 * the guarantee. Accepting holds the pledged amount out of their available
 * savings until the loan is repaid, so it is a financial write and rate limited
 * as one.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const context = await requireApiMember();

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `guarantee:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) {
      return apiTooManyRequests("Too many requests. Please wait.", limit.retryAfter);
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest("Choose to accept or decline");
    }

    try {
      const result = await respondToGuarantee({
        guaranteeId: id,
        memberId: context.member!.id,
        accept: parsed.data.decision === "accept",
        reason: parsed.data.decision === "decline" ? parsed.data.reason : null,
        actorUserId: context.user.id,
      });

      return apiSuccess({
        status: result.status,
        message:
          result.status === "ACCEPTED"
            ? "You are now a guarantor for this loan. The amount is held from your savings until it is repaid."
            : "You have declined. Nothing is held from your savings.",
      });
    } catch (error) {
      if (error instanceof GuaranteeError) {
        return error.code === "NOT_FOUND"
          ? apiNotFound(error.message)
          : apiBadRequest(error.message);
      }
      throw error;
    }
  }
);
