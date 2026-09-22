import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  FileText,
  Lock,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import {
  getMemberSavingsAccount,
  getMemberTransactions,
} from "@/lib/services/member-queries";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
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
    title: `${d.member.savings.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function MemberSavingsPage() {
  const context = await requireMember("/dashboard/savings");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.savings;

  // Both keyed by the member, so neither waits for the other.
  const [account, recent] = await Promise.all([
    getMemberSavingsAccount(context.member!.id),
    getMemberTransactions(context.member!.id, { pageSize: 10 }),
  ]);

  if (!account) {
    return (
      <EmptyState
        icon={Wallet}
        title={copy.noAccountTitle}
        description={copy.noAccountBody}
      />
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title={copy.title}
        description={fill(copy.accountOpened, {
          number: account.accountNumber,
          date: formatDate(account.openedAt, locale),
        })}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/statements">
                <FileText className="size-4" aria-hidden="true" />
                {copy.statement}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/savings/deposit">
                <ArrowDownToLine className="size-4" aria-hidden="true" />
                {copy.deposit}
              </Link>
            </Button>
          </>
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.currentBalance}
          value={formatMoney(account.balance)}
          hint={fill(copy.transactionCount, { count: account.transactionCount })}
          icon={PiggyBank}
          tone="primary"
        />
        <StatCard
          label={copy.available}
          value={formatMoney(account.available)}
          hint={
            Number(account.lockedBalance) > 0
              ? fill(copy.pledged, {
                  amount: formatMoney(account.lockedBalance),
                })
              : copy.nothingPledged
          }
          icon={Wallet}
        />
        <StatCard
          label={copy.totalContributed}
          value={formatMoney(account.totalDeposits)}
          hint={copy.lifetimeDeposits}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label={copy.totalWithdrawn}
          value={formatMoney(account.totalWithdrawals)}
          hint={copy.lifetimeWithdrawals}
          icon={ArrowUpFromLine}
        />
      </StatGrid>

      {Number(account.lockedBalance) > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/[0.07] p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-amber-900">
            <strong>{formatMoney(account.lockedBalance)}</strong>{" "}
            {copy.pledgedNotice}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionTile
          href="/dashboard/savings/deposit"
          icon={ArrowDownToLine}
          title={copy.tileDeposit}
          detail={copy.tileDepositHint}
        />
        <ActionTile
          href="/dashboard/withdrawals"
          icon={ArrowUpFromLine}
          title={copy.tileWithdraw}
          detail={copy.tileWithdrawHint}
        />
        <ActionTile
          href="/dashboard/savings/transactions"
          icon={Receipt}
          title={copy.tileTransactions}
          detail={copy.tileTransactionsHint}
        />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.recentActivity}
          </h2>
          <Link
            href="/dashboard/savings/transactions"
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
                <TableHead>{d.common.date}</TableHead>
                <TableHead>{d.common.description}</TableHead>
                <TableHead>{d.common.type}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead align="right">{d.common.balance}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.transactions.length === 0 ? (
                <TableEmpty colSpan={6}>
                  {copy.noTransactionsQuote}{" "}
                  <strong>{context.member!.paymentReference}</strong>.
                </TableEmpty>
              ) : (
                recent.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {t.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDate(t.createdAt, locale)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.type} size="sm" />
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
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(t.balanceAfter, { showSymbol: false })}
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

function ActionTile({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof Wallet;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-lift"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-sm font-semibold text-ink">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
      </span>
    </Link>
  );
}
