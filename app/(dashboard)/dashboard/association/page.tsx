import type { Metadata } from "next";
import {
  Banknote,
  Building2,
  HandCoins,
  Landmark,
  PiggyBank,
  Scale,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import {
  borrowingAgainstSavings,
  getAssociationFinances,
} from "@/lib/services/association-finances";
import { formatMoney, gt, isZero } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { MonthlyBarChart } from "@/components/dashboard/charts/SavingsChart";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { FundsAllocationBar } from "@/components/dashboard/FundsAllocationBar";
import { PoolDeductionCard } from "@/components/dashboard/PoolDeductionCard";
import { listPoolDeductions } from "@/lib/services/pool-deductions";

/**
 * THE MEMBERS' VIEW OF THE ASSOCIATION'S BOOKS.
 *
 * Behind `requireMember` and nothing more. Every member sees this, in full,
 * without a permission being granted to them — which is the design decision
 * the whole page rests on. The money belongs to them; being shown what it is
 * doing is not a privilege the committee extends.
 *
 * The order of the page is the order of the questions a member actually asks,
 * in the order they ask them: how much have we got, what is my part of it,
 * where has it gone, what did we earn, who do we owe, and what did it buy.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.member.association.title };
}

// Never cached: a member reading this the morning after a general meeting must
// see the figures as they now stand.
export const dynamic = "force-dynamic";

export default async function AssociationFinancesPage() {
  const context = await requireMember("/dashboard/association");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.association;

  const associationId = context.user.associationId;

  const [data, deductions] = associationId
    ? await Promise.all([
        getAssociationFinances(associationId, { memberId: context.member!.id }),
        listPoolDeductions(associationId, { memberId: context.member!.id }),
      ])
    : [null, []];

  // Defensive only: a MEMBER-role account always belongs to an association, so
  // reaching here means the account is broken rather than that the association
  // has nothing to show. The member's own "account not set up" wording is the
  // right register for it — an administrator's would not be.
  if (!data) {
    return (
      <EmptyState
        icon={Building2}
        title={d.member.overview.noAccountTitle}
        description={d.member.overview.noAccountBody}
      />
    );
  }

  const { association, position, surplus, yourStake, borrowings, investments } = data;
  const currency = association.currency;
  const money = (value: string) => formatMoney(value, { currency });

  const pledgedPercent = borrowingAgainstSavings(
    position.bankBorrowing,
    position.memberSavings
  );

  const hasBorrowing = gt(position.bankBorrowing, 0);

  return (
    <div className="space-y-7">
      {/* The association's own name, not "Our association's money" — the
          reader knows which association they belong to, and seeing it named is
          what makes the figures below feel like theirs. */}
      <PageHeader title={association.name} description={copy.description} />

      {position.booksIncomplete && (
        <Alert variant="warning" title={copy.booksIncompleteTitle}>
          {copy.booksIncompleteBody}
        </Alert>
      )}

      {/* 1. How much have we got? */}
      <StatGrid columns={4}>
        <StatCard
          label={copy.pool}
          value={money(position.memberSavings)}
          hint={fill(copy.poolHint, { count: position.savingMembers })}
          icon={PiggyBank}
          tone="primary"
        />

        {/* Principal, not principal-plus-interest: this tile says how much
            of the association's money is out with members, and interest they
            have been charged but not yet paid never left. The full obligation
            is one line down, where it cannot be mistaken for cash. */}
        <StatCard
          label={copy.lentOut}
          value={money(position.lentToMembers)}
          hint={`${fill(copy.lentOutHint, {
            count: position.activeLoans,
          })} · ${fill(copy.lentOutOwed, {
            amount: money(position.owedByMembers),
          })}`}
          icon={HandCoins}
        />

        <StatCard
          label={copy.borrowed}
          value={money(position.bankBorrowing)}
          hint={
            hasBorrowing
              ? fill(copy.borrowedHint, { count: position.liveFacilities })
              : copy.noBorrowingHint
          }
          icon={Landmark}
          // Debt is not bad news in itself — an association borrows to lend
          // more — so this is only toned as a warning when there is any.
          tone={hasBorrowing ? "warning" : "default"}
        />

        <StatCard
          label={surplus.isPositive ? copy.surplus : copy.loss}
          value={money(surplus.net)}
          hint={surplus.isPositive ? copy.surplusHint : copy.lossHint}
          icon={TrendingUp}
          tone={surplus.isPositive ? "success" : "danger"}
        />
      </StatGrid>

      {/* 2. What is my part of it? */}
      {yourStake && (
        <section className="rounded-2xl border border-primary/25 bg-primary-50/60 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Scale className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-base font-semibold text-ink">
                {copy.yourStakeTitle}
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {fill(copy.yourStakeBody, { percent: yourStake.sharePercent })}
              </p>

              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Figure label={copy.yourSavings} value={money(yourStake.savings)} />
                <Figure
                  label={copy.yourShare}
                  value={`${yourStake.sharePercent}%`}
                />
                <Figure
                  label={copy.yourIndicativeShare}
                  value={money(yourStake.indicativeShare)}
                />
              </dl>

              {/* The most important sentence on the page. A member who reads
                  their indicative share as a withdrawable balance and plans
                  around it has been misled by the screen, not by the figure. */}
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                {copy.indicativeNote}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. Where has it gone? */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.whereTitle}
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">{copy.whereHint}</p>

        <FundsAllocationBar
          currency={currency}
          segments={[
            {
              key: "lent",
              label: copy.whereLent,
              amount: position.lentToMembers,
              className: "bg-primary",
            },
            {
              key: "invested",
              label: copy.whereInvested,
              amount: position.investedCapital,
              className: "bg-gold",
            },
            // The platform's service fee, collected from members and not yet
            // paid over. Its own segment rather than folded into what is
            // "held": the association is holding it, but it is not the
            // association's, and a member seeing one bar for both would be
            // shown a fund larger than the one that exists.
            {
              key: "serviceFee",
              label: copy.whereServiceFee,
              amount: position.platformFeeHeld,
              className: "bg-amber-400",
            },
            {
              key: "held",
              label: copy.whereHeld,
              amount: position.notDeployed,
              className: "bg-ink/20",
            },
          ]}
        />
      </section>

      {/* 4. What did we earn, and what did it cost? */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.statementTitle}
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">{copy.statementHint}</p>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <LedgerColumn
            title={copy.earnedTitle}
            tone="positive"
            rows={[
              { label: copy.loanInterest, value: money(surplus.income.loanInterest) },
              { label: copy.loanFees, value: money(surplus.income.loanFees) },
              { label: copy.penalties, value: money(surplus.income.penalties) },
              { label: copy.accountFees, value: money(surplus.income.accountFees) },
              {
                label: copy.investmentReturns,
                value: money(surplus.income.investmentReturns),
              },
            ]}
            totalLabel={copy.totalEarned}
            totalValue={money(surplus.income.total)}
          />

          <LedgerColumn
            title={copy.spentTitle}
            tone="negative"
            rows={[
              {
                label: copy.memberInterest,
                value: money(surplus.costs.memberInterest),
              },
              {
                label: copy.borrowingInterest,
                value: money(surplus.costs.borrowingInterest),
              },
              {
                label: copy.borrowingFees,
                value: money(surplus.costs.borrowingFees),
              },
            ]}
            totalLabel={copy.totalSpent}
            totalValue={money(surplus.costs.total)}
          />
        </div>

        <div
          className={`mt-5 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-4 py-3 ${
            surplus.isPositive
              ? "border-success/30 bg-success/10"
              : "border-red-300 bg-red-50"
          }`}
        >
          <span className="font-heading text-sm font-semibold text-ink">
            {surplus.isPositive ? copy.netSurplus : copy.netLoss}
          </span>
          <span
            className={`font-heading text-xl font-bold tabular-nums ${
              surplus.isPositive ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {money(surplus.net)}
          </span>
        </div>
      </section>

      {/* The trend behind the surplus. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.incomeTrend}
        </h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-muted">{copy.incomeTrendHint}</p>

        {data.monthlyIncome.length > 0 ? (
          <MonthlyBarChart data={data.monthlyIncome} series={copy.incomeTrend} />
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
            <TrendingUp className="size-6 text-ink-muted/40" aria-hidden="true" />
            <p className="max-w-xs px-4 text-sm text-ink-muted">
              {copy.incomeTrendEmpty}
            </p>
          </div>
        )}
      </section>

      {/* 5. Who do we owe? */}
      <section>
        <div className="mb-1">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.borrowingsTitle}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">{copy.borrowingsHint}</p>
        </div>

        {pledgedPercent !== null && (
          <Alert
            variant="warning"
            title={fill(copy.pledgedTitle, { percent: pledgedPercent })}
            className="mt-4"
          >
            {fill(copy.pledgedBody, { percent: pledgedPercent })}
          </Alert>
        )}

        {borrowings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Landmark}
              title={copy.noBorrowingsTitle}
              description={copy.noBorrowingsBody}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {borrowings.map((facility) => (
              <article
                key={facility.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-semibold text-ink">
                      {facility.lenderName}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">
                      {facility.reference} ·{" "}
                      {statusLabel(facility.lenderType, d.status)}
                    </p>
                  </div>
                  <StatusBadge status={facility.status} size="sm" />
                </header>

                <p className="mb-4 text-sm leading-relaxed text-ink">
                  <span className="font-semibold text-ink-muted">
                    {copy.purpose}:{" "}
                  </span>
                  {facility.purpose}
                </p>

                {facility.daysOverdue > 0 && (
                  <Alert variant="error" className="mb-4">
                    {pluralize(copy.overdueWarning, facility.daysOverdue, {
                      days: facility.daysOverdue,
                    })}
                  </Alert>
                )}

                <RepaidBar
                  percent={facility.repaidPercent}
                  overdue={facility.daysOverdue > 0}
                />

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Figure
                    label={copy.facilityAmount}
                    value={formatMoney(facility.principal, {
                      currency: facility.currency,
                    })}
                    small
                  />
                  <Figure
                    label={copy.repaid}
                    value={formatMoney(facility.totalRepaid, {
                      currency: facility.currency,
                    })}
                    small
                  />
                  <Figure
                    label={copy.stillOwed}
                    value={formatMoney(facility.outstanding, {
                      currency: facility.currency,
                    })}
                    small
                  />
                  <Figure
                    label={copy.interestRate}
                    value={`${facility.interestRate}%`}
                    small
                  />
                  {facility.nextPaymentDue && (
                    <Figure
                      label={copy.nextPayment}
                      value={formatDate(facility.nextPaymentDue, locale)}
                      small
                    />
                  )}
                  {facility.maturityDate && (
                    <Figure
                      label={copy.matures}
                      value={formatDate(facility.maturityDate, locale)}
                      small
                    />
                  )}
                </dl>

                {facility.collateralDescription && (
                  <p className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed text-ink-muted">
                    <span className="font-semibold">{copy.security}: </span>
                    {facility.collateralDescription}
                  </p>
                )}

                {facility.fundedInvestments.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
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
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 6. What was taken out of everybody's savings, and why? Shown even
          when empty, so a member can see for themselves that nothing was. */}
      <section>
        <div className="mb-4">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.deductionsTitle}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">{copy.deductionsHint}</p>
        </div>

        {deductions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm text-ink-muted">
            {copy.noDeductionsBody}
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {deductions.map((deduction) => (
              <PoolDeductionCard
                key={deduction.id}
                deduction={deduction}
                d={d}
                locale={locale}
                currency={currency}
              />
            ))}
          </div>
        )}
      </section>

      {/* 7. What did it buy? */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">
              {copy.investmentsTitle}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">{copy.investmentsHint}</p>
          </div>
          {data.investmentTotals.count > 0 && (
            <p className="text-sm text-ink-muted">
              {pluralize(copy.projectsCount, data.investmentTotals.count, {
                count: data.investmentTotals.count,
              })}
              {data.investmentTotals.membersBenefited > 0 && (
                <>
                  {" · "}
                  {pluralize(
                    copy.membersBenefited,
                    data.investmentTotals.membersBenefited,
                    { count: data.investmentTotals.membersBenefited }
                  )}
                </>
              )}
            </p>
          )}
        </div>

        {investments.length === 0 ? (
          <EmptyState
            icon={Sprout}
            title={copy.noInvestmentsTitle}
            description={copy.noInvestmentsBody}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {investments.map((project) => (
              <article
                key={project.id}
                className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-semibold text-ink">
                      {project.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {statusLabel(project.category, d.status)}
                    </p>
                  </div>
                  <StatusBadge status={project.status} size="sm" />
                </header>

                <p className="text-sm leading-relaxed text-ink-muted">
                  {project.summary}
                </p>

                {/* The reason the record exists. Given its own block, with a
                    tint, because "what changed for me" is what a member came
                    to this page for — the amounts underneath are the evidence,
                    not the answer. */}
                {project.benefitSummary && (
                  <p className="mt-3 rounded-xl border border-success/25 bg-success/[0.07] px-3 py-2.5 text-sm leading-relaxed text-ink">
                    <span className="font-semibold">{copy.benefitTitle}: </span>
                    {project.benefitSummary}
                  </p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Figure
                    label={copy.invested}
                    value={formatMoney(project.amountInvested, {
                      currency: project.currency,
                    })}
                    small
                  />
                  {!isZero(project.amountReturned) && (
                    <Figure
                      label={copy.returnedSoFar}
                      value={formatMoney(project.amountReturned, {
                        currency: project.currency,
                      })}
                      small
                    />
                  )}
                  {project.membersBenefited !== null && (
                    <Figure
                      label={d.common.members}
                      value={String(project.membersBenefited)}
                      small
                    />
                  )}
                </dl>

                <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Banknote className="size-3.5" aria-hidden="true" />
                    {fill(copy.paidForBy, {
                      source: statusLabel(project.fundingSource, d.status),
                    })}
                  </span>
                  {project.fundedBy && (
                    <span className="font-mono">{project.fundedBy.reference}</span>
                  )}
                  {project.startedAt && (
                    <span>{formatDate(project.startedAt, locale)}</span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-ink-muted">
        <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {copy.sourceNote}
      </p>
    </div>
  );
}

/** A labelled figure. `small` for the dense grids inside a card. */
function Figure({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-heading font-bold tabular-nums text-ink ${
          small ? "text-sm" : "text-lg"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One side of the income statement.
 *
 * Amounts are never signed here — the column heading carries the direction.
 * A minus sign in front of every cost would read as a deduction from the
 * number above it rather than as a total in its own right.
 */
function LedgerColumn({
  title,
  tone,
  rows,
  totalLabel,
  totalValue,
}: {
  title: string;
  tone: "positive" | "negative";
  rows: { label: string; value: string }[];
  totalLabel: string;
  totalValue: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      <dl className="mt-2 divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 py-2"
          >
            <dt className="min-w-0 text-sm text-ink-muted">{row.label}</dt>
            <dd className="shrink-0 text-sm tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-2.5">
          <dt className="text-sm font-semibold text-ink">{totalLabel}</dt>
          <dd
            className={`font-heading text-base font-bold tabular-nums ${
              tone === "positive" ? "text-emerald-700" : "text-ink"
            }`}
          >
            {totalValue}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** How much of a facility has been paid back. */
function RepaidBar({ percent, overdue }: { percent: number; overdue: boolean }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.07]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${overdue ? "bg-red-500" : "bg-primary"}`}
        // A hair of width at 0% so the track reads as a bar rather than as a
        // rendering failure.
        style={{ width: `${Math.max(percent, 1.5)}%` }}
      />
    </div>
  );
}
