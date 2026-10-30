import { type NextRequest } from "next/server";
import { findRegistrationAssociation } from "@/lib/services/associations";
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
 * The association is resolved server-side from its public code, never from an
 * id in the request body, and only an ACTIVE association can be joined. Naming
 * one grants nothing by itself: the applicant is pending until that
 * association's own administrator approves them.
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

  // The join link names the association by its public code; the form passes
  // it through on the query string. No code means the default association, so
  // a bare /register keeps enrolling into RTA exactly as it always has.
  const association = await findRegistrationAssociation(
    request.nextUrl.searchParams.get("association")
  );

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
