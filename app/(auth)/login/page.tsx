import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.login.title} | RTA Savings & Loans`,
    description: d.auth.login.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage() {
  const { d } = await getDashboardCopy();
  const copy = d.auth.login;

  return (
    <div>
      <h1 className="sr-only">{copy.title}</h1>

      {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
      <Suspense fallback={<div className="h-72" />}>
        <LoginForm />
      </Suspense>

      <p className="mt-8 text-center text-sm text-ink-muted">
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
