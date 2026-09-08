import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, settleIssuance } from "@/lib/services/warehouse";
import { settleIssuanceSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/issuances/[id]/settle
 *
 * Records that a member has paid for what they took — out of their savings, or
 * in cash.
 *
 * The savings route posts a FEE debit with no overdraft allowance. If the
 * money is not there the settlement fails and an officer collects it another
 * way; a member must never be driven into a negative balance to pay for goods.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ISSUE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before settling an issue");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-settle:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = settleIssuanceSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const issuance = await settleIssuance({
        associationId,
        actorId: context.user.id,
        issuanceId: id,
        amount: input.amount,
        fromSavings: input.fromSavings,
        note: input.note ?? null,
      });

      return apiSuccess(issuance);
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { amount: [error.message] });
      }
      throw error;
    }
  }
);
