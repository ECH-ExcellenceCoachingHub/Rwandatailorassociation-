import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, receiveStock } from "@/lib/services/warehouse";
import { receiveStockSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiCreated,
  apiNotFound,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/items/[id]/receive
 *
 * Records a delivery coming in. A unit cost supplied here also updates the
 * item's standing cost, so the next valuation uses what the association last
 * paid rather than what it paid in the first delivery.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_MANAGE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before recording a delivery");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-receive:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = receiveStockSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const movement = await receiveStock({
        associationId,
        actorId: context.user.id,
        itemId: id,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        supplierName: input.supplierName ?? null,
        deliveryNoteRef: input.deliveryNoteRef ?? null,
        note: input.note ?? null,
        occurredAt: input.occurredAt,
      });

      return apiCreated(movement);
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { quantity: [error.message] });
      }
      throw error;
    }
  }
);
