import type { Metadata } from "next";
import Link from "next/link";
import { QrCode, ShieldCheck } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDateTime } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { getActiveQrCode } from "@/lib/auth/qr-access";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.member.security.title,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const context = await requireAuth("/account/password");
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.security;

  const [sessions, recentLogins, qrCode] = await Promise.all([
    prisma.session.count({
      where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.loginActivity.findMany({
      where: { userId: context.user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        success: true,
        failureReason: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    }),
    getActiveQrCode(context.user.id),
  ]);

  const forced = params.required === "1" || context.user.mustChangePassword;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {forced && (
        <Alert variant="warning" title={copy.forcedTitle}>
          {copy.forcedBody}
        </Alert>
      )}

      <ChangePasswordForm />

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          {copy.activeSessions}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {pluralize(copy.sessionsCount, sessions)} {copy.sessionsWarning}
        </p>
      </section>

      {/* A second way into this account deserves to be visible on the page
          where someone checks their security, not only on the page where they
          created it. Someone reviewing "who can get in" must be able to see
          that a scannable card exists, and switch it off from here. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
          <QrCode className="size-4 text-primary" aria-hidden="true" />
          {d.account.qr.title}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {qrCode
            ? fill(d.account.qr.validUntil, {
                date: formatDateTime(qrCode.expiresAt, locale),
              })
            : d.account.qr.noCodeTitle}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/account/qr">
            {qrCode ? d.account.qr.regenerate : d.account.qr.generate}
          </Link>
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.recentActivity}
        </h2>

        <ul className="mt-4 divide-y divide-border">
          {recentLogins.map((entry, index) => (
            <li key={index} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    entry.success ? "text-ink" : "text-red-600"
                  }`}
                >
                  {entry.success ? copy.successfulSignIn : copy.failedAttempt}
                  {!entry.success && entry.failureReason && (
                    <span className="ml-1 font-normal text-ink-muted">
                      ({entry.failureReason.toLowerCase().replace(/_/g, " ")})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {entry.ipAddress ?? copy.unknownIp}
                  {entry.userAgent && ` · ${entry.userAgent.slice(0, 60)}`}
                </p>
              </div>
              <time className="whitespace-nowrap text-xs text-ink-muted">
                {formatDateTime(entry.createdAt, locale)}
              </time>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">{copy.warning}</p>
      </section>
    </div>
  );
}
