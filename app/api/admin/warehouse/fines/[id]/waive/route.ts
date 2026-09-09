import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseCreditError, waiveCreditFine } from "@/lib/services/warehouse-credit";
import { waiveCreditFineSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/fines/[id]/waive
 *
 * Forgives the 7% charged for a missed month.
 *
 * The written reason is mandatory and lands in the audit log, for the same
 * reason forgiving a contribution fine does: this is an officer's decision
 * that costs the association money, and it must not be possible to make it
 * anonymously or unexplained.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ADJUST);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before forgiving a fine");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-fine-waive:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = waiveCreditFineSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    try {
      await waiveCreditFine({
        associationId,
        actorId: context.user.id,
        fineId: id,
        reason: parsed.data.reason,
      });

      return apiSuccess({ ok: true });
    } catch (error) {
      if (error instanceof WarehouseCreditError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { reason: [error.message] });
      }
      throw error;
    }
  }
);
