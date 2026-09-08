import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { WarehouseError, issueToMember } from "@/lib/services/warehouse";
import { issueGoodsSchema } from "@/lib/validation/warehouse";
import { apiBadRequest, apiCreated, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/warehouse/issuances
 *
 * Hands goods to a member.
 *
 * This records that they have the goods and what they are worth. It does NOT
 * touch their savings — collecting the money is a separate, deliberate act at
 * /settle, for the same reason a contribution fine is a debt and not an
 * automatic debit. A member with an empty balance must not be driven negative
 * by receiving goods they were told they could pay for later.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.WAREHOUSE_ISSUE);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Choose an association before issuing goods");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `warehouse-issue:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) return apiBadRequest("Too many requests. Please slow down.");

  const body = await request.json().catch(() => null);
  const parsed = issueGoodsSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const input = parsed.data;

  try {
    // Every part of this — that the member belongs to this association, that
    // the loan belongs to the member, that there is enough stock — is checked
    // inside the service, under the same transaction that moves the goods.
    const issuance = await issueToMember({
      associationId,
      actorId: context.user.id,
      memberId: input.memberId,
      terms: input.terms,
      loanId: input.loanId ?? null,
      dueBackAt: input.dueBackAt ?? null,
      note: input.note ?? null,
      issuedAt: input.issuedAt,
      lines: input.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitValue: line.unitValue ?? null,
      })),
    });

    return apiCreated(issuance);
  } catch (error) {
    if (error instanceof WarehouseError) {
      return apiBadRequest(
        error.message,
        error.code === "INSUFFICIENT_STOCK"
          ? { lines: [error.message] }
          : undefined
      );
    }
    throw error;
  }
});
