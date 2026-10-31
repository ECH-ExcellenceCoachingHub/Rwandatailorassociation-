import { appSlugFromPath } from "@/lib/pwa/apps";

/**
 * Every page under the association's own address.
 *
 * The dashboards, account pages and password pages are one set of pages for
 * every association, built at /dashboard, /admin, /account… On an
 * association's site they are served under its prefix as well — /rta/dashboard,
 * /rta/admin/members, /rta/forgot-password — so a member of RTA never leaves
 * /rta. The middleware rewrites /rta/dashboard to /dashboard; nothing is built
 * twice.
 *
 * Which prefix applies is read from the address being looked at, never from a
 * setting, so the server render and the browser agree on it (Next reports the
 * browser's address, /rta/dashboard, to both). A link to /dashboard drawn on
 * /rta/admin therefore points at /rta/dashboard, and the same link on a page
 * with no prefix stays /dashboard.
 *
 * A deployment dedicated to one association (SITE_ASSOCIATION) also sends the
 * bare addresses there — see middleware.ts — so nothing on it is ever reached
 * without the prefix.
 *
 * Plain functions, no React: used by the middleware and by client components.
 */

/** The shared pages, served under an association's prefix by rewrite. */
const SHARED_SECTIONS = new Set([
  "dashboard",
  "admin",
  "super-admin",
  "account",
  "forgot-password",
  "reset-password",
  "pending-approval",
  "qr-invalid",
  "download",
  "in",
  "qr",
]);

/** Pages every association has its own copy of: /rta/login, /abc/install. */
const SITE_OWN_PAGES = new Set(["login", "install", "register"]);

const firstSegment = (path: string) => path.split(/[/?#]/)[1] ?? "";

/** "/rta" on any page of RTA's site, "" on the platform's own pages. */
export function sitePrefixOf(pathname: string): string {
  const slug = appSlugFromPath(pathname);
  return slug ? `/${slug}` : "";
}

/** True for a path that has a copy under every association's prefix. */
export function isSitePath(path: string): boolean {
  const segment = firstSegment(path);
  return SHARED_SECTIONS.has(segment) || SITE_OWN_PAGES.has(segment);
}

/**
 * /rta/dashboard/loans → { prefix: "/rta", inner: "/dashboard/loans" }: a
 * shared page reached under a prefix, and the page that serves it. Null for
 * anything else, /rta/login included — that one is a page of its own.
 */
export function splitSitePath(pathname: string): { prefix: string; inner: string } | null {
  const prefix = sitePrefixOf(pathname);
  if (!prefix) return null;
  const inner = pathname.slice(prefix.length);
  return SHARED_SECTIONS.has(firstSegment(inner)) ? { prefix, inner } : null;
}

/**
 * The page a path is, with the prefix taken off: what menus compare against
 * to know which item is open. /rta/dashboard/loans → /dashboard/loans.
 */
export function innerPath(pathname: string): string {
  return splitSitePath(pathname)?.inner ?? pathname;
}

/**
 * An app path as it should be linked from a page under `prefix`:
 * withSitePrefix("/dashboard", "/rta") → "/rta/dashboard". Already-prefixed
 * paths, external links, /api, assets and "/" — the platform's home, which
 * "powered by SSPSG" links to on purpose — pass through unchanged.
 */
export function withSitePrefix(href: string, prefix: string): string {
  if (!prefix || !href.startsWith("/") || href.startsWith("//")) return href;
  return isSitePath(href) ? prefix + href : href;
}
