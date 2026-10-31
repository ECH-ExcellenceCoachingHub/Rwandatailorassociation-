import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpFromLine,
  Banknote,
  ClipboardList,
  CreditCard,
  HandCoins,
  Link2,
  PiggyBank,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveAssociationScope } from "@/lib/auth/guards";
import { getAdminDashboard } from "@/lib/services/admin-dashboard";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { MonthlyBarChart } from "@/components/dashboard/charts/SavingsChart";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.overview.title,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const context = await requireAdmin("/admin");
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.overview;

  const data = await getAdminDashboard(associationId);

  const { members, savings, loans, payments, queues, charts, recentTransactions } = data;

  return (
    <div className="space-y-7">
      <PageHeader
        title={fill(copy.title, {
          association: context.association?.name ?? copy.platform,
        })}
        description={copy.description}
      />

      {/* Things that need a human, surfaced before the numbers. */}
      {(payments.unmatchedCount > 0 ||
        loans.overdueCount > 0 ||
        queues.pendingMemberApprovals > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {payments.unmatchedCount > 0 && (
            <ActionCard
              href="/admin/payments/unmatched"
              icon={Link2}
              tone="warning"
              title={pluralize(copy.unmatchedPayments, payments.unmatchedCount)}
              detail={fill(copy.unmatchedDetail, {
                amount: formatMoney(payments.unmatchedAmount),
              })}
            />
          )}
          {loans.overdueCount > 0 && (
            <ActionCard
              href="/admin/loans?status=OVERDUE"
              icon={AlertTriangle}
              tone="danger"
              title={pluralize(copy.overdueLoans, loans.overdueCount)}
              detail={fill(copy.overdueDetail, {
                amount: formatMoney(loans.overdueAmount),
              })}
            />
          )}
          {queues.pendingMemberApprovals > 0 && (
            <ActionCard
              href="/admin/members/pending"
              icon={UserCheck}
              tone="info"
              title={pluralize(
                copy.membershipApplications,
                queues.pendingMemberApprovals
              )}
              detail={copy.awaitingApproval}
            />
          )}
        </div>
      )}

      {payments.suspiciousCount > 0 && (
        <Alert variant="error" title={copy.suspiciousTitle}>
          {pluralize(copy.suspiciousBody, payments.suspiciousCount)}{" "}
          <Link href="/admin/payments?flag=suspicious" className="font-semibold underline">
            {copy.reviewThem}
          </Link>
        </Alert>
      )}

      {/* Money */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-ink-muted">
          {copy.funds}
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label={copy.totalSavings}
            value={formatMoney(savings.totalBalance)}
            hint={pluralize(copy.activeMembers, members.active)}
            icon={PiggyBank}
            tone="primary"
            href="/admin/savings"
          />
          <StatCard
            label={copy.collectedToday}
            value={formatMoney(savings.depositsToday)}
            hint={pluralize(copy.transactionsToday, savings.transactionsToday)}
            icon={Banknote}
            tone="success"
          />
          <StatCard
            label={copy.collectedThisMonth}
            value={formatMoney(savings.depositsThisMonth)}
            hint={fill(copy.withdrawalsHint, {
              amount: formatMoneyCompact(savings.withdrawalsThisMonth),
            })}
            icon={TrendingUp}
          />
          <StatCard
            label={copy.outstandingLoans}
            value={formatMoney(loans.outstanding)}
            hint={pluralize(copy.activeLoans, loans.activeCount)}
            icon={HandCoins}
            tone={loans.overdueCount > 0 ? "warning" : "default"}
            href="/admin/loans"
          />
        </StatGrid>
      </section>

      {/* Operations */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-ink-muted">
          {copy.needsAttention}
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label={copy.pendingApplications}
            value={String(loans.pendingApplications)}
            hint={copy.pendingApplicationsHint}
            icon={ClipboardList}
            tone={loans.pendingApplications > 0 ? "warning" : "default"}
            href="/admin/loans/applications"
          />
          <StatCard
            label={copy.pendingWithdrawals}
            value={String(queues.pendingWithdrawals)}
            hint={formatMoney(queues.pendingWithdrawalAmount)}
            icon={ArrowUpFromLine}
            tone={queues.pendingWithdrawals > 0 ? "warning" : "default"}
            href="/admin/withdrawals"
          />
          <StatCard
            label={copy.unmatchedCount}
            value={String(payments.unmatchedCount)}
            hint={formatMoney(payments.unmatchedAmount)}
            icon={CreditCard}
            tone={payments.unmatchedCount > 0 ? "danger" : "success"}
            href="/admin/payments/unmatched"
          />
          <StatCard
            label={copy.overdueCount}
            value={String(loans.overdueCount)}
            hint={formatMoney(loans.overdueAmount)}
            icon={AlertTriangle}
            tone={loans.overdueCount > 0 ? "danger" : "success"}
            href="/admin/loans?status=OVERDUE"
          />
        </StatGrid>
      </section>

      {/* Membership */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-ink-muted">
          {copy.membership}
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label={copy.totalMembers}
            value={String(members.total)}
            hint={fill(copy.joinedThisMonth, { count: members.joinedThisMonth })}
            icon={Users}
            href="/admin/members"
          />
          <StatCard
            label={copy.active}
            value={String(members.active)}
            icon={UserCheck}
            tone="success"
          />
          <StatCard
            label={copy.pendingApproval}
            value={String(members.pendingApproval)}
            icon={ClipboardList}
            tone={members.pendingApproval > 0 ? "warning" : "default"}
            href="/admin/members/pending"
          />
          <StatCard
            label={copy.suspended}
            value={String(members.suspended)}
            icon={AlertTriangle}
            tone={members.suspended > 0 ? "warning" : "default"}
          />
        </StatGrid>
      </section>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={copy.monthlyDeposits}
          description={copy.monthlyDepositsHint}
        >
          {charts.monthlyDeposits.length > 0 ? (
            <MonthlyBarChart
              data={charts.monthlyDeposits}
              series={copy.seriesDeposits}
            />
          ) : (
            <ChartPlaceholder message={copy.noData} />
          )}
        </ChartCard>

        <ChartCard
          title={copy.monthlyWithdrawals}
          description={copy.monthlyWithdrawalsHint}
        >
          {charts.monthlyWithdrawals.length > 0 ? (
            <MonthlyBarChart
              data={charts.monthlyWithdrawals}
              series={copy.seriesWithdrawals}
              colour="#d4a94c"
            />
          ) : (
            <ChartPlaceholder message={copy.noData} />
          )}
        </ChartCard>
      </div>

      {/* Recent activity */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.latestTransactions}
          </h2>
          <Link
            href="/admin/savings/transactions"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {d.common.viewAll}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead>{d.common.member}</TableHead>
                <TableHead>{d.common.type}</TableHead>
                <TableHead>{copy.colChannel}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead>{d.common.date}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.length === 0 ? (
                <TableEmpty colSpan={6}>{copy.noTransactions}</TableEmpty>
              ) : (
                recentTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {t.reference}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm font-medium text-ink">
                        {t.memberName}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {t.memberNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.type} size="sm" />
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {t.channel.replace(/_/g, " ").toLowerCase()}
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span
                        className={
                          t.direction === "CREDIT" ? "text-emerald-700" : "text-ink"
                        }
                      >
                        {t.direction === "CREDIT" ? "+" : "−"}
                        {formatMoney(t.amount, { showSymbol: false })}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDate(t.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  detail,
  tone,
}: {
  href: string;
  icon: typeof Link2;
  title: string;
  detail: string;
  tone: "warning" | "danger" | "info";
}) {
  const tones = {
    warning: "border-gold/40 bg-gold/[0.07] text-amber-800",
    danger: "border-red-300 bg-red-50 text-red-700",
    info: "border-primary/25 bg-primary-50 text-primary-hover",
  };

  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-card ${tones[tone]}`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs opacity-90">{detail}</span>
      </span>
      <ArrowRight className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
    </Link>
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
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border">
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}
