import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, adjustStock } from "@/lib/services/warehouse";
import { adjustStockSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/items/[id]/adjust
 *
 * Records a physical count that disagrees with the book figure.
 *
 * BEHIND WAREHOUSE_ADJUST, NOT WAREHOUSE_MANAGE. Correcting a count is how a
 * shortfall is made to disappear, so the person who issues stock should not
 * also hold the permission that can quietly rewrite what is meant to be on the
 * shelf. Same reasoning as SAVINGS_ADJUST.
 *
 * A count that agrees with the book returns 200 with no movement — nothing
 * happened, and posting a zero row would put an entry in the audit log saying
 * so.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ADJUST);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before correcting stock");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-adjust:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = adjustStockSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const movement = await adjustStock({
        associationId,
        actorId: context.user.id,
        itemId: id,
        countedQuantity: input.countedQuantity,
        reason: input.reason,
        occurredAt: input.occurredAt,
      });

      return apiSuccess({ movement, changed: movement !== null });
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { reason: [error.message] });
      }
      throw error;
    }
  }
);
