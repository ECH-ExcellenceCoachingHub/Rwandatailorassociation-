import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CreditCard,
  PiggyBank,
  Receipt,
  UserRound,
} from "lucide-react";
import { assertSameAssociation, requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getMemberPaymentHistory } from "@/lib/services/member-payments";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
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
} from "@/components/ui/table";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.admin.payments.title} | RTA` };
}

export const dynamic = "force-dynamic";

/**
 * One member's payments, opened by clicking their name in the payments list:
 * what they have paid, how each payment split into saving and service fee,
 * and how many contribution days it has paid for.
 */
export default async function MemberPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePermission(
    PERMISSIONS.PAYMENTS_VIEW,
    `/admin/payments/member/${id}`
  );

  const history = await getMemberPaymentHistory(id);
  if (!history) notFound();
  assertSameAssociation(context, history.member, "Member");

  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.memberPayments;
  const { member, standing, payments, totals } = history;

  // Newest first on screen; the running totals were worked out oldest first.
  const rows = [...payments].reverse();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/payments"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {copy.back}
      </Link>

      <PageHeader
        title={fill(copy.title, { name: member.name })}
        description={copy.description}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/members/${member.id}`}>
              <UserRound className="size-4" aria-hidden="true" />
              {copy.openFile}
            </Link>
          </Button>
        }
      />

      <p className="-mt-4 text-sm text-ink-muted">
        <span className="font-mono">{member.memberNumber}</span> ·{" "}
        <span className="font-mono">{member.paymentReference}</span>
        {standing && (
          <>
            {" "}
            ·{" "}
            {fill(copy.sharesLine, {
              shares: member.shares,
              daily: formatMoney(standing.dailyTotal),
            })}
          </>
        )}
      </p>

      <StatGrid columns={4}>
        <StatCard
          label={copy.totalPaid}
          value={formatMoney(totals.credited)}
          hint={fill(copy.totalPaidHint, { count: totals.creditedCount })}
          icon={CreditCard}
          tone="primary"
        />
        <StatCard
          label={copy.saved}
          value={formatMoney(totals.savingsPart)}
          hint={copy.savedHint}
          icon={PiggyBank}
          tone="success"
        />
        <StatCard
          label={copy.serviceFee}
          value={formatMoney(totals.feePart)}
          hint={fill(copy.serviceFeeHint, {
            taken: formatMoney(totals.feesTaken),
            pending: formatMoney(totals.feesPending),
          })}
          icon={Receipt}
        />
        <StatCard
          label={copy.daysCovered}
          value={
            standing
              ? fill(copy.daysCoveredValue, {
                  covered: standing.coveredDays,
                  due: standing.dueDays,
                })
              : "—"
          }
          hint={
            standing ? fill(copy.daysCoveredHint, { missed: standing.missedDays }) : undefined
          }
          icon={CalendarCheck}
          tone={standing && standing.missedDays > 0 ? "warning" : "success"}
        />
      </StatGrid>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{copy.tableTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{copy.tableIntro}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={CreditCard} title={copy.noneTitle} description={copy.noneBody} />
        ) : (
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.colDate}</TableHead>
                  <TableHead>{copy.colPayment}</TableHead>
                  <TableHead align="right">{copy.colAmount}</TableHead>
                  <TableHead align="right">{copy.colSaved}</TableHead>
                  <TableHead align="right">{copy.colFee}</TableHead>
                  <TableHead align="right">{copy.colRunning}</TableHead>
                  <TableHead align="right">{copy.colDays}</TableHead>
                  <TableHead>{d.common.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap text-sm text-ink">
                      {formatDate(payment.transactionDate, locale)}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-sm">
                      <span className="block text-ink">
                        {statusLabel(payment.channel, d.status)}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-muted">
                        {payment.transactionReference ?? payment.externalTransactionId}
                      </span>
                      {payment.payerName && (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                          {payment.payerName}
                          {payment.payerPhone && ` · ${payment.payerPhone}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular className="font-semibold">
                      {formatMoney(payment.amount, {
                        currency: payment.currency,
                        showSymbol: false,
                      })}
                    </TableCell>
                    {payment.credited ? (
                      <>
                        <TableCell align="right" tabular className="text-emerald-700">
                          {formatMoney(payment.savingsPart, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-ink-muted">
                          {formatMoney(payment.feePart, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {formatMoney(payment.runningTotal, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {payment.daysCovered ?? "—"}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={4} align="right" className="text-xs text-ink-muted">
                        {copy.notCredited}
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={payment.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        )}
      </section>
    </div>
  );
}
