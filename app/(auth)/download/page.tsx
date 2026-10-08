import type { Metadata } from "next";
import { getDashboardCopy } from "@/lib/i18n/server";
import { InstallBanner } from "@/components/pwa/InstallBanner";

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

export default async function DownloadPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <InstallBanner variant="page" />
    </div>
  );
}