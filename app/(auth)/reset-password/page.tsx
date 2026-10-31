import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.auth.reset.title,
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage() {
  const { d } = await getDashboardCopy();
  const copy = d.auth.reset;

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold text-ink">{copy.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        {copy.subtitle}
      </p>

      <Suspense fallback={<div className="mt-8 h-72" />}>
        <ResetPasswordForm />
      </Suspense>

      <p className="mt-8 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.backToSignIn}
        </Link>
      </p>
    </div>
  );
}
