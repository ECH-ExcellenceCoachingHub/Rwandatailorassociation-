import { NextResponse } from "next/server";

/**
 * A redirect whose Location is a root-relative path, e.g. "/login?next=%2Fadmin".
 *
 * WHY NOT `NextResponse.redirect(new URL(path, request.url))`: behind Render's
 * proxy the server only sees the address it is bound to, so `request.url` is
 * https://0.0.0.0:10000/... and the browser gets sent somewhere it cannot
 * reach. A relative Location is resolved by the browser against the address it
 * is actually on, whatever the proxy, domain or port.
 *
 * `path` must be a trusted root-relative path — run anything user-supplied
 * through safeRedirectPath first.
 */
export function relativeRedirect(path: string, status = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
