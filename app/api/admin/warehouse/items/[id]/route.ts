import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, updateItem } from "@/lib/services/warehouse";
import { updateWarehouseItemSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";

/**
 * PATCH /api/admin/warehouse/items/[id]
 *
 * Edits the catalogue entry — a corrected name, a new price, an item archived
 * because the association no longer stocks it.
 *
 * Deliberately cannot touch the quantity on hand. Stock only ever moves
 * through a movement, so an officer who wants the count changed has to post an
 * adjustment and say why.
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_MANAGE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before editing stock");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateWarehouseItemSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      // The service scopes its own lookup to the association, so a stock id
      // from another tenant is a NOT_FOUND rather than an edit.
      const item = await updateItem({
        associationId,
        actorId: context.user.id,
        itemId: id,
        name: input.name,
        nameRw: input.nameRw,
        category: input.category,
        unit: input.unit,
        unitCost: input.unitCost,
        unitPrice: input.unitPrice,
        reorderLevel: input.reorderLevel,
        notes: input.notes,
        isActive: input.isActive,
      });

      return apiSuccess(item);
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message);
      }
      throw error;
    }
  }
);
