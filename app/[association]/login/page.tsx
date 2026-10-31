import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { requireSite } from "@/lib/sites";
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
 * /abc/login — the association's own sign-in, in its own colours.
 *
 * There is one account system behind every sign-in page: a phone number or
 * email belongs to exactly one person on the platform, so this page signs
 * anyone in and the session takes them to their own association's dashboard.
 * What changes per association is only whose name is on the door.
 */
export default async function AssociationLoginPage({
  params,
}: {
  params: Promise<{ association: string }>;
}) {
  const { brand } = await requireSite((await params).association, "/rta/login");
  const { d } = await getDashboardCopy();
  const copy = d.auth.login;

  return (
    <AuthShell brand={brand}>
      <h1 className="sr-only">{copy.title}</h1>

      {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
      <Suspense fallback={<div className="h-72" />}>
        <LoginForm />
      </Suspense>

      {brand.registerHref && (
        <p className="mt-8 text-center text-sm text-ink-muted">
          {copy.notAMember}{" "}
          <Link
            href={brand.registerHref}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {copy.applyToJoin}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
