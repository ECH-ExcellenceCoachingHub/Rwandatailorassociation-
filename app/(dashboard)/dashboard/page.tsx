import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarCheck,
  CalendarClock,
  Coins,
  Gavel,
  HandCoins,
  Landmark,
  PiggyBank,
  Receipt,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getMemberDashboard, type MemberDashboardData } from "@/lib/services/member-dashboard";
import { getPolicyEnsured } from "@/lib/services/rulebook";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  ContributionsChart,
  RepaymentProgress,
  SavingsGrowthChart,
} from "@/components/dashboard/charts/SavingsChart";
import { PaymentReferenceCard } from "@/components/dashboard/PaymentReferenceCard";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.shell.dashboard} | RTA Savings & Loans`,
  };
}

// Balances must never be served from a cache — a member refreshing after a
// deposit has to see the new figure, not a stale one.
export const dynamic = "force-dynamic";

export default async function MemberDashboardPage() {
  const context = await requireMember("/dashboard");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.overview;

  // The rulebook alongside the figures: the fine copy quotes the grace period,
  // and reading it from the policy is what keeps the sentence true after a
  // committee changes the rule.
  const [data, policy] = await Promise.all([
    getMemberDashboard(context.member!.id, context.user.id),
    context.user.associationId
      ? getPolicyEnsured(context.user.associationId)
      : Promise.resolve(null),
  ]);

  if (!data) {
    return (
      <EmptyState
        icon={Wallet}
        title={copy.noAccountTitle}
        description={copy.noAccountBody}
      />
    );
  }

  const {
    savings,
    loan,
    application,
    recentTransactions,
    monthlySavings,
    standing,
    fines,
  } = data;

  const firstName = context.user.firstName;
  const dueSoon = loan.nextInstalment
    ? daysUntil(loan.nextInstalment.dueDate)
    : null;

  return (
    <div className="space-y-7">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">
          {fill(copy.welcome, { name: firstName })}
        </h1>
        <p className="mt-1 text-[15px] text-ink-muted">
          {savings.lastTransactionAt
            ? fill(copy.lastActivity, {
                date: formatDate(savings.lastTransactionAt, locale),
              })
            : copy.firstContribution}
        </p>
      </div>

      {/* THE FINE, WHILE IT CAN STILL BE AVOIDED. Above the balances, beside
          the overdue-loan warning, because it is the one thing on this screen
          with a deadline attached — and a member who only ever opens the
          dashboard would otherwise meet the rule on the day it catches them. */}
      {standing &&
        (standing.status === "AT_RISK" || standing.status === "FINABLE") && (
          <Alert
            variant={standing.status === "FINABLE" ? "error" : "warning"}
            title={
              standing.status === "FINABLE"
                ? d.rules.member.finedTitle
                : fill(d.rules.member.fineWarning, {
                    days: standing.daysUntilFine,
                  })
            }
          >
            {standing.status === "FINABLE"
              ? fill(d.rules.member.finedBody, {
                  behind: standing.missedDays,
                  grace: policy?.graceDays ?? 0,
                  amount: formatMoney(standing.clearingAmount),
                })
              : fill(d.rules.member.fineWarningBody, {
                  behind: standing.missedDays,
                  amount: formatMoney(standing.clearingAmount),
                })}{" "}
            <Link
              href="/dashboard/savings/deposit"
              className="font-semibold underline"
            >
              {copy.makeDeposit}
            </Link>
          </Alert>
        )}

      {loan.daysOverdue > 0 && (
        <Alert variant="error" title={copy.overdueTitle}>
          {pluralize(copy.overdueBody, loan.daysOverdue, { days: loan.daysOverdue })}{" "}
          <Link href="/dashboard/loans/repayments" className="font-semibold underline">
            {copy.makeRepayment}
          </Link>
        </Alert>
      )}

      {application && (
        <Alert
          variant="info"
          title={fill(copy.applicationTitle, { reference: application.reference })}
        >
          {fill(copy.applicationBody, {
            amount: formatMoney(application.requestedAmount),
            status: application.status.toLowerCase().replace(/_/g, " "),
          })}{" "}
          <Link href="/dashboard/loans" className="font-semibold underline">
            {copy.viewDetails}
          </Link>
        </Alert>
      )}

      {/* Headline figures */}
      <StatGrid columns={4}>
        <StatCard
          label={copy.savingsBalance}
          value={formatMoney(savings.balance)}
          hint={fill(copy.availableHint, {
            amount: formatMoney(savings.available),
          })}
          icon={PiggyBank}
          tone="primary"
          href="/dashboard/savings"
        />

        <StatCard
          label={copy.activeLoan}
          value={loan.hasActiveLoan ? formatMoney(loan.principal) : d.common.none}
          hint={loan.reference ?? copy.noLoanRunning}
          icon={HandCoins}
          href="/dashboard/loans"
        />

        <StatCard
          label={copy.outstandingLoan}
          value={formatMoney(loan.outstanding)}
          hint={
            loan.hasActiveLoan
              ? fill(copy.repaidPercent, { percent: loan.progressPercent })
              : copy.nothingOwed
          }
          icon={Receipt}
          tone={loan.daysOverdue > 0 ? "danger" : "default"}
        />

        <StatCard
          label={copy.nextRepayment}
          value={
            loan.nextInstalment ? formatMoney(loan.nextInstalment.amount) : "—"
          }
          hint={
            loan.nextInstalment
              ? `${fill(copy.dueOn, {
                  date: formatDate(loan.nextInstalment.dueDate, locale),
                })}${
                  dueSoon !== null && dueSoon >= 0 && dueSoon <= 7
                    ? ` · ${pluralize(copy.dueInDays, dueSoon, { days: dueSoon })}`
                    : ""
                }`
              : copy.noRepaymentScheduled
          }
          icon={CalendarClock}
          tone={
            loan.nextInstalment && dueSoon !== null && dueSoon < 0
              ? "danger"
              : loan.nextInstalment && dueSoon !== null && dueSoon <= 7
                ? "warning"
                : "default"
          }
        />
      </StatGrid>

      {/* THE DAILY OBLIGATION, in full. The figures above are what the member
          has; this is what they owe, and it is the half the association acts
          on. The daily cost leads with the TOTAL rather than the savings
          portion — a member shown only the savings figure pays exactly that
          and falls behind by the fee every day. */}
      {standing && (
        <StandingSection
          standing={standing}
          fines={fines}
          d={d}
          locale={locale}
        />
      )}

      {/* Quick actions + payment reference */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="font-heading text-base font-semibold text-ink">
            {copy.quickActions}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* First, deliberately. A member who never opens the sidebar should
                still find their way to what the association is doing with the
                money — the point of publishing it is that it gets read. */}
            <Button asChild variant="outline" className="h-auto justify-start py-3">
              <Link href="/dashboard/association">
                <Landmark className="size-4 text-primary" aria-hidden="true" />
                {d.nav.ourMoney}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start py-3">
              <Link href="/dashboard/savings/deposit">
                <ArrowDownToLine className="size-4 text-primary" aria-hidden="true" />
                {copy.makeDeposit}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start py-3">
              <Link href="/dashboard/withdrawals">
                <ArrowUpFromLine className="size-4 text-primary" aria-hidden="true" />
                {copy.requestWithdrawal}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start py-3">
              <Link href="/dashboard/loans/apply">
                <HandCoins className="size-4 text-primary" aria-hidden="true" />
                {copy.applyLoan}
              </Link>
            </Button>
          </div>
        </div>

        <PaymentReferenceCard reference={data.paymentReference} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={copy.savingsGrowth} description={copy.savingsGrowthHint}>
          {monthlySavings.length > 0 ? (
            <SavingsGrowthChart data={monthlySavings} />
          ) : (
            <ChartPlaceholder message={copy.savingsGrowthEmpty} />
          )}
        </ChartCard>

        <ChartCard title={copy.contributions} description={copy.contributionsHint}>
          {monthlySavings.length > 0 ? (
            <ContributionsChart data={monthlySavings} />
          ) : (
            <ChartPlaceholder message={copy.contributionsEmpty} />
          )}
        </ChartCard>
      </div>

      {loan.hasActiveLoan && (
        <ChartCard
          title={copy.repaymentProgress}
          description={`${loan.reference} · ${fill(copy.totalPayableHint, {
            amount: formatMoney(loan.totalPayable),
          })}`}
        >
          <div className="pt-2">
            <RepaymentProgress
              paid={loan.totalPaid}
              total={loan.totalPayable}
              percent={loan.progressPercent}
              overdue={loan.daysOverdue > 0}
            />
          </div>
        </ChartCard>
      )}

      {/* Recent transactions */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.recentTransactions}
          </h2>
          <Link
            href="/dashboard/savings/transactions"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {d.common.viewAll}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={copy.noTransactions}
            description={fill(copy.noTransactionsHint, {
              reference: data.paymentReference,
            })}
            action={
              <Button asChild>
                <Link href="/dashboard/savings/deposit">{copy.makeDeposit}</Link>
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.common.reference}</TableHead>
                  <TableHead>{d.common.date}</TableHead>
                  <TableHead>{d.common.type}</TableHead>
                  <TableHead align="right">{d.common.amount}</TableHead>
                  <TableHead align="right">{d.common.balance}</TableHead>
                  <TableHead>{d.common.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {t.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDate(t.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.type} size="sm" />
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span
                        className={
                          t.direction === "CREDIT"
                            ? "text-emerald-700"
                            : "text-ink"
                        }
                      >
                        {t.direction === "CREDIT" ? "+" : "−"}
                        {formatMoney(t.amount, { showSymbol: false })}
                      </span>
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(t.balanceAfter, { showSymbol: false })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        )}
      </div>
    </div>
  );
}

/**
 * WHERE THE MEMBER STANDS ON THE DAILY SAVING, on the screen they actually open.
 *
 * The dashboard used to answer only "what have I got" — balance, loan, next
 * repayment. It never answered "what do I owe today", which is the half a
 * member is fined over. Somebody who never opened the rulebook or their account
 * status could therefore accrue arrears and a penalty without the app once
 * putting the figure in front of them.
 *
 * THE DAILY COST LEADS WITH THE TOTAL. The savings portion and the service fee
 * are two separate rules, and a member who meets them one at a time does not
 * add them up: they pay the savings half exactly, believe they are square, and
 * fall behind by the fee every single day. The total is the figure; the two
 * halves are named underneath it.
 *
 * Copy is reused wholesale from the rulebook's member vocabulary rather than
 * duplicated here, so the same position reads identically on this page, on the
 * rules page and on the account status page. Three screens describing one
 * member's arrears in three different phrasings is how people conclude the
 * numbers disagree.
 */
function StandingSection({
  standing,
  fines,
  d,
  locale,
}: {
  standing: NonNullable<MemberDashboardData["standing"]>;
  fines: MemberDashboardData["fines"];
  d: Awaited<ReturnType<typeof getDashboardCopy>>["d"];
  locale: "en" | "rw";
}) {
  const copy = d.rules;
  const behind = standing.missedDays > 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.member.yourStanding}
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/rules">
            {copy.member.theRules}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <StatGrid columns={4} className="mt-4">
        <StatCard
          label={copy.member.oneDayCosts}
          value={formatMoney(standing.dailyTotal)}
          hint={fill(copy.member.oneDayCostsHint, {
            savings: formatMoney(standing.dailySavings),
            fee: formatMoney(standing.dailyFee),
          })}
          icon={Coins}
        />
        <StatCard
          label={copy.member.daysCovered}
          value={String(standing.coveredDays)}
          hint={fill(copy.member.daysCoveredHint, { owed: standing.dueDays })}
          icon={CalendarCheck}
        />
        <StatCard
          label={copy.standing[standing.status]}
          value={behind ? String(standing.missedDays) : String(standing.dueDays)}
          hint={
            behind
              ? fill(copy.member.behindBy, { days: standing.missedDays })
              : copy.member.daysOwed
          }
          icon={behind ? TriangleAlert : CalendarCheck}
          tone={
            standing.status === "FINABLE"
              ? "danger"
              : standing.status === "AT_RISK" || standing.status === "BEHIND"
                ? "warning"
                : "success"
          }
        />
        <StatCard
          label={copy.member.payToClear}
          value={formatMoney(standing.clearingAmount)}
          hint={copy.member.payToClearHint}
          icon={PiggyBank}
          tone={behind ? "danger" : "success"}
          href="/dashboard/savings/deposit"
        />
      </StatGrid>

      {/* The discipline record, compact. Three at most — this is a summary, and
          the full list with every fine's arithmetic is one link away. */}
      {fines.rows.length > 0 && (
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-semibold text-ink">
              {copy.member.yourFines}
            </h3>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/fines">
                {d.account.status.finesSeeAll}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <ul className="mt-3 space-y-2">
            {fines.rows.slice(0, 3).map((fine) => {
              const outstanding = fine.status === "OUTSTANDING";

              const why =
                fine.kind === "CONTRIBUTION"
                  ? pluralize(copy.fines.whyContribution, fine.missedDays ?? 0, {
                      days: fine.missedDays ?? 0,
                    })
                  : pluralize(copy.fines.whyWarehouse, fine.daysLate ?? 0, {
                      number: fine.installmentNumber ?? 0,
                      days: fine.daysLate ?? 0,
                    });

              return (
                <li
                  key={`${fine.kind}-${fine.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    outstanding
                      ? "border-red-200 bg-red-50/50"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{why}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDate(fine.assessedAt, locale)} ·{" "}
                      {fill(copy.fines.sum, {
                        rate: fine.rate,
                        arrears: formatMoney(fine.arrearsAmount, {
                          currency: fine.currency,
                        }),
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        outstanding ? "text-red-600" : "text-ink"
                      }`}
                    >
                      {formatMoney(fine.amount, { currency: fine.currency })}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        outstanding
                          ? "border-red-300 bg-red-50 text-red-700"
                          : fine.status === "SETTLED"
                            ? "border-success/30 bg-success/10 text-emerald-700"
                            : "border-ink/12 bg-ink/[0.04] text-ink-muted"
                      }`}
                    >
                      {copy.fines.state[fine.status]}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {fines.outstandingCount > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700">
              <Gavel className="size-4" aria-hidden="true" />
              {d.account.status.finesOwed}: {formatMoney(fines.outstandingAmount)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4">
        <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
      <TrendingUp className="size-6 text-ink-muted/40" aria-hidden="true" />
      <p className="max-w-xs px-4 text-sm text-ink-muted">{message}</p>
    </div>
  );
}

function daysUntil(date: Date): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}
