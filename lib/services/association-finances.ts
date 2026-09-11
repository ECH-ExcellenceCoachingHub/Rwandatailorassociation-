import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, gt, subtract, toMoney, toMoneyString } from "@/lib/money";
import {
  listBorrowings,
  LIVE_BORROWING_STATUSES,
  type BorrowingSummary,
} from "@/lib/services/borrowings";
import {
  listInvestments,
  summariseInvestments,
  type InvestmentSummary,
} from "@/lib/services/investments";

/**
 * THE ASSOCIATION'S BOOKS, WRITTEN FOR A MEMBER.
 *
 * Every other service here answers a question about one person. This one
 * answers the questions a member asks about the association itself: how much
 * do we have, what did we earn, what do we owe a bank, and what did the money
 * actually buy us. Until now those were answerable only from a treasurer's
 * notebook read aloud at a general meeting once a year.
 *
 * THREE RULES THIS MODULE HOLDS TO, because a transparency screen that
 * flatters is worse than no screen at all:
 *
 *  1. NOTHING IS ESTIMATED. Every figure below is a sum over posted ledger
 *     rows or over a value an administrator explicitly recorded and is
 *     accountable for in the audit log. There are no projections, no accruals
 *     of income not yet received, and no smoothing.
 *
 *  2. UNREALISED IS NOT INCOME. Interest a member owes but has not paid does
 *     not appear in the surplus — only `interestPortion` on repayment rows
 *     that actually settled does. An association that counted what it is owed
 *     as what it earned would show members a profit it cannot distribute.
 *
 *  3. WHAT IS NOT KNOWN IS NOT INVENTED. The association's cash at bank is not
 *     tracked by this platform, so it is not reported. What is reported is the
 *     residual implied by the books, labelled as such — and if that residual
 *     is negative, it is shown negative, because that means the records are
 *     incomplete and a member is better served knowing it than being shown a
 *     tidy zero.
 *
 * The member's own share is INDICATIVE and is labelled that way everywhere it
 * is rendered. A surplus becomes a member's money when the association resolves
 * to distribute it, not when this function divides it.
 */

export interface AssociationFinances {
  association: {
    name: string;
    code: string;
    currency: string;
  };

  /// Where the association's money sits. The four figures do not add up to a
  /// single total by design: the first is a liability to members, the middle
  /// two are assets, and the last is a liability to a bank.
  position: {
    /// Everything members have saved, summed from their account balances.
    memberSavings: string;
    savingMembers: number;
    /// PRINCIPAL still out with members. Deliberately not principal plus the
    /// interest and fees they also owe: this section accounts for where the
    /// association's money physically went, and only principal ever left the
    /// building. Interest a member has been charged but not yet paid is income
    /// the association is owed, not cash it has parted with, and counting it
    /// here would show more money going out than ever did.
    lentToMembers: string;
    /// Principal, interest, fees and penalties — the full amount members owe.
    /// Shown as a separate figure precisely because it is a different thing.
    owedByMembers: string;
    activeLoans: number;
    /// Everything put into projects, whether or not the project has finished.
    /// A completed training course consumed its money as surely as a running
    /// one is holding it, so both are money out.
    investedCapital: string;
    /// Still owed by the association TO its lenders.
    bankBorrowing: string;
    liveFacilities: number;
    /// Service fee collected from members and not yet paid over to the platform
    /// operator. Sitting in the association's hands and belonging to somebody
    /// else — so it is cash on the premises and a liability at the same time,
    /// which is why it is subtracted from the residual below rather than
    /// treated as money the association could deploy.
    platformFeeHeld: string;
    /// Implied residual: members' savings, plus what the association borrowed,
    /// plus what it has earned, less what has gone out on loan or into a
    /// project. Derived, not observed — see rule 3 above.
    ///
    /// The arithmetic works because every internal movement cancels: a loan
    /// disbursement raises the member's balance and the principal outstanding
    /// by the same amount, and interest credited to a member reduces the
    /// surplus and raises their balance by the same amount. Only money that
    /// genuinely crossed the association's boundary moves this figure.
    notDeployed: string;
    /// True when that residual is negative, i.e. the books do not balance and
    /// the page must say so rather than present the figure as a cash position.
    booksIncomplete: boolean;
  };

  /// How the association earned what it earned. All-time, because every input
  /// is a lifetime total: a period figure would have to exclude the investment
  /// returns, which carry no date of their own.
  surplus: {
    income: {
      loanInterest: string;
      loanFees: string;
      penalties: string;
      accountFees: string;
      investmentReturns: string;
      total: string;
    };
    costs: {
      /// Interest the association credited to members on their savings.
      memberInterest: string;
      borrowingInterest: string;
      borrowingFees: string;
      total: string;
    };
    net: string;
    /// False when costs exceeded income. The page says "loss", not "surplus".
    isPositive: boolean;
  };

  /// The reader's own stake, or null for a caller with no savings account.
  yourStake: {
    savings: string;
    /// Share of the pool, 0–100, to one decimal place.
    sharePercent: number;
    /// That share of the net surplus. INDICATIVE — not a declared dividend.
    indicativeShare: string;
  } | null;

  borrowings: BorrowingSummary[];
  investments: InvestmentSummary[];

  investmentTotals: {
    count: number;
    totalInvested: string;
    totalReturned: string;
    membersBenefited: number;
  };

  /// Twelve months of what lending earned, for the trend chart. Labels are
  /// "YYYY-MM" keys; the chart translates them at render time.
  monthlyIncome: { label: string; value: string }[];
}

/**
 * Builds the whole picture for one association.
 *
 * `memberId` is the caller's own member record when they have one, used only
 * to compute their share. Passing someone else's would be a privacy breach, so
 * every caller passes `context.member.id` and nothing else.
 *
 * `includeUnpublished` is for the administrator's preview of this same page.
 * It defaults to false, so the member-facing route cannot leak a withheld
 * facility by forgetting an argument.
 */
export async function getAssociationFinances(
  associationId: string,
  options: { memberId?: string | null; includeUnpublished?: boolean } = {}
): Promise<AssociationFinances | null> {
  const includeUnpublished = options.includeUnpublished ?? false;

  const [
    association,
    savings,
    savingMembers,
    memberLoans,
    loanIncome,
    accountFees,
    memberInterest,
    borrowingCost,
    borrowings,
    investments,
    investmentSummary,
    memberAccount,
    monthlyIncome,
    platformFeeHeld,
  ] = await Promise.all([
    prisma.association.findUnique({
      where: { id: associationId },
      select: { name: true, code: true, currency: true },
    }),

    prisma.savingsAccount.aggregate({
      where: { associationId, isActive: true },
      _sum: { balance: true },
    }),

    // People, not accounts. Counting rows in savings_accounts would say "312
    // members" for 300 members where a dozen hold a second account, and the
    // per-member average a reader computes from it would be quietly wrong.
    prisma.member.count({
      where: { associationId, savingsAccounts: { some: { isActive: true } } },
    }),

    // Everything members still owe. Summed across the four buckets rather than
    // principal alone: interest and penalties already charged are money the
    // association is owed, and omitting them would understate its position.
    prisma.loan.aggregate({
      where: { associationId, status: { in: ["DISBURSED", "ACTIVE", "OVERDUE"] } },
      _sum: {
        principalOutstanding: true,
        interestOutstanding: true,
        feesOutstanding: true,
        penaltyOutstanding: true,
      },
      _count: true,
    }),

    // REALISED lending income. Repayment rows only — see rule 2.
    prisma.loanTransaction.aggregate({
      where: { associationId, type: "REPAYMENT", status: "COMPLETED" },
      _sum: { interestPortion: true, feesPortion: true, penaltyPortion: true },
    }),

    // Fees the ASSOCIATION charged — withdrawal fees and the like.
    //
// `platformFeeCharge: null` is load-bearing. The daily service fee is also
   // a FEE debit, and it is not the association's money: it is collected on
   // the platform operator's behalf and owed straight back to them. Counting
   // it here would inflate the association's income by 50 per share per day,
   // inflate the surplus by the same, and inflate every member's indicative
   // share of a surplus that does not exist. See lib/services/funds.ts, which
   // reports the service fee as its own pot.
    prisma.savingsTransaction.aggregate({
      where: {
        associationId,
        type: "FEE",
        direction: "DEBIT",
        status: "COMPLETED",
        platformFeeCharge: null,
      },
      _sum: { amount: true },
    }),

    // Interest paid OUT to members is a cost to the association, and one
    // members rarely see quantified even though it is money earned for them.
    prisma.savingsTransaction.aggregate({
      where: {
        associationId,
        type: "INTEREST",
        direction: "CREDIT",
        status: "COMPLETED",
      },
      _sum: { amount: true },
    }),

    // EVERY facility, including any withheld from the members' page. The
    // listings above respect `isPublic`; this cost line deliberately does not.
    // Excluding a hidden facility's interest would understate what borrowing
    // cost, which overstates the surplus and every member's share of it. If a
    // committee hides a facility, they hide the debt — not the bill.
    prisma.institutionalLoanRepayment.aggregate({
      where: { institutionalLoan: { associationId } },
      _sum: { interestPortion: true, feesPortion: true },
    }),

    listBorrowings(associationId, { includeUnpublished }),
    listInvestments(associationId, { includeUnpublished }),
    summariseInvestments(associationId, { includeUnpublished }),

    options.memberId
      ? prisma.savingsAccount.aggregate({
          where: { memberId: options.memberId, isActive: true },
          _sum: { balance: true },
        })
      : Promise.resolve(null),

    prisma.$queryRaw<{ month: string; earned: string }[]>`
      SELECT to_char(date_trunc('month', "valueDate"), 'YYYY-MM') AS month,
             COALESCE(
               SUM("interestPortion" + "feesPortion" + "penaltyPortion"), 0
             )::text AS earned
      FROM loan_transactions
      WHERE "associationId" = ${associationId}
        AND type = 'REPAYMENT'
        AND status = 'COMPLETED'
        AND "valueDate" >= date_trunc('month', now()) - interval '11 months'
      GROUP BY date_trunc('month', "valueDate")
      ORDER BY month ASC
    `,

    // Collected on the platform operator's behalf and not yet handed over.
    // Physically in the association's account, which is why the residual has
    // to know about it, and not one franc of it is the association's.
    prisma.platformFeeCharge.aggregate({
      where: { associationId, status: "CHARGED", remittedAt: null },
      _sum: { amount: true },
    }),
  ]);

  if (!association) return null;

  // --- Position ------------------------------------------------------------

  const memberSavings = toMoney(savings._sum.balance ?? 0);

  const lentToMembers = toMoney(memberLoans._sum.principalOutstanding ?? 0);

  const owedByMembers = add(
    memberLoans._sum.principalOutstanding ?? 0,
    memberLoans._sum.interestOutstanding ?? 0,
    memberLoans._sum.feesOutstanding ?? 0,
    memberLoans._sum.penaltyOutstanding ?? 0
  );

  // Only live facilities. A completed one is history and adding it back would
  // tell members the association still owes a debt it has finished paying.
  const liveBorrowings = borrowings.filter((b) =>
    (LIVE_BORROWING_STATUSES as readonly string[]).includes(b.status)
  );

  const bankBorrowing = liveBorrowings.reduce(
    (total, facility) => add(total, facility.outstanding),
    toMoney(0)
  );

  // Everything put in, not only what is still committed. Money spent on
  // training is spent; money in a machine is illiquid. Neither is cash the
  // association can lend tomorrow, and the residual below is a cash figure.
  const investedCapital = toMoney(investmentSummary.totalInvested);

  // --- Surplus -------------------------------------------------------------

  const income = {
    loanInterest: toMoneyString(loanIncome._sum.interestPortion ?? 0),
    loanFees: toMoneyString(loanIncome._sum.feesPortion ?? 0),
    penalties: toMoneyString(loanIncome._sum.penaltyPortion ?? 0),
    accountFees: toMoneyString(accountFees._sum.amount ?? 0),
    investmentReturns: investmentSummary.totalReturned,
  };

  const costs = {
    memberInterest: toMoneyString(memberInterest._sum.amount ?? 0),
    borrowingInterest: toMoneyString(borrowingCost._sum.interestPortion ?? 0),
    borrowingFees: toMoneyString(borrowingCost._sum.feesPortion ?? 0),
  };

  const totalIncome = add(
    income.loanInterest,
    income.loanFees,
    income.penalties,
    income.accountFees,
    income.investmentReturns
  );

  const totalCosts = add(
    costs.memberInterest,
    costs.borrowingInterest,
    costs.borrowingFees
  );

  const net = subtract(totalIncome, totalCosts);

  const feeHeld = toMoney(platformFeeHeld._sum.amount ?? 0);

  // What the books imply is sitting undeployed. Members' savings and the bank
  // facility are what came in; loans out, project capital and the surplus
  // already earned are where it went.
  //
  // The unremitted service fee is subtracted because it is in the account and
  // is not the association's. Leaving it in would present the operator's money
  // as funds the committee could lend, and the first time somebody lent it the
  // association would be short when the invoice arrived.
  const notDeployed = subtract(
    add(memberSavings, bankBorrowing, net),
    add(lentToMembers, investedCapital, feeHeld)
  );

  // --- The reader's own stake ----------------------------------------------

  const yourSavings = memberAccount ? toMoney(memberAccount._sum.balance ?? 0) : null;

  const yourStake =
    yourSavings && memberSavings.greaterThan(0)
      ? {
          savings: yourSavings.toFixed(2),
          sharePercent:
            Math.round(
              yourSavings.dividedBy(memberSavings).times(1000).toNumber()
            ) / 10,
          indicativeShare: toMoneyString(
            net.times(yourSavings.dividedBy(memberSavings))
          ),
        }
      : yourSavings
        ? { savings: yourSavings.toFixed(2), sharePercent: 0, indicativeShare: "0.00" }
        : null;

  return {
    association: {
      name: association.name,
      code: association.code,
      currency: association.currency,
    },

    position: {
      memberSavings: memberSavings.toFixed(2),
      savingMembers,
      lentToMembers: toMoneyString(lentToMembers),
      owedByMembers: toMoneyString(owedByMembers),
      activeLoans: memberLoans._count,
      investedCapital: toMoneyString(investedCapital),
      bankBorrowing: toMoneyString(bankBorrowing),
      liveFacilities: liveBorrowings.length,
      platformFeeHeld: toMoneyString(feeHeld),
      notDeployed: toMoneyString(notDeployed),
      booksIncomplete: notDeployed.isNegative(),
    },

    surplus: {
      income: { ...income, total: toMoneyString(totalIncome) },
      costs: { ...costs, total: toMoneyString(totalCosts) },
      net: toMoneyString(net),
      isPositive: !net.isNegative(),
    },

    yourStake,
    borrowings,
    investments,

    investmentTotals: {
      count: investmentSummary.count,
      totalInvested: investmentSummary.totalInvested,
      totalReturned: investmentSummary.totalReturned,
      membersBenefited: investmentSummary.membersBenefited,
    },

    monthlyIncome: monthlyIncome.map((row) => ({
      label: row.month,
      value: toMoneyString(row.earned),
    })),
  };
}

/**
 * The headline figures alone, for the admin overview tile.
 *
 * Deliberately a separate, much cheaper query than the full page: the admin
 * dashboard already runs twenty aggregates and does not need the narrative,
 * the repayment history or the member's share.
 */
export async function getBorrowingHeadline(associationId: string | null): Promise<{
  liveFacilities: number;
  outstanding: string;
  nextPaymentDue: Date | null;
  overdueFacilities: number;
}> {
  const scope = associationId ? { associationId } : {};

  const [live, next, overdue] = await Promise.all([
    prisma.institutionalLoan.aggregate({
      where: { ...scope, status: { in: [...LIVE_BORROWING_STATUSES] } },
      _sum: { principalOutstanding: true, interestOutstanding: true },
      _count: true,
    }),

    prisma.institutionalLoan.findFirst({
      where: {
        ...scope,
        status: { in: [...LIVE_BORROWING_STATUSES] },
        nextPaymentDue: { not: null },
      },
      orderBy: { nextPaymentDue: "asc" },
      select: { nextPaymentDue: true },
    }),

    prisma.institutionalLoan.count({ where: { ...scope, status: "OVERDUE" } }),
  ]);

  return {
    liveFacilities: live._count,
    outstanding: toMoneyString(
      add(live._sum.principalOutstanding ?? 0, live._sum.interestOutstanding ?? 0)
    ),
    nextPaymentDue: next?.nextPaymentDue ?? null,
    overdueFacilities: overdue,
  };
}

/**
 * How much of the members' savings is pledged against the association's own
 * borrowing — the single number that says whether the association has borrowed
 * prudently or bet the members' money.
 *
 * Returns null when there is no borrowing to measure, so the page can omit the
 * line entirely rather than print a reassuring "0%" that means nothing.
 */
export function borrowingAgainstSavings(
  bankBorrowing: string,
  memberSavings: string
): number | null {
  if (!gt(bankBorrowing, 0)) return null;
  const savings = toMoney(memberSavings);
  if (!savings.greaterThan(0)) return null;

  return (
    Math.round(toMoney(bankBorrowing).dividedBy(savings).times(1000).toNumber()) / 10
  );
}
