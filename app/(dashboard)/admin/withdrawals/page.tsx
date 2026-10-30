import type { Metadata } from "next";
import { ArrowUpFromLine } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { WithdrawalReviewTable } from "@/components/dashboard/WithdrawalReviewTable";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.withdrawals.title,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminWithdrawalsPage() {
  const context = await requirePermission(
    PERMISSIONS.WITHDRAWALS_VIEW_ALL,
    "/admin/withdrawals"
  );

  const associationId = resolveAssociationScope(context);
  const { d } = await getDashboardCopy();
  const copy = d.admin.withdrawals;

  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      ...(associationId ? { associationId } : {}),
      status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
    },
    orderBy: { requestedAt: "asc" },
    take: 100,
    select: {
      id: true,
      reference: true,
      amount: true,
      fee: true,
      netAmount: true,
      status: true,
      reason: true,
      channel: true,
      destinationDetail: true,
      balanceAtRequest: true,
      requestedAt: true,
      member: {
        select: {
          memberNumber: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      savingsAccount: { select: { balance: true } },
    },
  });

  const canApprove = context.permissions.has(PERMISSIONS.WITHDRAWALS_APPROVE);
  const canPayout = context.permissions.has(PERMISSIONS.WITHDRAWALS_PROCESS);

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      {withdrawals.length === 0 ? (
        <EmptyState
          icon={ArrowUpFromLine}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <WithdrawalReviewTable
          withdrawals={withdrawals.map((w) => ({
            id: w.id,
            reference: w.reference,
            memberName: `${w.member.user.firstName} ${w.member.user.lastName}`.trim(),
            memberNumber: w.member.memberNumber,
            memberPhone: w.member.user.phone,
            amount: w.amount.toFixed(2),
            fee: w.fee.toFixed(2),
            netAmount: w.netAmount.toFixed(2),
            status: w.status,
            reason: w.reason,
            channel: w.channel,
            destinationDetail: w.destinationDetail,
            balanceAtRequest: w.balanceAtRequest.toFixed(2),
            currentBalance: w.savingsAccount.balance.toFixed(2),
            requestedAt: w.requestedAt,
          }))}
          canApprove={canApprove}
          canPayout={canPayout}
        />
      )}
    </div>
  );
}
