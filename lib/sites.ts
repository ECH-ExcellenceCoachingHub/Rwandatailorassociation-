import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { RTA_BRAND, associationBrand } from "@/lib/brand";
import { findSiteAssociation } from "@/lib/services/associations";

/**
 * Resolving /abc to the association whose site it is.
 *
 * Cached per request, because the layout's metadata, the layout and the page
 * all ask for the same row.
 */
const loadSite = cache(findSiteAssociation);

/**
 * RTA's site is the hand-built one in app/rta. Lower-case /rta reaches it
 * directly (a static segment beats [association]); this catches the other
 * spellings, /RTA and /Rta, which routing treats as a different path.
 */
export function isRtaSite(slug: string): boolean {
  return slug.toUpperCase() === RTA_BRAND.key;
}

/**
 * The association and brand for a site page, or a 404 for a code that is not
 * an active association.
 *
 * `rtaPath` is this page's address on RTA's own site, so /RTA/login goes to
 * /rta/login rather than drawing RTA as a generated site.
 */
export async function requireSite(slug: string, rtaPath: string) {
  if (isRtaSite(slug)) redirect(rtaPath);

  const association = await loadSite(slug);
  if (!association) notFound();

  return { association, brand: associationBrand(association) };
}

/** The same lookup, without the redirect or 404, for metadata and layouts. */
export async function findSite(slug: string) {
  if (isRtaSite(slug)) return null;
  return loadSite(slug);
}
