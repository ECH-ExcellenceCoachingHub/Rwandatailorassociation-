import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  deleteRule,
  getRuleHistory,
  updateRule,
  RuleError,
} from "@/lib/services/rulebook";
import { deleteRuleSchema, updateRuleSchema } from "@/lib/validation/rules";
import { notifyMembersOfRuleChange } from "@/lib/services/rule-announcements";
import {
  apiBadRequest,
  apiNoContent,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * GET    /api/admin/rules/[id] — the amendment history of one rule.
 * PATCH  /api/admin/rules/[id] — amend it.
 * DELETE /api/admin/rules/[id] — delete a rule, with a reason. Rules the
 *                                system enforces are refused.
 *
 * The association scope is passed into every service call rather than trusted
 * from the id: a rule id from another tenant must find nothing, not another
 * association's policy.
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const context = await requireApiPermission(PERMISSIONS.RULES_MANAGE);
  const associationId = resolveAssociationScope(context);
  if (!associationId) return apiBadRequest("Choose an association first");

  const { id } = await params;
  const history = await getRuleHistory(associationId, id);

  return apiSuccess({ history });
});

export const PATCH = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const context = await requireApiPermission(PERMISSIONS.RULES_MANAGE);
  const associationId = resolveAssociationScope(context);
  if (!associationId) return apiBadRequest("Choose an association first");

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `rule-update:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateRuleSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const input = parsed.data;

  try {
    const updated = await updateRule({
      associationId,
      ruleId: id,
      actorId: context.user.id,
      value: input.value,
      titleEn: input.titleEn,
      titleRw: input.titleRw,
      bodyEn: input.bodyEn,
      bodyRw: input.bodyRw,
      isActive: input.isActive,
      changeReason: input.changeReason,
      effectiveFrom: input.effectiveFrom,
    });

    // Announced after the amendment has committed, so a messaging failure
    // cannot leave members told about a change that did not happen.
    if (input.notifyMembers) {
      await notifyMembersOfRuleChange({
        associationId,
        ruleTitle: updated.title.en,
        reason: input.changeReason,
      });
    }

    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof RuleError) return apiBadRequest(error.message);
    throw error;
  }
});

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const context = await requireApiPermission(PERMISSIONS.RULES_MANAGE);
  const associationId = resolveAssociationScope(context);
  if (!associationId) return apiBadRequest("Choose an association first");

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = deleteRuleSchema.safeParse(body);
  if (!parsed.success) {
    return apiBadRequest(parsed.error.issues[0]?.message ?? "Say why this rule is being deleted", {
      reason: parsed.error.issues.map((issue) => issue.message),
    });
  }

  try {
    await deleteRule({
      associationId,
      ruleId: id,
      actorId: context.user.id,
      reason: parsed.data.reason,
    });
    return apiNoContent();
  } catch (error) {
    if (error instanceof RuleError) return apiBadRequest(error.message);
    throw error;
  }
});
