import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { toLocalPhone } from "@/lib/phone";
import { phoneFromSignInLinkToken } from "@/lib/auth/sign-in-link";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * /in/:token — the sign-in link an admin copies from the member register.
 *
 * Deliberately bare: outside the (auth) layout, so there is no brand panel,
 * no navigation and no language switch — just the member's number, already
 * filled in, and a box for their password. The number is encrypted in the
 * token (lib/auth/sign-in-link.ts); the password is still required.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.login.title} | STGT`,
    robots: { index: false, follow: false },
  };
}

export default async function PhoneSignInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const phone = phoneFromSignInLinkToken(token);
  if (!phone) redirect("/login");

  const { d } = await getDashboardCopy();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <h1 className="sr-only">{d.auth.login.title}</h1>
        {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
        <Suspense fallback={<div className="h-56" />}>
          <LoginForm presetPhone={toLocalPhone(phone)} />
        </Suspense>
      </div>
    </main>
  );
}
