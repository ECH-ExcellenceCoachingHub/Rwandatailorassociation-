import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { registerSchema } from "@/lib/validation/auth";
import { registerMember } from "@/lib/auth/service";
import { assessPasswordStrength } from "@/lib/auth/password.shared";
import {
  apiBadRequest,
  apiCreated,
  apiError,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  getUserAgent,
  rateLimitKey,
} from "@/lib/api/rate-limit";

/**
 * POST /api/auth/register
 *
 * Public member self-registration. Creates the user, member record, member
 * number, payment reference and savings account in one transaction, all in a
 * pending state — an administrator approves before the account can be used.
 *
 * The association is resolved server-side, never taken from the request body.
 * Accepting a client-supplied associationId here would let anyone enrol
 * themselves into any association on the platform.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const ip = await getClientIp();
  const userAgent = await getUserAgent();

  const limit = checkRateLimit(rateLimitKey("register", ip), RATE_LIMITS.REGISTER);
  if (!limit.allowed) {
    return apiTooManyRequests(
      "Too many registration attempts. Please try again later.",
      limit.retryAfter
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiBadRequest("Invalid request body");

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "_";
      (details[path] ??= []).push(issue.message);
    }
    return apiBadRequest("Please correct the highlighted fields", details);
  }

  const strength = assessPasswordStrength(parsed.data.password);
  if (!strength.acceptable) {
    return apiBadRequest("Please choose a stronger password", {
      password: strength.issues,
    });
  }

  // Single-tenant registration for now: the public form enrols into RTA. When
  // more associations onboard, this resolves from the request host or an
  // invitation token — still server-side, never from the request body.
  const association = await prisma.association.findFirst({
    where: { code: "RTA", status: "ACTIVE" },
    select: { id: true },
  });

  if (!association) {
    return apiError(
      "REGISTRATION_UNAVAILABLE",
      "Registration is not currently open. Please contact the association.",
      503
    );
  }

  const result = await registerMember(parsed.data, association.id, {
    ipAddress: ip,
    userAgent,
  });

  if (!result.ok) {
    return apiBadRequest(result.message, { [result.field]: [result.message] });
  }

  return apiCreated({
    memberNumber: result.memberNumber,
    paymentReference: result.paymentReference,
  });
});
