import "server-only";
import { prisma, Prisma } from "@/lib/db/prisma";
import { add, toMoneyString } from "@/lib/money";

/**
 * Association admin dashboard data.
 *
 * Answers what an administrator opens the screen to ask: how much money do we
 * hold, what came in today, who needs a loan, who is overdue, and which
 * payments are sitting unattributed.
 *
 * Aggregates are computed in the database rather than by loading rows into
 * memory — an association with ten thousand transactions should not stream all
 * of them to render six tiles.
 */

export interface AdminDashboardData {
  members: {
    total: number;
    active: number;
    pendingApproval: number;
    suspended: number;
    joinedThisMonth: number;
  };
  savings: {
    totalBalance: string;
    totalDeposits: string;
    totalWithdrawals: string;
    depositsToday: string;
    depositsThisMonth: string;
    withdrawalsThisMonth: string;
    transactionsToday: number;
  };
  loans: {
    totalDisbursed: string;
    activeCount: number;
    outstanding: string;
    overdueCount: number;
    overdueAmount: string;
    pendingApplications: number;
    repaidThisMonth: string;
  };
  payments: {
    unmatchedCount: number;
    unmatchedAmount: string;
    failedCount: number;
    suspiciousCount: number;
    processedToday: number;
  };
  queues: {
    pendingWithdrawals: number;
    pendingWithdrawalAmount: string;
    pendingLoanApplications: number;
    pendingMemberApprovals: number;
  };
  charts: {
    monthlyDeposits: { label: string; value: string }[];
    monthlyWithdrawals: { label: string; value: string }[];
    memberGrowth: { label: string; value: string }[];
  };
  recentTransactions: {
    id: string;
    reference: string;
    memberName: string;
    memberNumber: string;
    type: string;
    direction: string;
    amount: string;
    channel: string;
    createdAt: Date;
  }[];
}

export async function getAdminDashboard(
  associationId: string | null
): Promise<AdminDashboardData> {
  // null means platform-wide (super admin). Prisma needs the filter omitted
  // entirely rather than set to null.
  const scope = associationId ? { associationId } : {};

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    memberCounts,
    joinedThisMonth,
    savingsTotals,
    depositsToday,
    transactionsToday,
    depositsThisMonth,
    withdrawalsThisMonth,
    loanTotals,
    activeLoans,
    overdueLoans,
    pendingApplications,
    repaidThisMonth,
    unmatched,
    failedPayments,
    suspiciousPayments,
    processedToday,
    pendingWithdrawals,
    recentTransactions,
    monthlyMovement,
    memberGrowth,
  ] = await Promise.all([
    prisma.member.groupBy({ by: ["status"], where: scope, _count: true }),

    prisma.member.count({ where: { ...scope, createdAt: { gte: startOfMonth } } }),

    prisma.savingsAccount.aggregate({
      where: { ...scope, isActive: true },
      _sum: { balance: true, totalDeposits: true, totalWithdrawals: true },
    }),

    prisma.savingsTransaction.aggregate({
      where: { ...scope, type: "DEPOSIT", status: "COMPLETED", createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),

    prisma.savingsTransaction.count({
      where: { ...scope, createdAt: { gte: startOfToday } },
    }),

    prisma.savingsTransaction.aggregate({
      where: { ...scope, type: "DEPOSIT", status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),

    prisma.savingsTransaction.aggregate({
      where: { ...scope, type: "WITHDRAWAL", status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),

    prisma.loan.aggregate({
      where: { ...scope, disbursedAt: { not: null } },
      _sum: { principal: true },
    }),

    prisma.loan.findMany({
      where: { ...scope, status: { in: ["ACTIVE", "DISBURSED", "OVERDUE"] } },
      select: {
        principalOutstanding: true,
        interestOutstanding: true,
        feesOutstanding: true,
        penaltyOutstanding: true,
      },
    }),

    prisma.loan.aggregate({
      where: { ...scope, status: "OVERDUE" },
      _sum: { overdueAmount: true },
      _count: true,
    }),

    prisma.loanApplication.count({
      where: {
        ...scope,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"] },
      },
    }),

    prisma.loanTransaction.aggregate({
      where: { ...scope, type: "REPAYMENT", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),

    prisma.payment.aggregate({
      where: { ...scope, status: "UNMATCHED" },
      _sum: { amount: true },
      _count: true,
    }),

    prisma.payment.count({ where: { ...scope, status: "FAILED" } }),
    prisma.payment.count({ where: { ...scope, isSuspicious: true } }),
    prisma.payment.count({
      where: { ...scope, status: "PROCESSED", processedAt: { gte: startOfToday } },
    }),

    prisma.withdrawal.aggregate({
      where: { ...scope, status: { in: ["PENDING", "UNDER_REVIEW"] } },
      _sum: { amount: true },
      _count: true,
    }),

    prisma.savingsTransaction.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        reference: true,
        type: true,
        direction: true,
        amount: true,
        channel: true,
        createdAt: true,
        member: {
          select: {
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),

    // Twelve months of deposits and withdrawals in one pass.
    associationId
      ? prisma.$queryRaw<{ month: string; deposits: string; withdrawals: string }[]>`
          SELECT
            to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0)::text    AS deposits,
            COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0)::text AS withdrawals
          FROM savings_transactions
          WHERE "associationId" = ${associationId}
            AND status = 'COMPLETED'
            AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY month ASC
        `
      : prisma.$queryRaw<{ month: string; deposits: string; withdrawals: string }[]>`
          SELECT
            to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0)::text    AS deposits,
            COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0)::text AS withdrawals
          FROM savings_transactions
          WHERE status = 'COMPLETED'
            AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY month ASC
        `,

    associationId
      ? prisma.$queryRaw<{ month: string; joined: string }[]>`
          SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
                 COUNT(*)::text AS joined
          FROM members
          WHERE "associationId" = ${associationId}
            AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY month ASC
        `
      : prisma.$queryRaw<{ month: string; joined: string }[]>`
          SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
                 COUNT(*)::text AS joined
          FROM members
          WHERE "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY month ASC
        `,
  ]);

  const byStatus = Object.fromEntries(
    memberCounts.map((row) => [row.status, row._count])
  ) as Record<string, number>;

  const outstanding = activeLoans.reduce(
    (total, loan) =>
      add(
        total,
        loan.principalOutstanding,
        loan.interestOutstanding,
        loan.feesOutstanding,
        loan.penaltyOutstanding
      ),
    add(0)
  );

  return {
    members: {
      total: memberCounts.reduce((sum, row) => sum + row._count, 0),
      active: byStatus.ACTIVE ?? 0,
      pendingApproval: byStatus.PENDING_APPROVAL ?? 0,
      suspended: byStatus.SUSPENDED ?? 0,
      joinedThisMonth,
    },
    savings: {
      totalBalance: toMoneyString(savingsTotals._sum.balance ?? 0),
      totalDeposits: toMoneyString(savingsTotals._sum.totalDeposits ?? 0),
      totalWithdrawals: toMoneyString(savingsTotals._sum.totalWithdrawals ?? 0),
      depositsToday: toMoneyString(depositsToday._sum.amount ?? 0),
      depositsThisMonth: toMoneyString(depositsThisMonth._sum.amount ?? 0),
      withdrawalsThisMonth: toMoneyString(withdrawalsThisMonth._sum.amount ?? 0),
      transactionsToday,
    },
    loans: {
      totalDisbursed: toMoneyString(loanTotals._sum.principal ?? 0),
      activeCount: activeLoans.length,
      outstanding: toMoneyString(outstanding),
      overdueCount: overdueLoans._count,
      overdueAmount: toMoneyString(overdueLoans._sum.overdueAmount ?? 0),
      pendingApplications,
      repaidThisMonth: toMoneyString(repaidThisMonth._sum.amount ?? 0),
    },
    payments: {
      unmatchedCount: unmatched._count,
      unmatchedAmount: toMoneyString(unmatched._sum.amount ?? 0),
      failedCount: failedPayments,
      suspiciousCount: suspiciousPayments,
      processedToday,
    },
    queues: {
      pendingWithdrawals: pendingWithdrawals._count,
      pendingWithdrawalAmount: toMoneyString(pendingWithdrawals._sum.amount ?? 0),
      pendingLoanApplications: pendingApplications,
      pendingMemberApprovals: byStatus.PENDING_APPROVAL ?? 0,
    },
    // Chart labels are the raw "YYYY-MM" keys, not month names. Naming the
    // month here would name it in one language for every reader; the chart
    // component knows the locale and translates the key at render time.
    charts: {
      monthlyDeposits: monthlyMovement.map((row) => ({
        label: row.month,
        value: toMoneyString(row.deposits),
      })),
      monthlyWithdrawals: monthlyMovement.map((row) => ({
        label: row.month,
        value: toMoneyString(row.withdrawals),
      })),
      memberGrowth: memberGrowth.map((row) => ({
        label: row.month,
        value: row.joined,
      })),
    },
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      memberName: `${t.member.user.firstName} ${t.member.user.lastName}`.trim(),
      memberNumber: t.member.memberNumber,
      type: t.type,
      direction: t.direction,
      amount: t.amount.toFixed(2),
      channel: t.channel,
      createdAt: t.createdAt,
    })),
  };
}

/** Unmatched payment queue, with the candidates the matcher considered. */
export async function getUnmatchedPayments(
  associationId: string | null,
  page = 1,
  pageSize = 25
) {
  const scope = associationId ? { associationId } : {};
  // `satisfies`, not `as const`: Prisma's filter inputs are mutable, so a
  // readonly array is rejected outright.
  const where = {
    ...scope,
    status: { in: ["UNMATCHED", "FAILED"] },
  } satisfies Prisma.PaymentWhereInput;

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        externalTransactionId: true,
        transactionReference: true,
        amount: true,
        currency: true,
        status: true,
        providerStatus: true,
        payerName: true,
        payerPhone: true,
        payerAccount: true,
        narration: true,
        transactionDate: true,
        matchStrategy: true,
        matchConfidence: true,
        isSuspicious: true,
        suspicionReason: true,
        failureReason: true,
        verifiedAt: true,
        reconciliations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { outcome: true, notes: true, candidateIds: true, createdAt: true },
        },
      },
    }),
  ]);

  // Resolve the candidate ids the matcher recorded into names, so the admin
  // sees "2 members share this number: X, Y" rather than two cuids.
  const candidateIds = [
    ...new Set(payments.flatMap((p) => p.reconciliations[0]?.candidateIds ?? [])),
  ];

  const candidates = candidateIds.length
    ? await prisma.member.findMany({
        where: { id: { in: candidateIds } },
        select: {
          id: true,
          memberNumber: true,
          paymentReference: true,
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : [];

  const candidateById = new Map(
    candidates.map((c) => [
      c.id,
      {
        id: c.id,
        memberNumber: c.memberNumber,
        paymentReference: c.paymentReference,
        fullName: `${c.user.firstName} ${c.user.lastName}`.trim(),
      },
    ])
  );

  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    payments: payments.map((p) => ({
      id: p.id,
      externalTransactionId: p.externalTransactionId,
      transactionReference: p.transactionReference,
      amount: p.amount.toFixed(2),
      currency: p.currency,
      status: p.status,
      providerStatus: p.providerStatus,
      payerName: p.payerName,
      payerPhone: p.payerPhone,
      payerAccount: p.payerAccount,
      narration: p.narration,
      transactionDate: p.transactionDate,
      matchStrategy: p.matchStrategy,
      matchConfidence: p.matchConfidence,
      isSuspicious: p.isSuspicious,
      suspicionReason: p.suspicionReason,
      failureReason: p.failureReason,
      // Whether the provider confirmed it. A payment that failed verification
      // must not be creditable, and the UI needs to say why.
      verified: Boolean(p.verifiedAt),
      lastAttempt: p.reconciliations[0]
        ? {
            outcome: p.reconciliations[0].outcome,
            notes: p.reconciliations[0].notes,
            at: p.reconciliations[0].createdAt,
          }
        : null,
      candidates: (p.reconciliations[0]?.candidateIds ?? [])
        .map((id) => candidateById.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    })),
  };
}
