import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createMemberSchema } from "@/lib/validation/members";
import { createMember } from "@/lib/services/members";
import {
  apiBadRequest,
  apiCreated,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/members
 *
 * Enrols a member directly, for an administrator transcribing a completed
 * paper application rather than waiting for someone to self-register.
 *
 * The association is resolved from the caller's own scope and is never taken
 * from the request body — accepting one would let an administrator of one
 * association enrol members into another.
 *
 * The temporary password is returned exactly once, in this response. It is
 * stored only as a hash, so if the administrator loses it the member must go
 * through password reset.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.MEMBERS_CREATE);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest(
      "Select an association before enrolling a member. A platform-wide scope has no register to add to."
    );
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `member-create:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many requests. Please slow down.", limit.retryAfter);
  }

  const body = await request.json().catch(() => null);
  const parsed = createMemberSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const result = await createMember({
    input: parsed.data,
    associationId,
    actorId: context.user.id,
  });

  if (!result.ok) {
    return apiBadRequest(result.message, { [result.field]: [result.message] });
  }

  return apiCreated(result.member);
});
