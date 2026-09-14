import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, subtract, toMoneyString } from "@/lib/money";
import { availableBalance } from "@/lib/services/ledger";
import { getMemberStanding, type ContributionStatus } from "@/lib/services/contributions";
import { listMemberFines, type MemberFines } from "@/lib/services/fines";

/**
 * Member dashboard data.
 *
 * Answers the five questions a member opens the app to ask: how much have I
 * saved, how much do I owe, when is my next payment, how much can I borrow,
 * and what has happened recently.
 *
 * Every figure comes from the ledger or from loan records — nothing is
 * computed from a client-supplied value, and nothing is estimated.
 */

export interface MemberDashboardData {
  savings: {
    balance: string;
    available: string;
    locked: string;
    totalDeposits: string;
    totalWithdrawals: string;
    accountNumber: string;
    currency: string;
    lastTransactionAt: Date | null;
  };
  loan: {
    hasActiveLoan: boolean;
    principal: string;
    totalPayable: string;
    totalPaid: string;
    outstanding: string;
    reference: string | null;
    status: string | null;
    progressPercent: number;
    daysOverdue: number;
    nextInstalment: {
      amount: string;
      dueDate: Date;
      status: string;
      installmentNumber: number;
    } | null;
  };
  application: {
    reference: string;
    status: string;
    requestedAmount: string;
    submittedAt: Date | null;
  } | null;
  recentTransactions: {
    id: string;
    reference: string;
    type: string;
    direction: string;
    amount: string;
    balanceAfter: string;
    description: string | null;
    channel: string;
    status: string;
    createdAt: Date;
  }[];
  monthlySavings: { month: string; deposits: string; withdrawals: string; balance: string }[];
  unreadNotifications: number;
  paymentReference: string;

  /// WHERE THEY STAND ON THE DAILY OBLIGATION.
  ///
  /// The dashboard used to answer only "what have I got" — balance, loan, next
  /// repayment — and never "what do I owe today". That is the half a member is
  /// fined over, so leaving it to another screen meant the first many people
  /// heard of the rule was the day it caught them.
  ///
  /// Null only when the member has no standing record to compute from, which
  /// the page renders as absence rather than as zeroes.
  standing: {
    status: ContributionStatus;
    /// What one day of membership actually costs, and its two halves. Shown
    /// together for the same reason the account page shows them together: a
    /// member told only the savings figure pays exactly that and is then found
    /// behind by a fee nobody named.
    dailyTotal: string;
    dailySavings: string;
    dailyFee: string;
    dueDays: number;
    coveredDays: number;
    missedDays: number;
    /// Days left before the next fine; 0 means tonight.
    daysUntilFine: number;
    arrearsTotal: string;
    /// Arrears plus unpaid fines — the one figure a member can act on.
    clearingAmount: string;
    outstandingFines: string;
  } | null;

  /// Fines of both kinds, so the discipline record travels with the money.
  fines: MemberFines;
}

export async function getMemberDashboard(
  memberId: string,
  userId: string
): Promise<MemberDashboardData | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      paymentReference: true,
      associationId: true,
      savingsAccounts: {
        where: { isActive: true },
        orderBy: { openedAt: "asc" },
        take: 1,
      },
    },
  });

  if (!member || member.savingsAccounts.length === 0) return null;

  const account = member.savingsAccounts[0];

  const [
    activeLoan,
    pendingApplication,
    recentTransactions,
    unread,
    history,
    standing,
    fines,
  ] = await Promise.all([
      prisma.loan.findFirst({
        where: {
          memberId,
          status: { in: ["DISBURSED", "ACTIVE", "OVERDUE", "PENDING_DISBURSEMENT"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          reference: true,
          status: true,
          principal: true,
          totalPayable: true,
          totalPaid: true,
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
          daysOverdue: true,
          installments: {
            where: { status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID", "OVERDUE"] } },
            orderBy: { dueDate: "asc" },
            take: 1,
            select: {
              installmentNumber: true,
              dueDate: true,
              totalDue: true,
              totalPaid: true,
              status: true,
            },
          },
        },
      }),

      prisma.loanApplication.findFirst({
        where: {
          memberId,
          status: {
            in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED"],
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          reference: true,
          status: true,
          requestedAmount: true,
          submittedAt: true,
        },
      }),

      prisma.savingsTransaction.findMany({
        where: { savingsAccountId: account.id },
        orderBy: { sequence: "desc" },
        take: 8,
        select: {
          id: true,
          reference: true,
          type: true,
          direction: true,
          amount: true,
          balanceAfter: true,
          description: true,
          channel: true,
          status: true,
          createdAt: true,
        },
      }),

      prisma.notification.count({ where: { userId, readAt: null } }),

      // Twelve months of movement for the growth chart, aggregated in the
      // database rather than by pulling every transaction into memory.
      prisma.$queryRaw<
        { month: string; deposits: string; withdrawals: string; closing: string }[]
      >`
        SELECT
          to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
          COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0)::text AS deposits,
          COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0)::text  AS withdrawals,
          (
            SELECT "balanceAfter"::text
            FROM savings_transactions inner_t
            WHERE inner_t."savingsAccountId" = outer_t."savingsAccountId"
              AND date_trunc('month', inner_t."createdAt") = date_trunc('month', outer_t."createdAt")
            ORDER BY inner_t.sequence DESC
            LIMIT 1
          ) AS closing
        FROM savings_transactions outer_t
        WHERE "savingsAccountId" = ${account.id}
          AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
        GROUP BY date_trunc('month', "createdAt"), "savingsAccountId", "createdAt"
        ORDER BY month ASC
      `,

      // Both scope themselves to this member and are safe for somebody with no
      // fines and no standing record — an empty position, not a failure.
      getMemberStanding(memberId),
      listMemberFines(memberId),
    ]);

  const outstanding = activeLoan
    ? add(
        activeLoan.principalOutstanding,
        activeLoan.interestOutstanding,
        activeLoan.feesOutstanding,
        activeLoan.penaltyOutstanding
      )
    : null;

  const nextInstalment = activeLoan?.installments[0] ?? null;

  return {
    savings: {
      balance: account.balance.toFixed(2),
      available: availableBalance(account.balance, account.lockedBalance),
      locked: account.lockedBalance.toFixed(2),
      totalDeposits: account.totalDeposits.toFixed(2),
      totalWithdrawals: account.totalWithdrawals.toFixed(2),
      accountNumber: account.accountNumber,
      currency: account.currency,
      lastTransactionAt: account.lastTransactionAt,
    },
    loan: {
      hasActiveLoan: Boolean(activeLoan),
      principal: activeLoan?.principal.toFixed(2) ?? "0.00",
      totalPayable: activeLoan?.totalPayable.toFixed(2) ?? "0.00",
      totalPaid: activeLoan?.totalPaid.toFixed(2) ?? "0.00",
      outstanding: outstanding ? toMoneyString(outstanding) : "0.00",
      reference: activeLoan?.reference ?? null,
      status: activeLoan?.status ?? null,
      progressPercent:
        activeLoan && activeLoan.totalPayable.greaterThan(0)
          ? Math.min(
              100,
              Math.round(
                activeLoan.totalPaid.dividedBy(activeLoan.totalPayable).times(100).toNumber()
              )
            )
          : 0,
      daysOverdue: activeLoan?.daysOverdue ?? 0,
      nextInstalment: nextInstalment
        ? {
            amount: toMoneyString(
              subtract(nextInstalment.totalDue, nextInstalment.totalPaid)
            ),
            dueDate: nextInstalment.dueDate,
            status: nextInstalment.status,
            installmentNumber: nextInstalment.installmentNumber,
          }
        : null,
    },
    application: pendingApplication
      ? {
          reference: pendingApplication.reference,
          status: pendingApplication.status,
          requestedAmount: pendingApplication.requestedAmount.toFixed(2),
          submittedAt: pendingApplication.submittedAt,
        }
      : null,
    standing: standing
      ? {
          status: standing.status,
          dailyTotal: standing.dailyTotal,
          dailySavings: standing.dailySavings,
          dailyFee: standing.dailyFee,
          dueDays: standing.dueDays,
          coveredDays: standing.coveredDays,
          missedDays: standing.missedDays,
          daysUntilFine: standing.daysUntilFine,
          arrearsTotal: standing.arrearsTotal,
          clearingAmount: standing.clearingAmount,
          outstandingFines: standing.outstandingFineAmount,
        }
      : null,
    fines,
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      type: t.type,
      direction: t.direction,
      amount: t.amount.toFixed(2),
      balanceAfter: t.balanceAfter.toFixed(2),
      description: t.description,
      channel: t.channel,
      status: t.status,
      createdAt: t.createdAt,
    })),
    monthlySavings: collapseMonths(history),
    unreadNotifications: unread,
    paymentReference: member.paymentReference,
  };
}

/**
 * The month aggregate groups by createdAt as well as month (needed for the
 * correlated closing-balance subquery), so rows repeat per month. Collapse
 * them, summing movements and keeping the last closing balance.
 */
function collapseMonths(
  rows: { month: string; deposits: string; withdrawals: string; closing: string | null }[]
): { month: string; deposits: string; withdrawals: string; balance: string }[] {
  const byMonth = new Map<
    string,
    { deposits: string; withdrawals: string; balance: string }
  >();

  for (const row of rows) {
    const existing = byMonth.get(row.month);
    byMonth.set(row.month, {
      deposits: toMoneyString(add(existing?.deposits ?? "0", row.deposits)),
      withdrawals: toMoneyString(add(existing?.withdrawals ?? "0", row.withdrawals)),
      balance: row.closing ?? existing?.balance ?? "0.00",
    });
  }

  return [...byMonth.entries()]
    .map(([month, values]) => ({ month, ...values }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
