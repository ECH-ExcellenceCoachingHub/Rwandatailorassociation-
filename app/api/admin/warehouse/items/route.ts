import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, createItem } from "@/lib/services/warehouse";
import { createWarehouseItemSchema } from "@/lib/validation/warehouse";
import { apiBadRequest, apiCreated, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/items
 *
 * Adds a line to the stock catalogue, optionally with the quantity already on
 * the shelf. That opening figure is posted as a RECEIPT rather than written
 * straight into the count — an item that starts at 40 with no movement
 * explaining why is the first crack in the audit trail.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_MANAGE);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Choose an association before adding stock");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `warehouse-item-create:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

  const body = await request.json().catch(() => null);
  const parsed = createWarehouseItemSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const input = parsed.data;

  try {
    const item = await createItem({
      associationId,
      actorId: context.user.id,
      sku: input.sku,
      name: input.name,
      nameRw: input.nameRw ?? null,
      category: input.category,
      unit: input.unit,
      unitCost: input.unitCost,
      unitPrice: input.unitPrice,
      currency: context.association?.currency ?? "RWF",
      reorderLevel: input.reorderLevel ?? null,
      openingQuantity: input.openingQuantity ?? null,
      notes: input.notes ?? null,
    });

    return apiCreated(item);
  } catch (error) {
    if (error instanceof WarehouseError) {
      return apiBadRequest(
        error.message,
        error.code === "DUPLICATE_SKU" ? { sku: [error.message] } : undefined
      );
    }
    throw error;
  }
});
