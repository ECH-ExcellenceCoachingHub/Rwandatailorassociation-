import Link from "@/components/SiteLink";
import { Receipt } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TransactionFilters } from "@/components/dashboard/TransactionFilters";
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
import type { listTransactions } from "@/lib/services/admin-queries";

/**
 * The savings ledger, as shown to an administrator.
 *
 * Shared by the association and platform screens so the two cannot drift: the
 * only difference between them is the scope the caller resolved, which is
 * decided by the guard on the page, never here.
 */
export async function TransactionsView({
  data,
  basePath,
}: {
  data: Awaited<ReturnType<typeof listTransactions>>;
  basePath: string;
}) {
  const { d, locale } = await getDashboardCopy();
  const copy = d.views.transactions;

  return (
    <>
      <TransactionFilters basePath={basePath} />

      <div className="mb-4 mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryTile label={copy.matching} value={String(data.total)} />
        <SummaryTile
          label={copy.totalIn}
          value={formatMoney(data.totalIn)}
          tone="in"
        />
        <SummaryTile
          label={copy.totalOut}
          value={formatMoney(data.totalOut)}
          tone="out"
        />
      </div>

      {data.transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colMember}</TableHead>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead>{d.common.date}</TableHead>
                <TableHead>{d.common.description}</TableHead>
                <TableHead>{d.common.type}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead align="right">{copy.balanceAfter}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/admin/members/${t.memberId}`}
                      className="block font-medium text-ink hover:text-primary"
                    >
                      {t.memberName}
                    </Link>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {t.memberNumber}
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-ink-muted">
                    {t.reference}
                    {t.externalReference && (
                      <span className="mt-0.5 block text-[10px] text-ink-muted/70">
                        ext: {t.externalReference.slice(0, 18)}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(t.createdAt, locale)}
                  </TableCell>

                  <TableCell className="max-w-xs text-sm">
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

                  <TableCell>
                    <StatusBadge status={t.status} size="sm" />
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

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "in" | "out";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-heading text-lg font-bold tabular-nums ${
          tone === "in" ? "text-emerald-700" : tone === "out" ? "text-amber-700" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
