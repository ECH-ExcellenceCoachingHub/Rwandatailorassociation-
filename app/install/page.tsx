import type { Metadata } from "next";
import { Suspense } from "react";
import InstallApp from "@/components/pwa/InstallApp";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * /install — the shareable page that puts the app on a member's phone.
 *
 * Stands outside the (auth) shell on purpose. That shell is built around a
 * form sitting in a white sheet on a light page, with a navy brand panel of its
 * own; this page is a single centred card — icon, one line of copy, the install
 * button — so there is nothing to read before the one action, and no brand
 * panel competing with the page it wraps.
 *
 * The service worker and the catch for Chrome's one-off install prompt are
 * registered by the root layout, so they behave here exactly as they do
 * everywhere else.
 *
 * `returnTo` comes from the install bar on other pages and is where "Continue
 * in the browser" sends the member afterwards, so it is validated the same way
 * a post-login `next` is, via safeRedirectPath.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.install.title} | RTA Savings & Loans`,
    description: d.auth.install.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const { d } = await getDashboardCopy();

  return (
    <Suspense fallback={<div className="min-h-[100svh] bg-footer" />}>
      <InstallApp
        copy={d.auth}
        returnTo={safeRedirectPath(Array.isArray(returnTo) ? returnTo[0] : returnTo) ?? undefined}
      />
    </Suspense>
  );
}
