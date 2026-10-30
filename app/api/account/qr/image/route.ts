import { type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { getActiveQrCode } from "@/lib/auth/qr-access";
import { renderQrPng, renderQrSvg } from "@/lib/qr";
import { apiNotFound, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/account/qr/image?format=png|svg — downloads the caller's own code.
 *
 * A route handler rather than a data: URL on the page, for two reasons. A
 * member on a cheap Android phone gets a real file in their Downloads folder
 * that they can attach, print at a kiosk or set as a lock screen; and the
 * secret stays server-side, never reaching the page's HTML where a screenshot
 * of the source or a copy of the cached document would carry it.
 *
 * PNG is the default because it is what every phone, printer and messaging app
 * understands. SVG is offered for printing: a vector card scales to a wallet
 * card or an A4 sheet without the soft edges that make a scanner hesitate.
 */

// Contains a credential: never cached by a proxy, never prerendered.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiAuth();

  // No user id parameter, by design. The session decides whose code this is,
  // so there is no id to tamper with and no ownership check to forget.
  const code = await getActiveQrCode(context.user.id);
  if (!code) {
    return apiNotFound("You do not have an active QR code. Generate one first.");
  }

  const format = request.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";

  // Names the file after the person, so a printer queue with thirty of these
  // in it is still sortable.
  const slug =
    context.member?.memberNumber ??
    context.user.fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") ??
    "account";
  const filename = `signin-qr-${slug}.${format}`;

  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    // The image is a bearer credential; no shared cache may keep a copy.
    "Cache-Control": "no-store, private",
  };

  if (format === "svg") {
    return new Response(await renderQrSvg(code.url, { size: 1024 }), {
      headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  }

  const png = await renderQrPng(code.url, { size: 1024 });

  return new Response(new Uint8Array(png), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
});
