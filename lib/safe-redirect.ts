/**
 * Open-redirect defence for post-login navigation.
 *
 * `?next=` comes from the URL and is therefore attacker-controlled. A crafted
 * link such as /login?next=https://rta-savings.example.com would send a user
 * who has just typed their password straight to a lookalike site, with the
 * credibility of having come from the real one. Only same-site absolute paths
 * are allowed through.
 *
 * Client-safe: used by the login form and by server-side redirect handling.
 */

import { sitePrefixOf } from "@/lib/site-paths";

/** Paths a signed-in user should never be bounced back to. */
const BLOCKED_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password", "/api/"];

export function safeRedirectPath(
  candidate: string | null | undefined
): string | null {
  if (!candidate) return null;

  const value = candidate.trim();
  if (!value) return null;

  // Must be a root-relative path.
  if (!value.startsWith("/")) return null;

  // "//evil.com" and "/\evil.com" are protocol-relative URLs: the browser
  // treats them as absolute and leaves the site. They look like paths, which
  // is exactly what makes them a common miss.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // Reject anything carrying a scheme or credentials after decoding, which
  // catches encoded attempts like /%2f%2fevil.com.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/^\s*[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return null;
  if (decoded.includes("\n") || decoded.includes("\r")) return null;

  // Judged without a site prefix, so /rta/login is refused like /login.
  const full = value.split("?")[0].split("#")[0];
  const path = full.slice(sitePrefixOf(full).length) || "/";
  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;

  return value;
}
