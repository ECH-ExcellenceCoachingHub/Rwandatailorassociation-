import { type NextRequest } from "next/server";
import { z } from "zod";
import { redeemQrToken } from "@/lib/auth/qr-access";
import { setSessionCookie } from "@/lib/auth/session";
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
 * POST /api/auth/qr-login — the password step after scanning a sign-in card.
 *
 * The scan itself (/qr/:token) only shows a password box. This is where the
 * session is made, and only if the card is still live AND the password is
 * right. The password runs through the same `authenticate` as /api/auth/login,
 * so the per-account lockout applies here too; the rate limit below is keyed
 * by the card so guessing against one card is throttled even across addresses.
 */

const qrLoginSchema = z.object({
  token: z.string().min(1).max(128),
  password: z.string().min(1, "Enter your password"),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const ip = await getClientIp();
  const userAgent = await getUserAgent();

  const body = await request.json().catch(() => null);
  const parsed = qrLoginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_CREDENTIALS", "Enter your password", 400);
  }

  const { token, password } = parsed.data;

  const key = rateLimitKey("qr-login", ip, token);
  const limit = checkRateLimit(key, RATE_LIMITS.LOGIN);
  if (!limit.allowed) {
    return apiTooManyRequests(
      "Too many login attempts. Please wait before trying again.",
      limit.retryAfter
    );
  }

  const result = await redeemQrToken(token, password, { ipAddress: ip, userAgent });

  if (!result.ok) {
    // The card stopped working between the scan and the submit. The client
    // sends the holder to /qr-invalid, which says the same thing for every
    // reason — see the note on `lookupQrToken`.
    if (!("message" in result)) {
      return apiError("QR_INVALID", "This QR code no longer works.", 410);
    }
    const status = result.reason === "INVALID_CREDENTIALS" ? 401 : 403;
    return apiError(result.reason, result.message, status);
  }

  resetRateLimit(key);
  await setSessionCookie(result.token, result.expiresAt);

  return apiSuccess({
    userId: result.userId,
    role: result.role,
    mustChangePassword: result.mustChangePassword,
    // A forced password change outranks everything: it is set when staff issue
    // a temporary password, and walking past it would leave that password live.
    // Otherwise account status, which answers the question someone holding up
    // their card is asking — "am I in good standing, what is my balance".
    redirectTo: result.mustChangePassword
      ? "/account/password?required=1"
      : "/account/status?via=qr",
  });
});
