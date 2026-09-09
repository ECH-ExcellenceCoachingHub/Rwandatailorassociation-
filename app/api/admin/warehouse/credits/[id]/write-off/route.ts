import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseCreditError, writeOffCredit } from "@/lib/services/warehouse-credit";
import { writeOffCreditSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/credits/[id]/write-off
 *
 * Gives up on collecting a credit. The association bears the loss.
 *
 * Gated on WAREHOUSE_ADJUST rather than WAREHOUSE_ISSUE, alongside the other
 * two acts that can make a shortfall disappear — correcting a count and
 * writing stock off. Handing a member goods is routine; deciding the
 * association will never be paid for them is not, and the written reason is
 * kept on the record and in the audit log.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ADJUST);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before writing a credit off");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-credit-writeoff:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = writeOffCreditSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    try {
      await writeOffCredit({
        associationId,
        actorId: context.user.id,
        creditId: id,
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
