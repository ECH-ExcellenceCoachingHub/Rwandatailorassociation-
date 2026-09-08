import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, recordReturn } from "@/lib/services/warehouse";
import { returnGoodsSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/issuances/[id]/return
 *
 * Records goods coming back from a member, line by line — a member who brings
 * back two of three machines has done something the record must be able to
 * state exactly, rather than rounding to "returned" or "still out".
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ISSUE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before recording a return");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-return:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = returnGoodsSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const issuance = await recordReturn({
        associationId,
        actorId: context.user.id,
        issuanceId: id,
        lines: input.lines,
        note: input.note ?? null,
        occurredAt: input.occurredAt,
      });

      return apiSuccess(issuance);
    } catch (error) {
      if (error instanceof WarehouseError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { lines: [error.message] });
      }
      throw error;
    }
  }
);
