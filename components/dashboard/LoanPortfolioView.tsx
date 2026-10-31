import Link from "@/components/SiteLink";
import { AlertTriangle, Banknote, HandCoins, TrendingUp } from "lucide-react";
import { formatMoney, isPositive } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
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
import type { listLoans } from "@/lib/services/admin-queries";

/**
 * The loan book.
 *
 * Arrears are given their own tile and their own colour throughout, because
 * the portfolio total alone hides the only number that changes what an
 * administrator does today.
 */
export async function LoanPortfolioView({
  data,
  basePath,
  search,
  status,
  applicationsPath,
}: {
  data: Awaited<ReturnType<typeof listLoans>>;
  basePath: string;
  search?: string;
  status?: string;
  /// Where pending applications are reviewed, if this role reviews them.
  applicationsPath?: string;
}) {
  const { d, locale } = await getDashboardCopy();
  const copy = d.views.loans;

  // Values are the LoanStatus enum; only the labels are translated.
  const statusOptions = [
    { value: "ALL", label: copy.allStatuses },
    { value: "ACTIVE", label: copy.statusActive },
    { value: "OVERDUE", label: copy.statusOverdue },
    { value: "DISBURSED", label: copy.statusDisbursed },
    { value: "PENDING_DISBURSEMENT", label: copy.statusPendingDisbursement },
    { value: "COMPLETED", label: copy.statusCompleted },
    { value: "DEFAULTED", label: copy.statusDefaulted },
    { value: "WRITTEN_OFF", label: copy.statusWrittenOff },
    { value: "RESTRUCTURED", label: copy.statusRestructured },
    { value: "CANCELLED", label: copy.statusCancelled },
  ];

  const { portfolio } = data;
  const hasArrears = portfolio.overdueCount > 0;

  return (
    <>
      <StatGrid columns={4}>
        <StatCard
          label={copy.outstanding}
          value={formatMoney(portfolio.outstanding)}
          hint={pluralize(copy.openLoans, portfolio.openCount)}
          icon={HandCoins}
          tone="primary"
        />
        <StatCard
          label={copy.inArrears}
          value={formatMoney(portfolio.overdueAmount)}
          hint={pluralize(copy.overdueLoans, portfolio.overdueCount)}
          icon={AlertTriangle}
          tone={hasArrears ? "danger" : "success"}
        />
        <StatCard
          label={copy.totalDisbursed}
          value={formatMoney(portfolio.totalDisbursed)}
          hint={copy.disbursedHint}
          icon={Banknote}
        />
        <StatCard
          label={copy.awaitingDisbursement}
          value={String(data.statusCounts.PENDING_DISBURSEMENT ?? 0)}
          hint={copy.awaitingHint}
          icon={TrendingUp}
          href={applicationsPath}
        />
      </StatGrid>

      <SearchFilterForm
        action={basePath}
        placeholder={copy.searchPlaceholder}
        search={search}
        selects={[
          {
            name: "status",
            label: d.common.status,
            value: status,
            options: statusOptions,
          },
        ]}
      />

      {data.loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={copy.noneTitle}
          description={search || status ? copy.noneFilteredBody : copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colLoan}</TableHead>
                <TableHead>{copy.colMember}</TableHead>
                <TableHead align="right">{copy.colPrincipal}</TableHead>
                <TableHead align="right">{copy.colOutstanding}</TableHead>
                <TableHead align="right">{copy.colRepaid}</TableHead>
                <TableHead>{copy.colMaturity}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <span className="block font-mono text-xs text-ink">
                      {loan.reference}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">
                      {loan.productName} · {loan.interestRate}% ·{" "}
                      {fill(copy.months, { count: loan.termMonths })}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/admin/members/${loan.memberId}`}
                      className="block font-medium text-ink hover:text-primary"
                    >
                      {loan.memberName}
                    </Link>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {loan.memberNumber}
                    </span>
                  </TableCell>

                  <TableCell align="right" tabular className="text-ink-muted">
                    {formatMoney(loan.principal, {
                      currency: loan.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(loan.outstanding, {
                      currency: loan.currency,
                      showSymbol: false,
                    })}
                    {isPositive(loan.overdueAmount) && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                        {fill(copy.overdueSuffix, {
                          amount: formatMoney(loan.overdueAmount, {
                            showSymbol: false,
                          }),
                        })}
                        {loan.daysOverdue > 0 && ` · ${loan.daysOverdue}d`}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span className="text-emerald-700">
                      {formatMoney(loan.totalPaid, {
                        currency: loan.currency,
                        showSymbol: false,
                      })}
                    </span>
                    <span className="mt-1 block text-[11px] text-ink-muted">
                      {fill(copy.repaidPercent, { percent: loan.progressPercent })}
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(loan.maturityDate, locale)}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={loan.status} size="sm" />
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
    </>
  );
}
