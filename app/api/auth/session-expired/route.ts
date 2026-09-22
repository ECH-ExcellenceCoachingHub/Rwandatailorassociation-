import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { ROLE_LANDING } from "@/lib/auth/permissions";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/auth/session-expired?next=/admin
 *
 * Where page guards send someone the database no longer recognises as signed
 * in — idle timeout, remote logout, suspension — instead of straight to /login.
 *
 * WHY THE DETOUR: in those cases the cookie is still a perfectly valid JWT, and
 * middleware, which cannot see the database, treats a valid JWT on /login as
 * "already signed in" and bounces it back to the dashboard. The dashboard
 * rejects it again, and the two redirect at each other until the browser gives
 * up on a blank page. Server components cannot delete cookies, so this route
 * handler does it, then sends the person on to /login with the cookie gone.
 *
 * The session is checked again here rather than taken on trust, so a link to
 * this URL cannot be used to sign someone out: a live session is simply
 * forwarded to where it was going.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  const context = await getAuthContext();
  if (context) {
    return NextResponse.redirect(
      new URL(next ?? ROLE_LANDING[context.user.role], request.url)
    );
  }

  const loginUrl = new URL("/login", request.url);
  if (next) loginUrl.searchParams.set("next", next);
  // Only say "your session expired" when there was a session to expire.
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    loginUrl.searchParams.set("expired", "1");
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
});
