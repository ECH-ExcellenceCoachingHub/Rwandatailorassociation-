import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { applyMemberActionToMany } from "@/lib/services/members";
import {
  MEMBER_ACTION_PERMISSION,
  bulkMemberActionSchema,
} from "@/lib/validation/members";
import {
  apiBadRequest,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/members/bulk
 *
 * Applies one decision — approve, decline, suspend, reactivate, close, verify
 * identity, delete — to the members ticked in the register, without opening
 * each file.
 *
 * Needs the same permission as the single-member action, and the same reason.
 * Members are scoped to the caller's association server-side; each is then
 * judged on their own, and those who cannot take the action are reported back
 * by name while the rest go ahead. Every member gets their own audit entry.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = bulkMemberActionSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    // Surfaced directly: the dialog has one field, and "correct the
    // highlighted fields" would leave the administrator guessing which.
    return apiBadRequest(
      parsed.error.issues[0]?.message ?? "The request was not valid",
      details
    );
  }

  const context = await requireApiPermission(MEMBER_ACTION_PERMISSION[parsed.data.action]);
  const associationId = resolveAssociationScope(context);

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `member-bulk:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many requests. Please slow down.", limit.retryAfter);
  }

  const result = await applyMemberActionToMany({
    action: parsed.data.action,
    memberIds: parsed.data.memberIds,
    associationId,
    actorId: context.user.id,
    reason: parsed.data.reason,
  });

  return apiSuccess(result);
});
