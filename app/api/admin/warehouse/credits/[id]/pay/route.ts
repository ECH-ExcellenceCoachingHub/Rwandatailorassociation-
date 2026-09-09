import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  WarehouseCreditError,
  recordCreditPayment,
} from "@/lib/services/warehouse-credit";
import { creditPaymentSchema } from "@/lib/validation/warehouse";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/credits/[id]/pay
 *
 * Records a member's monthly payment on goods bought from the store.
 *
 * The caller does not say which instalment it pays. The service allocates
 * oldest-first and, within a month, fine then interest then the goods — see
 * lib/services/warehouse-credit.ts. Letting an officer choose would make it
 * possible to keep a credit looking current while the first month quietly went
 * unpaid and unfined.
 *
 * Paying out of savings posts a FEE debit with no overdraft allowance: a
 * member must never be driven into a negative balance by an instalment. If the
 * money is not there the payment fails and it is collected in cash instead.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ISSUE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Choose an association before recording a payment");
    }

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `warehouse-credit-pay:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

    const body = await request.json().catch(() => null);
    const parsed = creditPaymentSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const input = parsed.data;

    try {
      const result = await recordCreditPayment({
        associationId,
        actorId: context.user.id,
        creditId: id,
        amount: input.amount,
        fromSavings: input.fromSavings,
        channel: input.channel ?? null,
        note: input.note ?? null,
        occurredAt: input.occurredAt,
      });

      return apiSuccess(result);
    } catch (error) {
      if (error instanceof WarehouseCreditError) {
        if (error.code === "NOT_FOUND") return apiNotFound(error.message);
        return apiBadRequest(error.message, { amount: [error.message] });
      }
      throw error;
    }
  }
);
