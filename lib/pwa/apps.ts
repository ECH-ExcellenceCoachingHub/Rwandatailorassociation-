import {
  type Brand,
  PLATFORM_NAME,
  RESERVED_ASSOCIATION_CODES,
  RTA_BRAND,
} from "@/lib/brand";

/**
 * Which installable app a page offers. Every association is its own app — its
 * own name and icon on the home screen, opening on its own sign-in — and the
 * platform is one more, for the pages that belong to no association.
 *
 *   SSPSG   /manifest.webmanifest       /install       /icons/…
 *   RTA     /rta/manifest.webmanifest   /rta/install   /rta/icons/…
 *   ABC     /abc/manifest.webmanifest   /abc/install   /abc/icons/…
 *
 * A page belongs to an association when its first segment is one: that is the
 * only thing the inline install script (lib/pwa/install.ts) can know before
 * React loads, so the banner and the manifest link both decide it this way.
 * The shared pages — /login, /dashboard, /account — stay with the platform.
 *
 * Plain data, no database access: imported by client components.
 */

/** Same shape as an association code; see findSiteAssociation. */
const SITE_SEGMENT = /^[a-z]{2,8}$/i;

/** The association a path belongs to, lower-cased, or null for the platform's. */
export function appSlugFromPath(pathname: string): string | null {
  const segment = pathname.split("/")[1] ?? "";
  if (!SITE_SEGMENT.test(segment)) return null;
  if (RESERVED_ASSOCIATION_CODES.has(segment.toUpperCase())) return null;
  return segment.toLowerCase();
}

const base = (slug: string | null) => (slug ? `/${slug}` : "");

export const appManifestHref = (slug: string | null) => `${base(slug)}/manifest.webmanifest`;
export const appInstallHref = (slug: string | null) => `${base(slug)}/install`;
export const appIconHref = (slug: string | null, file: AppIconFile = "icon-192.png") =>
  `${base(slug)}/icons/${file}`;

/** The name under the icon: SSPSG, STGT for RTA, otherwise the code — the
 *  brand's mark, as associationBrand builds it. */
export function appName(slug: string | null): string {
  if (!slug) return PLATFORM_NAME;
  const code = slug.toUpperCase();
  return code === RTA_BRAND.key ? RTA_BRAND.mark : code;
}

/** Each app's "already installed" mark. The platform keeps the key it always
 *  had, so phones that installed it before keep being recognised. */
export const appInstalledKey = (slug: string | null) =>
  slug ? `rta-app-installed:${slug}` : "rta-app-installed";

/** The icon files every app serves, and the size each is drawn at. */
export const APP_ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "icon-maskable-512.png": { size: 512, maskable: true },
  "apple-touch-icon.png": { size: 180, maskable: false },
} as const;

export type AppIconFile = keyof typeof APP_ICONS;

/** What the install page needs to know about the app it installs. */
export interface InstallableApp {
  slug: string | null;
  /// Home-screen name, for the copy: "Install the STGT app".
  name: string;
  /// The short label beside the icon in the page's corner.
  label: string;
  icon: string;
  signInHref: string;
}

export function installableApp(brand: Brand): InstallableApp {
  const slug = brand.kind === "platform" ? null : brand.key.toLowerCase();
  return {
    slug,
    name: brand.mark,
    label: brand.titleSuffix,
    icon: appIconHref(slug),
    signInHref: brand.loginHref,
  };
}
