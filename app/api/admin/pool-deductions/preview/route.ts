import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PoolDeductionError, previewPoolDeduction } from "@/lib/services/pool-deductions";
import { previewPoolDeductionSchema } from "@/lib/validation/association-finances";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";

/**
 * POST /api/admin/pool-deductions/preview
 *
 * Works out what each member would lose, without posting anything, so the
 * officer sees the split before every balance moves.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.POOL_DEDUCTIONS_POST);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Choose an association first");
  }

  const body = await request.json().catch(() => null);
  const parsed = previewPoolDeductionSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  try {
    const plan = await previewPoolDeduction({ associationId, ...parsed.data });
    return apiSuccess(plan);
  } catch (error) {
    if (error instanceof PoolDeductionError) return apiBadRequest(error.message);
    throw error;
  }
});
