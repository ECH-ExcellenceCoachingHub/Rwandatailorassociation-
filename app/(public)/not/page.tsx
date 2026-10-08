import type { Metadata } from "next";
import Link from "next/link";
import { getDashboardCopy } from "@/lib/i18n/server";
import { InstallBanner } from "@/components/pwa/InstallBanner";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.login.title} | RTA Savings & Loans`,
    description: d.auth.login.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function NotPage() {
  const { d } = await getDashboardCopy();
  const copy = d.auth.login;

  return (
    <div className="text-center">
      <InstallBanner />
      <h1 className="font-heading text-3xl font-bold text-ink mb-4">{copy.title}</h1>
      <p className="text-ink-muted max-w-md mx-auto mb-8">{copy.subtitle}</p>

      <p className="text-sm text-ink-muted">
        {copy.notAMember}{" "}
        <Link
          href="/register"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {copy.applyToJoin}
        </Link>
      </p>
    </div>
  );
}