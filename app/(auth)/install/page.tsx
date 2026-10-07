import type { Metadata } from "next";
import InstallApp from "@/components/pwa/InstallApp";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * The link to share with members: /install. Opening it on a phone offers to
 * put the STGT app on the home screen, using whichever route that phone's
 * browser allows (see InstallApp). The install banner on every other page
 * links here. Not in the middleware's AUTH_ROUTES on
 * purpose — a signed-in member may want to install the app too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.install.title} | STGT`,
    description: d.auth.install.subtitle,
    openGraph: {
      title: d.auth.install.title,
      description: d.auth.install.subtitle,
      images: ["/icons/icon-512.png"],
    },
  };
}

export default async function InstallPage() {
  const { d } = await getDashboardCopy();
  return <InstallApp copy={d.auth.install} />;
}
