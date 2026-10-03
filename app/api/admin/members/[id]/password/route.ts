import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resetMemberPassword } from "@/lib/services/members";
import { adminSetPasswordSchema } from "@/lib/validation/auth";
import { assessPasswordStrength } from "@/lib/auth/password.shared";
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
 * Sets a member's password to the one the administrator typed, for when the
 * self-service reset link is no use to them. Body: `{ password,
 * confirmPassword }`. Only the hash is kept, the member is not asked to change
 * it again, and every session they have is revoked.
 *
 * Needs `members.update`. Staff logins are refused — see `resetMemberPassword`.
 */
export const POST = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
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

    const body = await request.json().catch(() => null);
    const parsed = adminSetPasswordSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_";
        (details[path] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const strength = assessPasswordStrength(parsed.data.password);
    if (!strength.acceptable) {
      return apiBadRequest("Please choose a stronger password", {
        password: strength.issues,
      });
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not take over another association's member.
    assertSameAssociation(context, member, "Member");

    const result = await resetMemberPassword({
      memberId: id,
      password: parsed.data.password,
      actorId: context.user.id,
    });

    if (!result.ok) return apiBadRequest(result.message);

    return apiSuccess({ ok: true });
  }
);
