import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MetadataRoute } from "next";
import { ImageResponse } from "next/og";
import { type Brand, PLATFORM_BRAND } from "@/lib/brand";
import { findAppBrand } from "@/lib/sites";
import {
  APP_ICONS,
  type AppIconFile,
  appIconHref,
  appManifestHref,
} from "@/lib/pwa/apps";

/**
 * The responses behind each app's manifest and icons (see lib/pwa/apps.ts).
 * The route files only say whose app they serve: the platform's at the root,
 * RTA's under app/rta, every other association's under app/[association].
 */

const THEME = "#0b1b33";

function buildManifest(brand: Brand): MetadataRoute.Manifest {
  const slug = brand.kind === "platform" ? null : brand.key.toLowerCase();
  return {
    // The platform keeps "/", the id its installs have always had, so phones
    // that installed it before update in place. Each association's id is its
    // own, which is what lets Chrome install it as a separate app.
    id: slug ? `/${slug}/` : "/",
    name: slug ? brand.name : PLATFORM_BRAND.name,
    short_name: brand.mark,
    description: slug
      ? `Savings and loans for members of ${brand.name}.`
      : "Savings and loans for members of private-sector associations.",
    // The sign-in, not the marketing site: a member already signed in is sent
    // on to their own landing page by the middleware.
    start_url: brand.loginHref,
    // The whole site, association or not: the dashboard every member lands on
    // is shared, and it must open inside the app rather than in a browser bar.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME,
    theme_color: THEME,
    // Lets Chrome answer navigator.getInstalledRelatedApps() for this very
    // app, so /install can tell someone it is already on their phone.
    related_applications: [{ platform: "webapp", url: appManifestHref(slug) }],
    icons: [
      { src: appIconHref(slug, "icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: appIconHref(slug, "icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: appIconHref(slug, "icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

function manifestJson(brand: Brand) {
  return new Response(JSON.stringify(buildManifest(brand)), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export function platformManifest() {
  return manifestJson(PLATFORM_BRAND);
}

export async function associationManifest(slug: string) {
  const brand = await findAppBrand(slug);
  return brand ? manifestJson(brand) : new Response("Not found", { status: 404 });
}

/**
 * The logo as a data URL Satori can draw, or null to fall back to initials.
 * Files under /public are read from disk — RTA's logo among them — and
 * anything else is fetched. Only PNG and JPEG: Satori draws nothing else.
 */
async function loadLogo(logo: string | null, origin: string): Promise<string | null> {
  if (!logo) return null;

  const typeOf = (name: string) =>
    /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : null;

  if (logo.startsWith("/") && !logo.startsWith("//")) {
    const publicDir = path.join(process.cwd(), "public");
    const file = path.join(publicDir, path.normalize(logo));
    const type = typeOf(file);
    if (type && file.startsWith(publicDir + path.sep)) {
      try {
        return `data:${type};base64,${(await readFile(file)).toString("base64")}`;
      } catch {
        // Not a public file — perhaps a stored upload; try fetching it.
      }
    }
  }

  try {
    const response = await fetch(new URL(logo, origin), { signal: AbortSignal.timeout(5000) });
    const type = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!response.ok || (type !== "image/png" && type !== "image/jpeg")) return null;
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * One of an association's home-screen icons, drawn from its logo: the logo on
 * white, or its initials on navy where it has none — the same choice
 * BrandMark makes on the page. Maskable icons keep the art inside the safe
 * circle Android crops to.
 */
export async function associationIcon(slug: string, file: string, origin: string) {
  const spec = APP_ICONS[file as AppIconFile];
  const brand = spec ? await findAppBrand(slug) : null;
  if (!spec || !brand) return new Response("Not found", { status: 404 });

  const { size, maskable } = spec;
  const logo = await loadLogo(brand.logo, origin);
  // Logos are round art with a margin of their own (RTA's is), so the plain
  // icon fills the square; the maskable one stays inside Android's 80% circle.
  const art = Math.round(size * (maskable ? 0.8 : 1));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: logo ? "#ffffff" : THEME,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn by Satori, not the browser
          <img
            src={logo}
            alt=""
            width={art}
            height={art}
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              color: "#ffffff",
              fontSize: Math.round(art * 0.42),
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {brand.mark.slice(0, 2)}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    }
  );
}
