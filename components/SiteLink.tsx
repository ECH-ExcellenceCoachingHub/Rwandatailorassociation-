"use client";

import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { useSitePrefix } from "@/hooks/use-site-paths";
import { withSitePrefix } from "@/lib/site-paths";

/**
 * next/link that keeps the site's prefix: <Link href="/dashboard"> drawn on
 * /rta/admin points at /rta/dashboard, and on a page with no prefix stays
 * /dashboard (lib/site-paths.ts). Every in-app link goes through this, so the
 * pages can keep writing the plain paths they are built at.
 */
const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(
  function SiteLink({ href, ...props }, ref) {
    const prefix = useSitePrefix();
    return (
      <NextLink
        ref={ref}
        href={typeof href === "string" ? withSitePrefix(href, prefix) : href}
        {...props}
      />
    );
  }
);

export default Link;
