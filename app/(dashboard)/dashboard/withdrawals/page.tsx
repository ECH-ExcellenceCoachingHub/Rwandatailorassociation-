import type { Metadata } from "next";
import { ArrowUpFromLine } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import {
  getMemberSavingsAccount,
  getMemberWithdrawals,
} from "@/lib/services/member-queries";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { WithdrawalRequestForm } from "@/components/dashboard/WithdrawalRequestForm";
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
    title: d.member.withdrawals.title,
  };
}

export const dynamic = "force-dynamic";

export default async function WithdrawalsPage() {
  const context = await requireMember("/dashboard/withdrawals");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.withdrawals;

  const [account, withdrawals, rule] = await Promise.all([
    getMemberSavingsAccount(context.member!.id),
    getMemberWithdrawals(context.member!.id),
    prisma.savingsRule.findUnique({
      where: { associationId: context.user.associationId! },
    }),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      {rule && !rule.allowWithdrawals ? (
        <Alert variant="warning" title={copy.suspendedTitle}>
          {copy.suspendedBody}
        </Alert>
      ) : (
        account && (
          <WithdrawalRequestForm
            available={account.available}
            balance={account.balance}
            minimum={rule?.minimumWithdrawal.toFixed(2) ?? "0.00"}
            maximum={rule?.maximumWithdrawal?.toFixed(2) ?? null}
            minimumBalance={rule?.minimumBalance.toFixed(2) ?? "0.00"}
            feeType={rule?.withdrawalFeeType ?? "FIXED"}
            feeValue={rule?.withdrawalFeeValue.toFixed(2) ?? "0.00"}
            requiresApproval={rule?.withdrawalRequiresApproval ?? true}
          />
        )
      )}

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.yourRequests}
        </h2>

        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead>{copy.requested}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead align="right">{copy.fee}</TableHead>
                <TableHead align="right">{copy.youReceive}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.length === 0 ? (
                <TableEmpty colSpan={6}>{copy.noneYet}</TableEmpty>
              ) : (
                withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {w.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDate(w.requestedAt, locale)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(w.amount, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(w.fee, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="font-semibold">
                      {formatMoney(w.netAmount, { showSymbol: false })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={w.status} size="sm" />
                      {w.status === "REJECTED" && w.rejectionReason && (
                        <span className="mt-1 block max-w-xs text-[11px] text-red-600">
                          {w.rejectionReason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      {withdrawals.length === 0 && (
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ArrowUpFromLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {copy.reviewNote}
        </p>
      )}
    </div>
  );
}
