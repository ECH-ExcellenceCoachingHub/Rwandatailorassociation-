import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, writeOffStock } from "@/lib/services/warehouse";
import { writeOffStockSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiCreated,
  apiNotFound,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/items/[id]/write-off
 *
 * Records stock damaged, lost, expired or stolen. The value is a loss the
 * association bears — never a debt any member owes, which is why this is a
 * different act from issuing goods and lives behind WAREHOUSE_ADJUST.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ADJUST);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before writing stock off");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-writeoff:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = writeOffStockSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const movement = await writeOffStock({
        associationId,
        actorId: context.user.id,
        itemId: id,
        quantity: input.quantity,
        reason: input.reason,
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
