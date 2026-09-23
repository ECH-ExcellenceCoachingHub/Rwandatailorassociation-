import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resetMemberPassword } from "@/lib/services/members";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/members/[id]/password
 *
 * Gives a member a new temporary password, for when the self-service reset
 * link is no use to them. The password is returned ONCE, for the
 * administrator to hand over; only its hash is kept, and the member must
 * replace it at their next sign-in. Every session they have is revoked.
 *
 * Needs `members.update`. Staff logins are refused — see `resetMemberPassword`.
 */
export const POST = withErrorHandling(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const { id } = await params;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `admin-password-reset:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) {
      return apiTooManyRequests("Too many password resets. Please wait before trying again.", limit.retryAfter);
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not take over another association's member.
    assertSameAssociation(context, member, "Member");

    const result = await resetMemberPassword({ memberId: id, actorId: context.user.id });

    if (!result.ok) return apiBadRequest(result.message);

    return apiSuccess({ temporaryPassword: result.temporaryPassword });
  }
);
