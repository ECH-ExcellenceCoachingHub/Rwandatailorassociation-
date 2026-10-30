import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, HandCoins, Plus } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getMemberLoans } from "@/lib/services/member-queries";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { RepaymentProgress } from "@/components/dashboard/charts/SavingsChart";
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
    title: d.member.loans.title,
  };
}

export const dynamic = "force-dynamic";

export default async function MemberLoansPage() {
  const context = await requireMember("/dashboard/loans");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.loans;

  const { loans, applications } = await getMemberLoans(context.member!.id);

  const hasNothing = loans.length === 0 && applications.length === 0;
  const date = (value: Date | string) => formatDate(value, locale);

  return (
    <div className="space-y-7">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/loans/apply">
              <Plus className="size-4" aria-hidden="true" />
              {copy.applyAction}
            </Link>
          </Button>
        }
      />

      {hasNothing && (
        <EmptyState
          icon={HandCoins}
          title={copy.noneTitle}
          description={copy.noneBody}
          action={
            <Button asChild>
              <Link href="/dashboard/loans/apply">{copy.applyAction}</Link>
            </Button>
          }
        />
      )}

      {applications.length > 0 && (
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
            {copy.applications}
          </h2>

          <div className="space-y-3">
            {applications.map((application) => (
              <div
                key={application.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-base font-semibold text-ink">
                      {formatMoney(application.requestedAmount)}
                      <span className="ml-2 text-sm font-normal text-ink-muted">
                        {application.productName}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">
                      {application.reference}
                      {application.submittedAt &&
                        ` · ${fill(copy.submittedOn, {
                          date: date(application.submittedAt),
                        })}`}
                    </p>
                  </div>
                  <StatusBadge status={application.status} />
                </div>

                <p className="mt-3 text-sm text-ink-muted">
                  <span className="font-medium text-ink">{copy.purpose}</span>{" "}
                  {application.purpose}
                </p>

                {application.status === "MORE_INFORMATION_REQUIRED" &&
                  application.infoRequested && (
                    <Alert variant="warning" className="mt-4">
                      <strong>{copy.needMoreInformation}</strong>{" "}
                      {application.infoRequested}
                    </Alert>
                  )}

                {application.status === "REJECTED" && application.rejectionReason && (
                  <Alert variant="error" className="mt-4">
                    <strong>{copy.notApproved}</strong> {application.rejectionReason}
                  </Alert>
                )}

                {application.status === "APPROVED" && (
                  <Alert variant="success" className="mt-4">
                    {copy.approvedFor}{" "}
                    <strong>
                      {formatMoney(
                        application.approvedAmount ?? application.requestedAmount
                      )}
                    </strong>
                    {copy.approvedBody}
                  </Alert>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {loans.map((loan) => (
        <section key={loan.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-ink">
                {formatMoney(loan.principal)}
                <span className="ml-2 text-sm font-normal text-ink-muted">
                  {loan.productName}
                </span>
              </h2>
              <p className="mt-0.5 font-mono text-xs text-ink-muted">
                {loan.reference}
                {loan.disbursedAt &&
                  ` · ${fill(copy.disbursedOn, { date: date(loan.disbursedAt) })}`}
              </p>
            </div>
            <StatusBadge
              status={loan.status}
              tone={loan.daysOverdue > 0 ? "danger" : undefined}
            />
          </div>

          {loan.daysOverdue > 0 && (
            <Alert variant="error" className="mt-4">
              <strong>
                {pluralize(copy.overdueAmount, loan.daysOverdue, {
                  amount: formatMoney(loan.overdueAmount),
                  days: loan.daysOverdue,
                })}
              </strong>{" "}
              {copy.penaltiesMayApply}
            </Alert>
          )}

          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={copy.interestRate}
              value={`${loan.interestRate}% ${copy.perYear}`}
            />
            <Figure label={copy.totalPayable} value={formatMoney(loan.totalPayable)} />
            <Figure
              label={copy.repaid}
              value={formatMoney(loan.totalPaid)}
              tone="good"
            />
            <Figure
              label={copy.outstanding}
              value={formatMoney(loan.outstanding)}
              tone={loan.daysOverdue > 0 ? "bad" : undefined}
            />
          </dl>

          <div className="mt-5">
            <RepaymentProgress
              paid={loan.totalPaid}
              total={loan.totalPayable}
              percent={loan.progressPercent}
              overdue={loan.daysOverdue > 0}
            />
          </div>

          {loan.installments.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold text-ink">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                {copy.schedule}
              </h3>

              <TableWrapper className="shadow-none">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{copy.dueDate}</TableHead>
                      <TableHead align="right">{copy.principal}</TableHead>
                      <TableHead align="right">{copy.interest}</TableHead>
                      <TableHead align="right">{copy.fees}</TableHead>
                      <TableHead align="right">{copy.totalDue}</TableHead>
                      <TableHead align="right">{copy.paid}</TableHead>
                      <TableHead align="right">{copy.remaining}</TableHead>
                      <TableHead>{d.common.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loan.installments.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm text-ink-muted">{i.number}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {date(i.dueDate)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm">
                          {formatMoney(i.principalDue, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm">
                          {formatMoney(i.interestDue, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm">
                          {formatMoney(i.feesDue, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm font-semibold">
                          {formatMoney(i.totalDue, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm text-emerald-700">
                          {formatMoney(i.totalPaid, { showSymbol: false })}
                        </TableCell>
                        <TableCell align="right" tabular className="text-sm">
                          {formatMoney(i.remaining, { showSymbol: false })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={i.status} size="sm" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 font-heading text-base font-bold tabular-nums ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
