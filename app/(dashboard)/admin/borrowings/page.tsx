import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { CalendarClock, EyeOff, Landmark, Percent, Scale } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listBorrowings, LIVE_BORROWING_STATUSES } from "@/lib/services/borrowings";
import {
  borrowingAgainstSavings,
  getBorrowingHeadline,
} from "@/lib/services/association-finances";
import { prisma } from "@/lib/db/prisma";
import { formatMoney, toMoneyString } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import {
  NewBorrowingButton,
  RepaymentButton,
  VisibilityToggle,
} from "@/components/dashboard/BorrowingForm";

/**
 * The association's own debt, from the committee's side.
 *
 * Every card here has a twin on /dashboard/association, and the copy says so
 * repeatedly. An administrator entering a purpose or hiding a facility should
 * be aware, at the moment they do it, that the audience is the membership.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.admin.borrowings.title };
}

export const dynamic = "force-dynamic";

export default async function AdminBorrowingsPage() {
  const context = await requirePermission(PERMISSIONS.BORROWINGS_VIEW, "/admin/borrowings");
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.borrowings;

  const [facilities, headline, savings] = await Promise.all([
    // Unpublished included: this is the screen where a withheld facility has to
    // be visible, or it can never be published again.
    listBorrowings(associationId, { includeUnpublished: true }),
    getBorrowingHeadline(associationId),
    prisma.savingsAccount.aggregate({
      where: { ...(associationId ? { associationId } : {}), isActive: true },
      _sum: { balance: true },
    }),
  ]);

  const currency = context.association?.currency ?? "RWF";
  const canManage = context.permissions.has(PERMISSIONS.BORROWINGS_MANAGE);

  const pledgedPercent = borrowingAgainstSavings(
    headline.outstanding,
    toMoneyString(savings._sum.balance ?? 0)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={canManage ? <NewBorrowingButton /> : undefined}
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.totalOwed}
          value={formatMoney(headline.outstanding, { currency })}
          hint={pluralize(copy.totalOwedHint, headline.liveFacilities, {
            count: headline.liveFacilities,
          })}
          icon={Landmark}
          tone={headline.overdueFacilities > 0 ? "danger" : "default"}
        />

        <StatCard
          label={copy.facilities}
          value={String(facilities.length)}
          hint={pluralize(copy.totalOwedHint, headline.liveFacilities, {
            count: headline.liveFacilities,
          })}
          icon={Scale}
        />

        <StatCard
          label={copy.nextPayment}
          value={
            headline.nextPaymentDue
              ? formatDate(headline.nextPaymentDue, locale)
              : "—"
          }
          hint={headline.nextPaymentDue ? undefined : copy.nothingDue}
          icon={CalendarClock}
        />

        <StatCard
          label={copy.pledged}
          value={pledgedPercent !== null ? `${pledgedPercent}%` : "—"}
          hint={copy.pledgedHint}
          icon={Percent}
          // Borrowing more than about half the members' savings is the point at
          // which the association is exposed rather than merely leveraged.
          tone={pledgedPercent !== null && pledgedPercent > 50 ? "warning" : "default"}
        />
      </StatGrid>

      <Alert variant="info">
        {copy.memberViewNote}{" "}
        <Link href="/dashboard/association" className="font-semibold underline">
          {d.nav.ourMoney}
        </Link>
      </Alert>

      {facilities.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={copy.noneTitle}
          description={copy.noneBody}
          action={canManage ? <NewBorrowingButton /> : undefined}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {facilities.map((facility) => {
            const isLive = (LIVE_BORROWING_STATUSES as readonly string[]).includes(
              facility.status
            );

            return (
              <article
                key={facility.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <header className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-heading text-lg font-semibold text-ink">
                      {facility.lenderName}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">
                      {facility.reference} ·{" "}
                      {statusLabel(facility.lenderType, d.status)}
                      {facility.lenderReference && ` · ${facility.lenderReference}`}
                    </p>
                  </div>
                  <StatusBadge status={facility.status} size="sm" />
                </header>

                {!facility.isPublic && (
                  <Alert variant="warning" className="mb-4">
                    <span className="inline-flex items-start gap-2">
                      <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {copy.hiddenWarning}
                    </span>
                  </Alert>
                )}

                <p className="mb-4 text-sm leading-relaxed text-ink-muted">
                  {facility.purpose}
                </p>

                <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Cell
                    label={copy.principal}
                    value={formatMoney(facility.principal, {
                      currency: facility.currency,
                      showSymbol: false,
                    })}
                  />
                  <Cell
                    label={copy.repaid}
                    value={formatMoney(facility.totalRepaid, {
                      currency: facility.currency,
                      showSymbol: false,
                    })}
                  />
                  <Cell
                    label={copy.outstanding}
                    value={formatMoney(facility.outstanding, {
                      currency: facility.currency,
                      showSymbol: false,
                    })}
                  />
                  <Cell
                    label={copy.rate}
                    value={`${facility.interestRate}%`}
                    hint={pluralize(copy.termMonths, facility.termMonths, {
                      count: facility.termMonths,
                    })}
                  />
                </dl>

                <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
                  <Cell
                    label={copy.interestPortion}
                    value={formatMoney(facility.interestPaid, {
                      currency: facility.currency,
                      showSymbol: false,
                    })}
                  />
                  <Cell
                    label={copy.feesPortion}
                    value={formatMoney(facility.feesPaid, {
                      currency: facility.currency,
                      showSymbol: false,
                    })}
                  />
                  {facility.nextPaymentDue && (
                    <Cell
                      label={copy.nextPayment}
                      value={formatDate(facility.nextPaymentDue, locale)}
                    />
                  )}
                  {facility.maturityDate && (
                    <Cell
                      label={copy.matures}
                      value={formatDate(facility.maturityDate, locale)}
                    />
                  )}
                </dl>

                {facility.collateralDescription && (
                  <p className="mb-4 rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed text-ink-muted">
                    <span className="font-semibold">{copy.security}: </span>
                    {facility.collateralDescription}
                    {facility.collateralAmount &&
                      ` · ${formatMoney(facility.collateralAmount, {
                        currency: facility.currency,
                      })}`}
                  </p>
                )}

                {facility.fundedInvestments.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      {copy.fundedProjects}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {facility.fundedInvestments.map((project) => (
                        <li
                          key={project.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 truncate text-ink">
                            {project.title}
                          </span>
                          <span className="shrink-0 tabular-nums text-ink-muted">
                            {formatMoney(project.amountInvested, {
                              currency: facility.currency,
                              showSymbol: false,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {canManage && (
                  <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {isLive && (
                      <RepaymentButton
                        borrowingId={facility.id}
                        reference={facility.reference}
                        outstanding={facility.outstanding}
                        currency={facility.currency}
                      />
                    )}
                    <VisibilityToggle
                      borrowingId={facility.id}
                      isPublic={facility.isPublic}
                    />
                    <span className="ml-auto text-xs text-ink-muted">
                      {facility.repaidPercent}% {copy.repaid}
                    </span>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-heading text-sm font-bold tabular-nums text-ink">
        {value}
      </dd>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
