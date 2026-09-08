import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createBkPaymentClaim, listBkPaymentClaims } from "@/lib/services/bk-claims";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const createSchema = z.object({
  payerCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "The payer code is the six-digit code from Internet Banking or the BK app"),
  narration: z.string().trim().min(1, "Give the payment a narration").max(200),
  amount: z.number().positive("The amount must be greater than zero"),
  memberId: z.string().min(1).optional(),
});

export const GET = withErrorHandling(async () => {
  const context = await requireApiPermission(PERMISSIONS.BK_VIEW);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Select an association to view its payment claims");
  }

  return apiSuccess({ claims: await listBkPaymentClaims(associationId) });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.BK_CLAIM);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Select an association before claiming a payment");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(`bk-claim:${context.user.id}:${ip}`, RATE_LIMITS.FINANCIAL_WRITE);
  if (!limit.allowed) {
    return apiBadRequest("Too many requests. Please slow down.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const result = await createBkPaymentClaim({
    associationId,
    payerCode: parsed.data.payerCode,
    narration: parsed.data.narration,
    amount: parsed.data.amount,
    memberId: parsed.data.memberId ?? null,
    createdById: context.user.id,
  });

  if (!result.ok) {
    return apiBadRequest(result.message);
  }

  return apiSuccess({
    message: "Payment claimed with BK",
    claimId: result.claimId,
    clientReference: result.clientReference,
    status: result.status,
    expiryTime: result.expiryTime,
  });
});
