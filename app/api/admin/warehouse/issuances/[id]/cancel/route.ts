import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, cancelIssuance } from "@/lib/services/warehouse";
import { cancelIssuanceSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNoContent,
  apiNotFound,
  withErrorHandling,
} from "@/lib/api/response";

/**
 * POST /api/admin/warehouse/issuances/[id]/cancel
 *
 * Withdraws an issue recorded in error, returning every unreturned item to
 * stock. The row survives with a reason on it — see rule 2 of the schema.
 *
 * Behind WAREHOUSE_ADJUST rather than WAREHOUSE_ISSUE: removing a debt from a
 * member's file is the same kind of act as correcting a count, and it should
 * not be available to everyone who can hand out fabric. An issue that has
 * already been paid for cannot be cancelled at all — the service refuses it,
 * because the refund has to be a deliberate act first.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ADJUST);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before cancelling an issue");
    }

    const body = await request.json().catch(() => null);
    const parsed = cancelIssuanceSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    try {
      await cancelIssuance({
        associationId,
        actorId: context.user.id,
        issuanceId: id,
        reason: parsed.data.reason,
      });

      return apiNoContent();
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { reason: [error.message] });
      }
      throw error;
    }
  }
);
