import type { Locale } from "@/types";

/**
 * Who a page belongs to — the platform, or one of the associations on it.
 *
 * THREE KINDS OF SITE, ONE DEPLOYMENT.
 *
 *   SSPSG    Smart Saving for Private Sector Growth — the platform, and the
 *            root of the deployment: /, /login, the installed app. The super
 *            admin runs every association from here, and the shared account
 *            pages (/forgot-password, the QR and sign-in links) live here too.
 *   RTA      the first association, at /rta like every other — but with the
 *            hand-built website it had before SSPSG existed (app/rta), rather
 *            than the generated one. Old root links (/register, /news) redirect.
 *   others   every association onboarded since. Each gets /abc, /abc/login and
 *            /abc/register the moment it is created, branded from its own
 *            Association row.
 *
 * Every association says "powered by SSPSG"; that is how the platform stays
 * visibly in charge of sites that otherwise carry the association's own name.
 *
 * Plain data, no database access: imported by client components and scripts.
 *
 * WHAT DELIBERATELY STILL SAYS "rta". Some strings look like branding but are
 * identifiers that existing data depends on, and renaming them would break
 * things already in people's hands:
 *
 *   rta_session, rta-savings/rta-dashboard   session cookie and JWT issuer —
 *                                            renaming signs everyone out
 *   rta-qr-access-v1, rta-sign-in-link-v1    key-derivation salts — renaming
 *                                            voids every printed card's QR
 *   RTA-BACKUP 1, rta-backup-*.rtabak        backup archive header and name —
 *                                            renaming orphans old backups
 *   rta-locale, rta-register-draft, …        browser storage keys
 *   RTA-M000123, RTA-000123                  the RTA association's own code,
 *                                            stored on every member
 *
 * Leave those alone unless a migration for them is written at the same time.
 */

export const PLATFORM_NAME = "SSPSG";

export const PLATFORM_FULL_NAME = "Smart Saving for Private Sector Growth";

/// Both together, for the places with room for it.
export const PLATFORM_TITLE = `${PLATFORM_NAME} — ${PLATFORM_FULL_NAME}`;

/**
 * The association a link that names none means. Every registration link handed
 * out before SSPSG hosted more than one association is a bare /register, and
 * those must keep enrolling into RTA — now by redirecting to /rta/register.
 */
export const DEFAULT_ASSOCIATION_CODE = "RTA";

export interface Brand {
  /// "SSPSG", or the association's code.
  key: string;
  kind: "platform" | "association";
  /// The word in the lockup: "STGT" for RTA's savings programme, "SSPSG", or
  /// an association's code.
  mark: string;
  /// The full name, for the copyright line and the home link's label.
  name: string;
  tagline: Record<Locale, string>;
  /// Null draws a lettered badge instead (see BrandMark).
  logo: string | null;
  /// What browser tab titles end with: "Sign in | RTA".
  titleSuffix: string;
  homeHref: string;
  loginHref: string;
  /// Null where there is nothing to join — the platform itself.
  registerHref: string | null;
  /// Every association says it runs on SSPSG; the platform itself does not.
  poweredBy: boolean;
}

export const PLATFORM_BRAND: Brand = {
  key: PLATFORM_NAME,
  kind: "platform",
  mark: PLATFORM_NAME,
  name: PLATFORM_TITLE,
  tagline: { en: PLATFORM_FULL_NAME, rw: PLATFORM_FULL_NAME },
  logo: null,
  titleSuffix: PLATFORM_NAME,
  homeHref: "/",
  loginHref: "/login",
  registerHref: null,
  poweredBy: false,
};

/** RTA's site: its own artwork and STGT programme name, at /rta. */
export const RTA_BRAND: Brand = {
  key: "RTA",
  kind: "association",
  mark: "STGT",
  name: "Rwanda Tailors Association",
  tagline: { en: "Save today, grow tomorrow", rw: "Zigama uyu munsi, ukure ejo" },
  logo: "/images/rtalogo.jpg",
  titleSuffix: "RTA",
  homeHref: "/rta",
  loginHref: "/rta/login",
  registerHref: "/rta/register",
  poweredBy: true,
};

/**
 * The brand of one association. RTA's is fixed above; every other
 * association's is built from its row, so a newly onboarded one is branded
 * without anyone writing code.
 */
export function associationBrand(association: {
  code: string;
  name: string;
  logoUrl?: string | null;
}): Brand {
  if (association.code === RTA_BRAND.key) return RTA_BRAND;

  const slug = association.code.toLowerCase();
  return {
    key: association.code,
    kind: "association",
    mark: association.code,
    name: association.name,
    tagline: { en: association.name, rw: association.name },
    logo: association.logoUrl ?? null,
    titleSuffix: association.code,
    homeHref: `/${slug}`,
    loginHref: `/${slug}/login`,
    registerHref: `/${slug}/register`,
    poweredBy: true,
  };
}

/**
 * Codes no association may take, because each is also a top-level address on
 * the platform (/login, /admin, /install…), would be confused with one, or is
 * kept for redirects from RTA's old root pages (/news, /register).
 * Checked at onboarding; see lib/validation/associations.ts.
 */
export const RESERVED_ASSOCIATION_CODES = new Set([
  "ACCOUNT",
  "ADMIN",
  "API",
  "APP",
  "DASHBOARD",
  "DOWNLOAD",
  "HELP",
  "ICONS",
  "IMAGES",
  "IN",
  "INSTALL",
  "LOGIN",
  "LOGOUT",
  "NEWS",
  "NOT",
  "PLATFORM",
  "QR",
  "REGISTER",
  "SSPSG",
  "STATIC",
  "SUPPORT",
  "SYSTEM",
]);
