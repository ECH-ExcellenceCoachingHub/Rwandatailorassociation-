import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PoolDeductionError, postPoolDeduction } from "@/lib/services/pool-deductions";
import { postPoolDeductionSchema } from "@/lib/validation/association-finances";
import { apiBadRequest, apiCreated, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/pool-deductions
 *
 * Takes money out of the members' pool: every member's savings goes down by
 * their part, and every one of them is notified with the reason.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.POOL_DEDUCTIONS_POST);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Choose an association before taking money from its pool");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `pool-deduction:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

  const body = await request.json().catch(() => null);
  const parsed = postPoolDeductionSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  try {
    const posted = await postPoolDeduction({
      associationId,
      actorId: context.user.id,
      ...parsed.data,
    });
    return apiCreated(posted);
  } catch (error) {
    if (error instanceof PoolDeductionError) return apiBadRequest(error.message);
    throw error;
  }
});
