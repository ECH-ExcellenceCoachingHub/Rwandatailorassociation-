import { type NextRequest } from "next/server";
import { requireApiMember } from "@/lib/auth/guards";
import { findGuarantorCandidate } from "@/lib/services/guarantors";
import { apiNotFound, apiSuccess, apiTooManyRequests, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * GET /api/members/lookup?q=<member number or phone>
 *
 * Lets a borrower confirm who they are naming as a guarantor. Exact matches
 * only, within their own association, returning a name and member number and
 * nothing else — enough to recognise the right person, not enough to browse
 * the register or learn anybody's savings.
 *
 * Rate limited as a write rather than a read: every call is a guess at who is
 * a member, and a member has no reason to make many of them.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiMember();

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `member-lookup:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many requests. Please wait.", limit.retryAfter);
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";

  const candidate = context.user.associationId
    ? await findGuarantorCandidate({
        associationId: context.user.associationId,
        borrowerMemberId: context.member!.id,
        query,
      })
    : null;

  if (!candidate) {
    return apiNotFound("No active member has that member number or phone number");
  }

  return apiSuccess({ member: candidate });
});
