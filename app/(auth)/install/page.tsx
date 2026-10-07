import type { Metadata } from "next";
import InstallApp from "@/components/pwa/InstallApp";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * The link to share with members: /install. Opening it on a phone offers to
 * put the STGT app on the home screen, using whichever route that phone's
 * browser allows (see InstallApp). Not in the middleware's AUTH_ROUTES on
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
  return (
    <>
      {/* Runs as the HTML parses, before React loads. Registering the service
          worker here rather than after hydration lets Chrome judge the site
          installable seconds sooner, and the install prompt it then fires is
          not repeated, so it is caught here for InstallApp to pick up. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});" +
            "if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});",
        }}
      />
      <InstallApp copy={d.auth.install} />
    </>
  );
}
