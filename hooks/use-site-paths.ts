"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { innerPath, sitePrefixOf, withSitePrefix } from "@/lib/site-paths";

/**
 * React's view of lib/site-paths.ts: the prefix of the page being looked at,
 * and a router and pathname that respect it.
 */

/** "/rta" while looking at RTA's site, "" on the platform's own pages. */
export function useSitePrefix(): string {
  return sitePrefixOf(usePathname() ?? "");
}

/** The page, prefix taken off — what menus and breadcrumbs compare against. */
export function useSitePathname(): string {
  return innerPath(usePathname() ?? "");
}

/**
 * useRouter, with push, replace and prefetch keeping the site's prefix:
 * router.push("/dashboard") on /rta/admin goes to /rta/dashboard.
 */
export function useSiteRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const prefix = useSitePrefix();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => router.push(withSitePrefix(href, prefix), options),
      replace: (href, options) => router.replace(withSitePrefix(href, prefix), options),
      prefetch: (href, options) => router.prefetch(withSitePrefix(href, prefix), options),
    }),
    [router, prefix]
  );
}
