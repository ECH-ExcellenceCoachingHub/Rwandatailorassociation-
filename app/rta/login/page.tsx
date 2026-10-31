import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { RTA_BRAND } from "@/lib/brand";
import { getDashboardCopy } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.auth.login.title,
    description: d.auth.login.subtitle,
    robots: { index: false, follow: false },
  };
}

/**
 * /rta/login — RTA's sign-in, with the STGT lockup its members know. The same
 * account system as every other sign-in; only the name on the door differs.
 */
export default async function RtaLoginPage() {
  const { d } = await getDashboardCopy();
  const copy = d.auth.login;

  return (
    <AuthShell brand={RTA_BRAND}>
      <h1 className="sr-only">{copy.title}</h1>

      {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
      <Suspense fallback={<div className="h-72" />}>
        <LoginForm />
      </Suspense>

      <p className="mt-8 text-center text-sm text-ink-muted">
        {copy.notAMember}{" "}
        <Link
          href={RTA_BRAND.registerHref ?? "/rta/register"}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {copy.applyToJoin}
        </Link>
      </p>
    </AuthShell>
  );
}
