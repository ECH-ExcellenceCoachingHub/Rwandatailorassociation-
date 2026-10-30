import { type NextRequest } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { createAssociationSchema } from "@/lib/validation/associations";
import { createAssociation } from "@/lib/services/associations";
import {
  apiBadRequest,
  apiCreated,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * POST /api/super-admin/associations
 *
 * Onboards a new association with its first administrator. Super admins only:
 * creating a tenant is the one act that is, by definition, outside any
 * existing association's scope.
 *
 * The administrator's temporary password is returned exactly once, in this
 * response, for the super admin to hand over. It is stored only as a hash.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiRole("SUPER_ADMIN");

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `association-create:${context.user.id}:${ip}`,
    RATE_LIMITS.FINANCIAL_WRITE
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many requests. Please slow down.", limit.retryAfter);
  }

  const body = await request.json().catch(() => null);
  const parsed = createAssociationSchema.safeParse(body);

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const result = await createAssociation(parsed.data, context);

  if (!result.ok) {
    return apiBadRequest(result.message, { [result.field]: [result.message] });
  }

  return apiCreated(result.created);
});
