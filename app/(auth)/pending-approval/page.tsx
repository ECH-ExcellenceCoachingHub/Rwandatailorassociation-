import type { Metadata } from "next";
import Link from "next/link";
import { Clock, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { signInRedirectPath } from "@/lib/auth/guards";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ROLE_HOME } from "@/lib/auth/permissions";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.pendingApproval.title} | RTA Savings & Loans`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * Landing page for a member whose application has not yet been approved.
 *
 * Shown instead of the dashboard, which would otherwise be a wall of zeroes
 * with no explanation. Their payment reference is displayed here too, so they
 * can note it down while they wait.
 */
export default async function PendingApprovalPage() {
  const context = await getAuthContext();

  if (!context) redirect(signInRedirectPath());

  // Approved in the meantime — send them where they belong.
  if (context.member && context.member.status !== "PENDING_APPROVAL") {
    redirect(ROLE_HOME[context.user.role]);
  }
  if (!context.member) {
    redirect(ROLE_HOME[context.user.role]);
  }

  const { d } = await getDashboardCopy();
  const copy = d.auth.pendingApproval;

  return (
    <div>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-gold/15 text-amber-700">
        <Clock className="size-7" aria-hidden="true" />
      </span>

      <h1 className="mt-6 font-heading text-3xl font-bold text-ink">
        {copy.title}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        {fill(copy.body, { name: context.user.firstName })}
      </p>

      <dl className="mt-8 space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {copy.membershipNumber}
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold text-ink">
            {context.member.memberNumber}
          </dd>
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-primary-hover">
            {copy.paymentReference}
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold text-primary-hover">
            {context.member.paymentReference}
          </dd>
        </div>
      </dl>

      <Alert variant="info" className="mt-6">
        {copy.keepReference}
      </Alert>

      <form action="/api/auth/logout" method="post" className="mt-8">
        <Button asChild variant="outline" className="w-full">
          <Link href="/">
            <LogOut className="size-4" aria-hidden="true" />
            {copy.backToWebsite}
          </Link>
        </Button>
      </form>
    </div>
  );
}
