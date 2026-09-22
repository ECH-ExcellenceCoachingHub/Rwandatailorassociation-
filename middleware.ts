import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import { ROLE_HOME, ROLE_LANDING } from "@/lib/auth/permissions";

/**
 * Edge middleware: routing and coarse role separation.
 *
 * WHAT THIS IS FOR: keeping people out of areas that are not theirs before a
 * page renders, without a database round trip on every navigation. It runs on
 * the Edge runtime, so it cannot reach Prisma and cannot know whether a session
 * was revoked or an account suspended since the token was issued.
 *
 * WHAT IT IS NOT: the authorisation boundary. That lives in lib/auth/guards.ts
 * and runs in every page and route handler with the database as the authority.
 * If this file were deleted, the system would still be secure — just less
 * pleasant, because unauthorised users would reach a redirect one layer later.
 *
 * The public marketing site (/, /news, /register) is untouched by any of this.
 */

const MEMBER_PREFIX = "/dashboard";
const ADMIN_PREFIX = "/admin";
const SUPER_ADMIN_PREFIX = "/super-admin";

/** Personal account pages — status, sign-in QR code, password. Every signed-in
 *  person has these, so they demand a session and nothing more. */
const ACCOUNT_PREFIX = "/account";

/**
 * Routes that require a session, and the role each demands.
 *
 * `/dashboard` accepts every role, which looks surprising next to the two
 * below it. It is not a hole: those pages are the member's *own* savings and
 * loans, and in a savings association the staff save too — the treasurer has a
 * balance like anyone else. What decides whether they see anything is
 * `requireMember` in the page, which asks whether the caller has a member
 * record of their own and sends them away if they do not. Role was never the
 * right question there; ownership is, and ownership needs the database.
 */
const PROTECTED_PREFIXES: { prefix: string; roles: string[] }[] = [
  { prefix: MEMBER_PREFIX, roles: ["MEMBER", "ADMIN", "SUPER_ADMIN"] },
  { prefix: ACCOUNT_PREFIX, roles: ["MEMBER", "ADMIN", "SUPER_ADMIN"] },
  { prefix: ADMIN_PREFIX, roles: ["ADMIN", "SUPER_ADMIN"] },
  { prefix: SUPER_ADMIN_PREFIX, roles: ["SUPER_ADMIN"] },
];

/** Auth pages a signed-in user should be bounced away from. */
const AUTH_ROUTES = ["/login", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = await verifySessionToken(token);

  const protectedRoute = PROTECTED_PREFIXES.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  );

  if (protectedRoute) {
    if (!claims) {
      const loginUrl = new URL("/login", request.url);
      // Preserve the destination so login can return them to it. Only the
      // path and query are carried over — never an absolute URL, which would
      // turn this into an open redirect.
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

    if (!protectedRoute.roles.includes(claims.role)) {
      // Wrong area for this role — send them to their own dashboard rather
      // than to a dead end.
      return NextResponse.redirect(new URL(ROLE_HOME[claims.role], request.url));
    }
  }

  if (claims && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    // Already signed in, so treat it as arriving: the same place login sends them.
    return NextResponse.redirect(new URL(ROLE_LANDING[claims.role], request.url));
  }

  // Server components cannot see the request URL, and the dashboard layout
  // needs it to return someone to this page after they sign in again. Always
  // overwritten, so a client-supplied header never reaches the layout.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname + request.nextUrl.search);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Security headers. CSP is intentionally omitted here: Next.js inlines
  // hydration scripts, so a useful policy needs per-request nonces wired
  // through the document. Adding a permissive one would be security theatre.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The public pages still
     * pass through — they get the security headers but no auth checks.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.jpg|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
