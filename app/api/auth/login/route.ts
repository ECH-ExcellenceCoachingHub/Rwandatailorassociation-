import { type NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { authenticate } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { ROLE_LANDING } from "@/lib/auth/permissions";
import {
  apiError,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  getUserAgent,
  rateLimitKey,
  resetRateLimit,
} from "@/lib/api/rate-limit";

/**
 * POST /api/auth/login
 *
 * Two independent throttles apply: this endpoint's per-identifier rate limit
 * (cheap, in-memory, resets on restart) and the durable per-account lockout
 * enforced in the auth service. The rate limit blunts scripted volume; the
 * lockout is what actually protects an individual account.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const ip = await getClientIp();
  const userAgent = await getUserAgent();

  const body = await request.json().catch(() => null);
  if (!body) return apiError("BAD_REQUEST", "Invalid request body", 400);

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    // Do not echo which field failed for credentials — a precise message here
    // is a small enumeration hint. Validation detail is fine for format only.
    return apiError("INVALID_CREDENTIALS", "Enter your login details", 400);
  }

  const { identifier, password } = parsed.data;

  // Keyed by identifier so rotating IPs does not reset the budget for the
  // account being attacked.
  const key = rateLimitKey("login", ip, identifier.value);
  const limit = checkRateLimit(key, RATE_LIMITS.LOGIN);

  if (!limit.allowed) {
    return apiTooManyRequests(
      "Too many login attempts. Please wait before trying again.",
      limit.retryAfter
    );
  }

  const result = await authenticate(identifier, password, {
    ipAddress: ip,
    userAgent,
  });

  if (!result.ok) {
    const status = result.reason === "INVALID_CREDENTIALS" ? 401 : 403;
    return apiError(result.reason, result.message, status);
  }

  resetRateLimit(key);
  await setSessionCookie(result.token, result.expiresAt);

  return apiSuccess({
    userId: result.userId,
    role: result.role,
    mustChangePassword: result.mustChangePassword,
    // The client uses this only when no safe `next` was supplied.
    redirectTo: result.mustChangePassword
      ? "/account/password?required=1"
      : ROLE_LANDING[result.role],
  });
});
