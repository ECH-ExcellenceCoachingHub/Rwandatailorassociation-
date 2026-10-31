import Link from "@/components/SiteLink";
import { AlertTriangle, BarChart3, Trophy } from "lucide-react";
import { formatMoney, isPositive, subtract } from "@/lib/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatMonthYear } from "@/lib/i18n/dates";
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
import type { ReportBundle } from "@/lib/services/admin-queries";

/**
 * Reporting surface.
 *
 * Deliberately built from database aggregates and plain tables rather than
 * charts: every number here is one an administrator may need to quote or
 * reconcile against a bank statement, and a bar chart cannot be read to two
 * decimal places. The twelve-month movement table is the one time series that
 * earns its place.
 *
 * A server component, so it reads the request's language directly rather than
 * having every label threaded down from the page.
 */
export async function ReportsView({ data }: { data: ReportBundle }) {
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.reports;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownPanel
          title={copy.membersByStatus}
          rows={data.membersByStatus.map((r) => ({
            key: r.label,
            label: <StatusBadge status={r.label} size="sm" />,
            count: r.count,
          }))}
          countHeading={copy.headMembers}
          categoryHeading={copy.headCategory}
          emptyLabel={copy.nothingRecorded}
          totalLabel={d.common.total}
        />

        <BreakdownPanel
          title={copy.loansByStatus}
          rows={data.loansByStatus.map((r) => ({
            key: r.label,
            label: <StatusBadge status={r.label} size="sm" />,
            count: r.count,
            amount: r.amount,
          }))}
          countHeading={copy.headLoans}
          amountHeading={copy.headPrincipal}
          categoryHeading={copy.headCategory}
          emptyLabel={copy.nothingRecorded}
          totalLabel={d.common.total}
        />

        <BreakdownPanel
          title={copy.paymentsByChannel}
          rows={data.paymentsByChannel.map((r) => ({
            key: r.label,
            label: (
              <span className="text-sm text-ink">
                {statusLabel(r.label, d.status)}
              </span>
            ),
            count: r.count,
            amount: r.amount,
          }))}
          countHeading={copy.headPayments}
          amountHeading={copy.headValue}
          categoryHeading={copy.headCategory}
          emptyLabel={copy.nothingRecorded}
          totalLabel={d.common.total}
        />

        <BreakdownPanel
          title={copy.ledgerByType}
          rows={data.transactionsByType.map((r) => ({
            key: r.label,
            label: <StatusBadge status={r.label} size="sm" />,
            count: r.count,
            amount: r.amount,
          }))}
          countHeading={copy.headEntries}
          amountHeading={copy.headValue}
          categoryHeading={copy.headCategory}
          emptyLabel={copy.nothingRecorded}
          totalLabel={d.common.total}
        />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold text-ink">
          <BarChart3 className="size-4.5 text-primary" aria-hidden="true" />
          {copy.movementTitle}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.month}</TableHead>
                <TableHead align="right">{copy.deposits}</TableHead>
                <TableHead align="right">{copy.withdrawals}</TableHead>
                <TableHead align="right">{copy.net}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.monthly.length === 0 ? (
                <TableEmpty colSpan={4}>{copy.noMovement}</TableEmpty>
              ) : (
                data.monthly.map((row) => {
                  const net = subtract(row.deposits, row.withdrawals);
                  return (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium text-ink">
                        {formatMonthYear(row.month, locale)}
                      </TableCell>
                      <TableCell align="right" tabular className="text-emerald-700">
                        {formatMoney(row.deposits, { showSymbol: false })}
                      </TableCell>
                      <TableCell align="right" tabular className="text-amber-700">
                        {formatMoney(row.withdrawals, { showSymbol: false })}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(net, { showSymbol: false, signed: true })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold text-ink">
            <Trophy className="size-4.5 text-primary" aria-hidden="true" />
            {copy.largestSavers}
          </h2>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.common.member}</TableHead>
                  <TableHead align="right">{d.common.balance}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topSavers.length === 0 ? (
                  <TableEmpty colSpan={2}>{copy.noSavingsAccounts}</TableEmpty>
                ) : (
                  data.topSavers.map((saver) => (
                    <TableRow key={saver.memberId}>
                      <TableCell>
                        <Link
                          href={`/admin/members/${saver.memberId}`}
                          className="block font-medium text-ink hover:text-primary"
                        >
                          {saver.memberName}
                        </Link>
                        <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                          {saver.memberNumber}
                        </span>
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(saver.balance, { showSymbol: false })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrapper>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold text-ink">
            <AlertTriangle className="size-4.5 text-red-600" aria-hidden="true" />
            {copy.arrearsTitle}
          </h2>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.common.member}</TableHead>
                  <TableHead align="right">{copy.daysLate}</TableHead>
                  <TableHead align="right">{copy.overdue}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.arrears.length === 0 ? (
                  <TableEmpty colSpan={3}>{copy.noArrears}</TableEmpty>
                ) : (
                  data.arrears.map((row) => (
                    <TableRow key={row.reference}>
                      <TableCell>
                        <Link
                          href={`/admin/members/${row.memberId}`}
                          className="block font-medium text-ink hover:text-primary"
                        >
                          {row.memberName}
                        </Link>
                        <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                          {row.reference}
                        </span>
                      </TableCell>
                      <TableCell align="right" tabular className="text-red-600">
                        {row.daysOverdue}
                      </TableCell>
                      <TableCell align="right" tabular className="text-red-700">
                        {formatMoney(row.overdueAmount, { showSymbol: false })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrapper>
        </section>
      </div>
    </div>
  );
}

function BreakdownPanel({
  title,
  rows,
  countHeading,
  amountHeading,
  categoryHeading,
  emptyLabel,
  totalLabel,
}: {
  title: string;
  rows: {
    key: string;
    label: React.ReactNode;
    count: number;
    amount?: string;
  }[];
  countHeading: string;
  amountHeading?: string;
  categoryHeading: string;
  emptyLabel: string;
  totalLabel: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section>
      <h2 className="mb-3 font-heading text-base font-semibold text-ink">{title}</h2>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{categoryHeading}</TableHead>
              <TableHead align="right">{countHeading}</TableHead>
              {amountHeading && <TableHead align="right">{amountHeading}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={amountHeading ? 3 : 2}>
                {emptyLabel}
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell align="right" tabular>
                    {row.count}
                  </TableCell>
                  {amountHeading && (
                    <TableCell align="right" tabular className="text-ink-muted">
                      {row.amount && isPositive(row.amount)
                        ? formatMoney(row.amount, { showSymbol: false })
                        : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
            <span className="font-semibold text-ink-muted">{totalLabel}</span>
            <span className="font-heading font-bold tabular-nums text-ink">{total}</span>
          </div>
        )}
      </TableWrapper>
    </section>
  );
}
