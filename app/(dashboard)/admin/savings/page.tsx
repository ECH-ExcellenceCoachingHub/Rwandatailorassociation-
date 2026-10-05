import type { Metadata } from "next";
import Link from "next/link";
import { Lock, PiggyBank, Wallet } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listSavingsAccounts } from "@/lib/services/admin-queries";
import { formatMoney, isPositive, subtract } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.savings.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminSavingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const context = await requirePermission(PERMISSIONS.SAVINGS_VIEW_ALL, "/admin/savings");
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const search = params.q?.trim() || undefined;
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.savings;

  const data = await listSavingsAccounts(associationId, {
    page: Number(params.page) || 1,
    search,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={3}>
        <StatCard
          label={copy.totalHeld}
          value={formatMoney(data.totalBalance)}
          hint={
            isPositive(data.totalServiceFees)
              ? `${pluralize(copy.accountCount, data.total)} · ${fill(copy.afterServiceFees, {
                  amount: formatMoney(data.totalServiceFees),
                })}`
              : pluralize(copy.accountCount, data.total)
          }
          icon={PiggyBank}
          tone="primary"
        />
        <StatCard
          label={copy.locked}
          value={formatMoney(data.totalLocked)}
          hint={copy.lockedHint}
          icon={Lock}
          tone={isPositive(data.totalLocked) ? "warning" : "default"}
        />
        <StatCard
          label={copy.available}
          value={formatMoney(subtract(data.totalBalance, data.totalLocked))}
          hint={copy.availableHint}
          icon={Wallet}
          tone="success"
        />
      </StatGrid>

      <SearchFilterForm
        action="/admin/savings"
        placeholder={copy.searchPlaceholder}
        search={search}
      />

      {data.accounts.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={copy.noneTitle}
          description={search ? copy.noneSearchBody : copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colMember}</TableHead>
                <TableHead>{copy.colAccount}</TableHead>
                <TableHead align="right">{d.common.balance}</TableHead>
                <TableHead align="right">{copy.colLocked}</TableHead>
                <TableHead align="right">{copy.colAvailable}</TableHead>
                <TableHead align="right">{copy.colDeposits}</TableHead>
                <TableHead align="right">{copy.colServiceFees}</TableHead>
                <TableHead align="right">{copy.colWithdrawn}</TableHead>
                <TableHead>{copy.colLastActivity}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link
                      href={`/admin/members/${account.memberId}`}
                      className="block font-medium text-ink hover:text-primary"
                    >
                      {account.memberName}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                      {account.memberNumber}
                      <StatusBadge status={account.memberStatus} size="sm" />
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-ink-muted">
                    {account.accountNumber}
                    <span className="mt-0.5 block text-[10px]">
                      {pluralize(copy.transactionCount, account.transactionCount)}
                    </span>
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(account.balance, {
                      currency: account.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span
                      className={
                        isPositive(account.lockedBalance)
                          ? "text-amber-700"
                          : "text-ink-muted"
                      }
                    >
                      {formatMoney(account.lockedBalance, {
                        currency: account.currency,
                        showSymbol: false,
                      })}
                    </span>
                  </TableCell>

                  <TableCell align="right" tabular className="text-emerald-700">
                    {formatMoney(account.available, {
                      currency: account.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular className="text-ink-muted">
                    {formatMoney(account.totalDeposits, {
                      currency: account.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular className="text-ink-muted">
                    {isPositive(account.serviceFeesDeducted) && "−"}
                    {formatMoney(account.serviceFeesDeducted, {
                      currency: account.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular className="text-ink-muted">
                    {formatMoney(account.totalWithdrawals, {
                      currency: account.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(account.lastTransactionAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationLinks
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </TableWrapper>
      )}
    </div>
  );
}
