import type { Metadata } from "next";
import { Suspense } from "react";
import InstallApp from "@/components/pwa/InstallApp";
import { getDashboardCopy } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.install.title} | RTA Savings & Loans`,
    description: d.auth.install.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function InstallPage() {
  const { d } = await getDashboardCopy();
  const copy = d.auth.install;

  return (
    <Suspense fallback={<div className="h-72" />}>
      <InstallApp copy={copy} />
    </Suspense>
  );
}