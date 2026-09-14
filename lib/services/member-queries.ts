import "server-only";
import { prisma, Prisma } from "@/lib/db/prisma";
import { add, subtract, toMoneyString } from "@/lib/money";
import { assessBorrowing, wholeMonthsBetween } from "@/lib/rules/borrowing";
import { getMemberStanding } from "@/lib/services/contributions";
import { getPolicy } from "@/lib/services/rulebook";
import type { TransactionType } from "@/lib/generated/prisma/enums";

/**
 * Member-scoped read queries.
 *
 * EVERY function here takes a memberId and filters on it. That is the whole
 * point: a member's own pages must be incapable of returning another member's
 * data even if a route parameter is tampered with, so scoping happens in the
 * query rather than in a check the caller might forget.
 */

export interface TransactionFilters {
  type?: TransactionType;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getMemberTransactions(
  memberId: string,
  filters: TransactionFilters = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.SavingsTransactionWhereInput = {
    memberId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { reference: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
            { externalReference: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.savingsTransaction.count({ where }),
    prisma.savingsTransaction.findMany({
      where,
      // Sequence, not createdAt: two transactions posted in the same
      // millisecond would otherwise render in an arbitrary order, and a
      // statement whose running balance appears to go backwards destroys
      // confidence in the whole document.
      orderBy: { sequence: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        sequence: true,
        type: true,
        direction: true,
        status: true,
        channel: true,
        amount: true,
        balanceAfter: true,
        description: true,
        externalReference: true,
        valueDate: true,
        createdAt: true,
      },
    }),
    prisma.savingsTransaction.groupBy({
      by: ["direction"],
      where,
      _sum: { amount: true },
    }),
  ]);

  const credits = totals.find((t) => t.direction === "CREDIT")?._sum.amount ?? 0;
  const debits = totals.find((t) => t.direction === "DEBIT")?._sum.amount ?? 0;

  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    totalIn: toMoneyString(credits),
    totalOut: toMoneyString(debits),
    transactions: rows.map((t) => ({
      id: t.id,
      reference: t.reference,
      sequence: t.sequence,
      type: t.type,
      direction: t.direction,
      status: t.status,
      channel: t.channel,
      amount: t.amount.toFixed(2),
      balanceAfter: t.balanceAfter.toFixed(2),
      description: t.description,
      externalReference: t.externalReference,
      valueDate: t.valueDate,
      createdAt: t.createdAt,
    })),
  };
}

export async function getMemberSavingsAccount(memberId: string) {
  const account = await prisma.savingsAccount.findFirst({
    where: { memberId, isActive: true },
    orderBy: { openedAt: "asc" },
  });

  if (!account) return null;

  return {
    id: account.id,
    accountNumber: account.accountNumber,
    balance: account.balance.toFixed(2),
    lockedBalance: account.lockedBalance.toFixed(2),
    available: toMoneyString(
      subtract(account.balance, account.lockedBalance).lessThan(0)
        ? 0
        : subtract(account.balance, account.lockedBalance)
    ),
    totalDeposits: account.totalDeposits.toFixed(2),
    totalWithdrawals: account.totalWithdrawals.toFixed(2),
    totalInterest: account.totalInterest.toFixed(2),
    totalFees: account.totalFees.toFixed(2),
    currency: account.currency,
    openedAt: account.openedAt,
    lastTransactionAt: account.lastTransactionAt,
    transactionCount: account.lastSequence,
  };
}

export async function getMemberWithdrawals(memberId: string) {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { memberId },
    orderBy: { requestedAt: "desc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      amount: true,
      fee: true,
      netAmount: true,
      status: true,
      reason: true,
      channel: true,
      rejectionReason: true,
      requestedAt: true,
      reviewedAt: true,
      processedAt: true,
    },
  });

  return withdrawals.map((w) => ({
    id: w.id,
    reference: w.reference,
    amount: w.amount.toFixed(2),
    fee: w.fee.toFixed(2),
    netAmount: w.netAmount.toFixed(2),
    status: w.status,
    reason: w.reason,
    channel: w.channel,
    rejectionReason: w.rejectionReason,
    requestedAt: w.requestedAt,
    reviewedAt: w.reviewedAt,
    processedAt: w.processedAt,
  }));
}

export async function getMemberLoans(memberId: string) {
  const [loans, applications] = await Promise.all([
    prisma.loan.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      include: {
        loanProduct: { select: { name: true } },
        installments: { orderBy: { installmentNumber: "asc" } },
      },
    }),
    prisma.loanApplication.findMany({
      where: { memberId, loan: null },
      orderBy: { createdAt: "desc" },
      include: { loanProduct: { select: { name: true } } },
    }),
  ]);

  return {
    loans: loans.map((loan) => ({
      id: loan.id,
      reference: loan.reference,
      productName: loan.loanProduct.name,
      status: loan.status,
      principal: loan.principal.toFixed(2),
      interestRate: loan.interestRate.toFixed(2),
      termMonths: loan.termMonths,
      frequency: loan.frequency,
      totalPayable: loan.totalPayable.toFixed(2),
      totalPaid: loan.totalPaid.toFixed(2),
      outstanding: toMoneyString(
        add(
          loan.principalOutstanding,
          loan.interestOutstanding,
          loan.feesOutstanding,
          loan.penaltyOutstanding
        )
      ),
      principalOutstanding: loan.principalOutstanding.toFixed(2),
      interestOutstanding: loan.interestOutstanding.toFixed(2),
      feesOutstanding: loan.feesOutstanding.toFixed(2),
      penaltyOutstanding: loan.penaltyOutstanding.toFixed(2),
      daysOverdue: loan.daysOverdue,
      overdueAmount: loan.overdueAmount.toFixed(2),
      disbursedAt: loan.disbursedAt,
      disbursedAmount: loan.disbursedAmount?.toFixed(2) ?? null,
      maturityDate: loan.maturityDate,
      progressPercent: loan.totalPayable.greaterThan(0)
        ? Math.min(
            100,
            Math.round(loan.totalPaid.dividedBy(loan.totalPayable).times(100).toNumber())
          )
        : 0,
      installments: loan.installments.map((i) => ({
        id: i.id,
        number: i.installmentNumber,
        dueDate: i.dueDate,
        status: i.status,
        principalDue: i.principalDue.toFixed(2),
        interestDue: i.interestDue.toFixed(2),
        feesDue: i.feesDue.toFixed(2),
        penaltyDue: i.penaltyDue.toFixed(2),
        totalDue: i.totalDue.toFixed(2),
        totalPaid: i.totalPaid.toFixed(2),
        remaining: toMoneyString(subtract(i.totalDue, i.totalPaid)),
        balanceAfter: i.balanceAfter.toFixed(2),
        daysOverdue: i.daysOverdue,
      })),
    })),
    applications: applications.map((a) => ({
      id: a.id,
      reference: a.reference,
      productName: a.loanProduct.name,
      status: a.status,
      requestedAmount: a.requestedAmount.toFixed(2),
      approvedAmount: a.approvedAmount?.toFixed(2) ?? null,
      purpose: a.purpose,
      termMonths: a.termMonths,
      submittedAt: a.submittedAt,
      reviewNotes: a.reviewNotes,
      rejectionReason: a.rejectionReason,
      infoRequested: a.infoRequested,
      maxEligibleAmount: a.maxEligibleAmount?.toFixed(2) ?? null,
    })),
  };
}

/**
 * Everything the repayments screen needs: the schedule across a member's open
 * loans, and the repayments already posted against them.
 *
 * Instalments are flattened across loans and sorted by due date, because that
 * is the question the member is actually asking — "what do I owe next?" — not
 * "what does loan #2 look like?".
 */
export async function getMemberRepayments(memberId: string) {
  const [loans, history] = await Promise.all([
    prisma.loan.findMany({
      where: {
        memberId,
        status: { in: ["ACTIVE", "DISBURSED", "OVERDUE", "PENDING_DISBURSEMENT"] },
      },
      orderBy: { disbursedAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        currency: true,
        totalPayable: true,
        totalPaid: true,
        principalOutstanding: true,
        interestOutstanding: true,
        feesOutstanding: true,
        penaltyOutstanding: true,
        maturityDate: true,
        loanProduct: { select: { name: true } },
        installments: { orderBy: { installmentNumber: "asc" } },
      },
    }),

    prisma.loanTransaction.findMany({
      where: { loan: { memberId }, type: "REPAYMENT" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        reference: true,
        amount: true,
        principalPortion: true,
        interestPortion: true,
        feesPortion: true,
        penaltyPortion: true,
        balanceAfter: true,
        channel: true,
        description: true,
        createdAt: true,
        loan: { select: { reference: true } },
      },
    }),
  ]);

  const schedule = loans.flatMap((loan) =>
    loan.installments.map((i) => ({
      id: i.id,
      loanId: loan.id,
      loanReference: loan.reference,
      productName: loan.loanProduct.name,
      number: i.installmentNumber,
      dueDate: i.dueDate,
      status: i.status,
      totalDue: i.totalDue.toFixed(2),
      totalPaid: i.totalPaid.toFixed(2),
      remaining: toMoneyString(
        subtract(i.totalDue, i.totalPaid).lessThan(0)
          ? 0
          : subtract(i.totalDue, i.totalPaid)
      ),
      principalDue: i.principalDue.toFixed(2),
      interestDue: i.interestDue.toFixed(2),
      penaltyDue: i.penaltyDue.toFixed(2),
      daysOverdue: i.daysOverdue,
      paidAt: i.paidAt,
    }))
  );

  schedule.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const outstanding = loans.reduce(
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

  const unpaid = schedule.filter(
    (i) => i.status !== "PAID" && i.status !== "WAIVED"
  );

  return {
    loanCount: loans.length,
    totalOutstanding: toMoneyString(outstanding),
    arrears: toMoneyString(
      schedule
        .filter((i) => i.status === "OVERDUE" || i.daysOverdue > 0)
        .reduce((total, i) => add(total, i.remaining), add(0))
    ),
    nextDue: unpaid[0] ?? null,
    schedule,
    history: history.map((t) => ({
      id: t.id,
      reference: t.reference,
      loanReference: t.loan.reference,
      amount: t.amount.toFixed(2),
      principalPortion: t.principalPortion.toFixed(2),
      interestPortion: t.interestPortion.toFixed(2),
      feesPortion: t.feesPortion.toFixed(2),
      penaltyPortion: t.penaltyPortion.toFixed(2),
      balanceAfter: t.balanceAfter.toFixed(2),
      channel: t.channel,
      description: t.description,
      createdAt: t.createdAt,
    })),
  };
}

/**
 * The member's own profile.
 *
 * Deliberately separate from the admin `getMemberProfile`: that one includes
 * internal admin notes, which the member must never see. Selecting fields
 * explicitly here is what keeps them out.
 */
export async function getMemberSelfProfile(memberId: string) {
  return prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      status: true,
      kycStatus: true,
      nationalId: true,
      dateOfBirth: true,
      gender: true,
      occupation: true,
      businessName: true,
      addressLine1: true,
      city: true,
      district: true,
      province: true,
      mobileMoneyNumber: true,
      bankAccountNumber: true,
      nextOfKinName: true,
      nextOfKinPhone: true,
      nextOfKinRelation: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      association: {
        select: { name: true, code: true, currency: true, email: true, phone: true },
      },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          passwordChangedAt: true,
        },
      },
    },
  });
}

export async function getMemberNotifications(userId: string, page = 1, pageSize = 30) {
  const [total, rows, unread] = await Promise.all([
    prisma.notification.count({ where: { userId } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        title: true,
        body: true,
        severity: true,
        actionUrl: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    total,
    unread,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    notifications: rows,
  };
}

/**
 * What a member may apply for, decided by the rulebook.
 *
 * Returns the association's live policy and the borrowing assessment rather
 * than a product-derived ceiling, because the form has to show the member the
 * same answer the server will give them on submit. See the header of
 * components/dashboard/LoanApplicationForm.tsx for why that matters.
 */
export async function getAvailableLoanProducts(
  memberId: string,
  associationId: string
) {
  const [products, account, activeLoans, member, policy, standing] = await Promise.all([
    prisma.loanProduct.findMany({
      where: { associationId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.savingsAccount.findFirst({
      where: { memberId, isActive: true },
      select: { balance: true },
    }),
    prisma.loan.count({
      where: {
        memberId,
        status: { in: ["PENDING_DISBURSEMENT", "DISBURSED", "ACTIVE", "OVERDUE"] },
      },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        joinedAt: true,
        createdAt: true,
        // Approval is when the obligation actually began, and it is what the
        // member's rulebook page counts tenure from.
        approvedAt: true,
        // LENDING_UNLOCK_MONTHS is measured from the association's own age.
        association: { select: { createdAt: true } },
      },
    }),
    getPolicy(associationId),
    // Arrears and unpaid fines both block borrowing under
    // ARREARS_BLOCK_BORROWING, so the assessment needs the member's standing.
    getMemberStanding(memberId),
  ]);

  const balance = account?.balance ?? new Prisma.Decimal(0);
  const now = new Date();

  // Anchored on approval, then joining, then creation — the same order the
  // member's rules page uses. Two screens counting a member's tenure from
  // different dates is how a countdown disagrees with the gate it counts down to.
  const since = member?.approvedAt ?? member?.joinedAt ?? member?.createdAt ?? now;

  // WHOLE CALENDAR MONTHS, not elapsed days over an average month length.
  // The 30.44-day division this replaced drifts past the anniversary and
  // produces the case wholeMonthsBetween was written to prevent: a member
  // being told they have five months on the day they know is six.
  const membershipMonths = wholeMonthsBetween(since, now);
  const associationMonths = wholeMonthsBetween(
    member?.association.createdAt ?? now,
    now
  );

  // THE RULEBOOK DECIDES, HERE AND ON SUBMIT, FROM THE SAME FUNCTION.
  //
  // `assessBorrowing` is deliberately pure and not server-only so that the
  // figure a member is shown before they apply is the figure they are judged
  // against when they do. Previously this returned a ceiling of savings ×
  // the product's multiplier, which the server then refused — a form that
  // invites a request the rulebook forbids.
  const assessment = assessBorrowing({
    policy,
    savingsBalance: balance.toFixed(2),
    membershipMonths,
    associationMonths,
    missedDays: standing?.missedDays ?? 0,
    outstandingFines: standing?.outstandingFineAmount ?? "0.00",
    hasActiveLoan: activeLoans > 0,
  });

  return {
    savingsBalance: balance.toFixed(2),
    membershipMonths,
    associationMonths,
    hasActiveLoan: activeLoans > 0,

    /// The arrears half of the picture. Carried out so the form can re-run
    /// `assessBorrowing` in the browser as the member types an amount, rather
    /// than asking the server what it already worked out once.
    missedDays: standing?.missedDays ?? 0,
    outstandingFines: standing?.outstandingFineAmount ?? "0.00",

    /// The live rulebook, passed to the browser so the form can re-assess as
    /// the member types without a round trip. Every field is a string, number
    /// or boolean, so it crosses the server/client boundary unchanged.
    policy,
    /// What the member may take today, why not, and what would change it.
    assessment,

    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      // Carried only so the preview can run the SAME schedule the server
      // builds at disbursement. Nothing here gates the application any more:
      // the product's own savings multiple, minimum balance and tenure gate
      // are no longer read, because the rulebook covers all three.
      interestRate: p.interestRate.toFixed(2),
      interestMethod: p.interestMethod,
      minAmount: p.minAmount.toFixed(2),
      maxAmount: p.maxAmount.toFixed(2),
      minTermMonths: p.minTermMonths,
      maxTermMonths: p.maxTermMonths,
      allowedFrequencies: p.allowedFrequencies,
      defaultFrequency: p.defaultFrequency,
      processingFeeType: p.processingFeeType,
      processingFeeValue: p.processingFeeValue.toFixed(2),
      insuranceFeeType: p.insuranceFeeType,
      insuranceFeeValue: p.insuranceFeeValue.toFixed(2),
      requiresGuarantors: p.requiresGuarantors,
      minimumGuarantors: p.minimumGuarantors,
      singleActiveLoan: p.singleActiveLoan,
    })),
  };
}
