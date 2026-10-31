import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { AlertTriangle, Banknote, CalendarClock, HandCoins } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getMemberRepayments } from "@/lib/services/member-queries";
import { formatMoney, isPositive } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize, split } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
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
    title: d.member.repayments.title,
  };
}

export const dynamic = "force-dynamic";

export default async function MemberRepaymentsPage() {
  const context = await requireMember("/dashboard/loans/repayments");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.repayments;

  const data = await getMemberRepayments(context.member!.id);
  const date = (value: Date) => formatDate(value, locale);

  if (data.loanCount === 0) {
    return (
      <div>
        <PageHeader title={copy.title} description={copy.description} />
        <EmptyState
          icon={HandCoins}
          title={copy.noLoansTitle}
          description={copy.noLoansBody}
          action={
            <Link
              href="/dashboard/loans/apply"
              className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              {copy.applyAction}
            </Link>
          }
        />
      </div>
    );
  }

  const inArrears = isPositive(data.arrears);
  const [noteBefore, noteAfter] = split(copy.matchingNote, "reference");

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {inArrears && (
        <Alert variant="error" title={copy.arrearsTitle}>
          {fill(copy.arrearsBody, { amount: formatMoney(data.arrears) })}
        </Alert>
      )}

      <StatGrid columns={3}>
        <StatCard
          label={copy.totalOutstanding}
          value={formatMoney(data.totalOutstanding)}
          hint={pluralize(copy.acrossLoans, data.loanCount)}
          icon={HandCoins}
          tone="primary"
        />
        <StatCard
          label={copy.nextInstalment}
          value={data.nextDue ? formatMoney(data.nextDue.remaining) : "—"}
          hint={
            data.nextDue
              ? fill(copy.dueOn, { date: date(data.nextDue.dueDate) })
              : copy.nothingScheduled
          }
          icon={CalendarClock}
        />
        <StatCard
          label={copy.inArrears}
          value={formatMoney(data.arrears)}
          hint={inArrears ? copy.settleSoon : copy.upToDate}
          icon={AlertTriangle}
          tone={inArrears ? "danger" : "success"}
        />
      </StatGrid>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.schedule}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{copy.loan}</TableHead>
                <TableHead>{d.member.loans.dueDate}</TableHead>
                <TableHead align="right">{copy.instalment}</TableHead>
                <TableHead align="right">{d.member.loans.paid}</TableHead>
                <TableHead align="right">{d.member.loans.remaining}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.schedule.length === 0 ? (
                <TableEmpty colSpan={7}>{copy.noSchedule}</TableEmpty>
              ) : (
                data.schedule.map((instalment) => (
                  <TableRow key={instalment.id}>
                    <TableCell tabular className="text-ink-muted">
                      {instalment.number}
                    </TableCell>
                    <TableCell>
                      <span className="block font-mono text-xs text-ink-muted">
                        {instalment.loanReference}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {instalment.productName}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {date(instalment.dueDate)}
                      {instalment.daysOverdue > 0 && (
                        <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                          {pluralize(copy.daysLate, instalment.daysOverdue, {
                            days: instalment.daysOverdue,
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(instalment.totalDue, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-emerald-700">
                      {formatMoney(instalment.totalPaid, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(instalment.remaining, { showSymbol: false })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={instalment.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.received}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead>{d.common.date}</TableHead>
                <TableHead>{copy.loan}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead align="right">{d.member.loans.principal}</TableHead>
                <TableHead align="right">{d.member.loans.interest}</TableHead>
                <TableHead align="right">{copy.penalty}</TableHead>
                <TableHead align="right">{copy.balanceAfter}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.length === 0 ? (
                <TableEmpty colSpan={8}>{copy.noneReceived}</TableEmpty>
              ) : (
                data.history.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {payment.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {date(payment.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {payment.loanReference}
                    </TableCell>
                    <TableCell align="right" tabular className="text-emerald-700">
                      {formatMoney(payment.amount, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(payment.principalPortion, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(payment.interestPortion, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(payment.penaltyPortion, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(payment.balanceAfter, { showSymbol: false })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-ink-muted">
        <Banknote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {noteBefore}
          <strong className="font-mono text-ink">
            {context.member!.paymentReference}
          </strong>
          {noteAfter}
        </span>
      </p>
    </div>
  );
}
