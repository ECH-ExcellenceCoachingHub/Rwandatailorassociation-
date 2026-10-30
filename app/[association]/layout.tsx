import type { Metadata } from "next";
import { PLATFORM_NAME } from "@/lib/brand";
import { findSite } from "@/lib/sites";

/**
 * Every hosted association's site: /abc, /abc/login, /abc/register. Created
 * the moment the super admin onboards the association — there is nothing to
 * build or deploy. The pages draw their own chrome; this layout names the
 * association at the end of every tab title.
 *
 * The share metadata is restated whole because the root layout's is RTA's, and
 * Next replaces these entries rather than merging them: left alone, a link to
 * /abc shared on WhatsApp would preview as "Rwanda Tailors Association".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ association: string }>;
}): Promise<Metadata> {
  const site = await findSite((await params).association);
  if (!site) return {};

  const description = `Savings and loans for members of ${site.name}.`;
  return {
    // Absolute, or the root's "| SSPSG" template would be appended to it.
    title: { absolute: site.name, template: `%s | ${site.code}` },
    description,
    keywords: [site.name, site.code, "savings", "loans", PLATFORM_NAME],
    openGraph: { title: site.name, description, type: "website" },
    twitter: { title: site.name, description },
    appleWebApp: { capable: true, title: site.code, statusBarStyle: "black-translucent" },
  };
}

export default function AssociationSiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
