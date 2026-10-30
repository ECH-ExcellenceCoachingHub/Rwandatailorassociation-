import type { Metadata } from "next";
import { PLATFORM_BRAND, PLATFORM_TITLE } from "@/lib/brand";
import { getPlatformStats, listPublicAssociations } from "@/lib/services/associations";
import { getDashboardCopy } from "@/lib/i18n/server";
import { SiteFooter, SiteHeader } from "@/components/sites/SiteChrome";
import { PlatformHero } from "@/components/sites/PlatformHero";
import { ClosingCta, FeatureBento, HowItWorks, StatsBand } from "@/components/sites/PlatformSections";
import { AssociationDirectory } from "@/components/sites/AssociationDirectory";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: { absolute: PLATFORM_TITLE }, description: d.sites.platform.description };
}

/**
 * The platform's home: what SSPSG is, and a door to every association on it.
 *
 * The directory is the point. Someone who has heard of their association but
 * not its address finds it here — the hero's first button goes straight to it —
 * and each card links to that association's own site, sign-in and application,
 * RTA's included, at its root pages.
 *
 * The figures in the hero's product illustration are samples; the only live
 * numbers on the page are the stats band's counts, and never money.
 */
export default async function PlatformHomePage() {
  const [{ d, locale }, associations, stats] = await Promise.all([
    getDashboardCopy(),
    listPublicAssociations(),
    getPlatformStats(),
  ]);
  const copy = d.sites.platform;

  return (
    <div className="motion-safe-platform flex min-h-screen flex-col overflow-x-clip bg-background">
      <SiteHeader brand={PLATFORM_BRAND} locale={locale} signInLabel={copy.signIn} />

      <main className="flex-1">
        <PlatformHero copy={copy} />
        <StatsBand copy={copy} stats={stats} locale={locale} />
        <HowItWorks copy={copy} />
        <FeatureBento copy={copy} />
        <AssociationDirectory associations={associations} copy={copy} />
        <ClosingCta copy={copy} />
      </main>

      <SiteFooter brand={PLATFORM_BRAND} />
    </div>
  );
}
