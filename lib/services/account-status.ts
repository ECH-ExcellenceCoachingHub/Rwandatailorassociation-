import "server-only";
import { Prisma, prisma } from "@/lib/db/prisma";
import { add, gt, multiply, subtract, toMoney, toMoneyString } from "@/lib/money";
import { availableBalance } from "@/lib/services/ledger";
import {
  getMemberStanding,
  type ContributionStanding,
  type ContributionStatus,
} from "@/lib/services/contributions";
import { getPolicy, type AssociationPolicy } from "@/lib/services/rulebook";
import {
  assessBorrowing,
  wholeMonthsBetween,
  type BorrowingBlocker,
} from "@/lib/rules/borrowing";
import {
  getMemberWarehouseSummary,
  type MemberWarehouseSummary,
} from "@/lib/services/warehouse";
import { listMemberFines, type MemberFines } from "@/lib/services/fines";
import { getMemberGuarantees, type MemberGuarantees } from "@/lib/services/guarantors";
import type {
  MemberStatus,
  KycStatus,
  LoanStatus,
  TransactionType,
  TransactionDirection,
  TransactionStatus,
  PaymentChannel,
} from "@/lib/generated/prisma/enums";

/**
 * THE WHOLE OF A MEMBER'S POSITION, ON ONE PAGE.
 *
 * This is what someone sees within a second of scanning their card, and it is
 * the only screen that answers every question they actually arrive with: who
 * the association thinks they are, what their shareholding has reached, what
 * they have paid in, what they borrowed and what is left of it, what they are
 * holding from the store, and what has moved on their account.
 *
 * WHY IT IS ONE FUNCTION AND NOT SIX. Every figure here has to agree with
 * every other one. If the page fetched its savings from one service, its
 * arrears from a second and its warehouse debt from a third, each would take
 * its own snapshot and a member reloading during a posting could be shown a
 * balance that already includes a deposit next to a "total paid in" that does
 * not. Gathering them here means they are read together and presented
 * together.
 *
 * Returns null for a staff account with no member record — which has no
 * savings of its own, no shareholding and nothing in the store. The page
 * renders an honest panel saying so rather than a row of zeroes.
 */

// ---------------------------------------------------------------------------
// Shareholding
// ---------------------------------------------------------------------------

/**
 * IMIGABANE — what a member's shareholding has actually reached.
 *
 * The association's rule is a fixed contribution per day. A member who pays
 * 30,000 in one go has not thereby acquired thirty days of standing on the day
 * they paid it: the money buys days, and those days become shares as they
 * arrive. So the shareholding is the DAILY RATE TIMES THE DAYS THAT HAVE BOTH
 * ELAPSED AND BEEN PAID FOR, and the rest of the money is an advance sitting
 * against future days.
 *
 * That is not a display nicety. Paying a lump sum in January and quoting the
 * whole of it as shares would credit a member with standing for days that have
 * not happened — and if they leave in February, the figure the association
 * would owe them back is the accrued part, not the lump.
 *
 * The two counts come from lib/services/contributions.ts and are the same two
 * the fine logic uses, so the shareholding on this page and the arrears on the
 * compliance screen can never tell different stories:
 *
 *     days owed    = calendar days since the obligation began
 *     days covered = total contributed ÷ the daily total
 *
 * `daysCredited` is the smaller of the two. Below it, the member is behind and
 * their shares stop at what they have paid for; above it, they are in advance
 * and their shares stop at today.
 */
export interface ShareholdingSummary {
  /// Days that have both elapsed and been paid for.
  daysCredited: number;
  /// Calendar days since the obligation began.
  daysOwed: number;
  /// Days the money paid in has bought, whether or not they have arrived yet.
  daysCovered: number;
  /// The daily rate the shares accrue at — the savings half of the daily
  /// obligation, excluding the platform's service fee.
  dailyRate: string;
  /// WHAT A DAY ACTUALLY COSTS THE MEMBER: the savings rate plus the service
  /// fee. Carried beside `dailyRate` because showing only the savings half is
  /// how a member comes to believe they owe 1,000 a day, pays exactly that, and
  /// is then found to be in arrears by the fee they were never told about. The
  /// page shows this total and names both parts underneath it.
  dailyTotal: string;
  /// The service-fee portion of a day. `dailyTotal` − `dailyRate`, resolved
  /// here so the page never has to subtract two money strings itself.
  dailyFee: string;
  /// daysCredited × dailyRate. The shareholding figure itself.
  sharesHeld: string;
  /// Paid for days still in the future. Real money, already the member's, but
  /// not yet part of their shareholding.
  advanceDays: number;
  advanceAmount: string;
  /// Days paid for that have not arrived — how far ahead they are, in days.
  behindDays: number;
  /// Value of the days they are behind, at the full daily cost. What they
  /// would need to pay to bring the shareholding level with today.
  behindAmount: string;
  status: ContributionStatus;
  /// Unpaid fines, so the page never shows a clean shareholding beside a debt.
  outstandingFines: string;
  /// Days left before the next fine lands; 0 means tonight. The single most
  /// actionable number on the page for somebody who is behind — a member told
  /// only that they are "behind" has no reason to act today rather than next
  /// week, which is precisely how the fine arrives.
  daysUntilFine: number;
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

export interface AccountTransactionRow {
  id: string;
  reference: string;
  type: TransactionType;
  direction: TransactionDirection;
  status: TransactionStatus;
  channel: PaymentChannel;
  amount: string;
  balanceAfter: string;
  description: string | null;
  createdAt: Date;
}

export interface AccountLoanSummary {
  /// The live loan, when there is one. Null when nothing is outstanding.
  reference: string | null;
  status: LoanStatus | null;
  /// Principal advanced on the CURRENT loan.
  principal: string;
  /// Everything still owed on it — principal, interest, fees and penalties.
  outstanding: string;
  /// Paid against the current loan.
  totalPaid: string;
  daysOverdue: number;
  nextInstalment: { amount: string; dueDate: Date } | null;

  /// Across every loan this member has ever had, settled ones included. These
  /// are the figures a member means by "what I borrowed" and "what I have
  /// repaid" — quoting only the live loan would tell somebody on their fourth
  /// loan that they have borrowed far less than they have.
  lifetimeBorrowed: string;
  lifetimeRepaid: string;
  loanCount: number;
}

/**
 * WHAT THE MEMBER MAY BORROW AGAINST THEIR OWN MONEY.
 *
 * The rulebook's own-savings share — 80% unless the committee has changed it —
 * applied to the AVAILABLE balance, not the gross one. Money already held
 * against a loan cannot secure a second one, and quoting a limit on the gross
 * figure would promise a member money the association would then refuse.
 *
 * Worked out by `assessBorrowing`, the function the loan form and the server
 * use, so the rules that stop somebody borrowing today (arrears, unpaid fines,
 * a loan still running, too new to borrow) are the same ones named here.
 */
export interface AccountBorrowingLimit {
  /// The rulebook percentage, trimmed for display: "80", not "80.0000".
  percent: string;
  /// The balance the percentage was applied to.
  basis: string;
  /// percent × basis: what the member may take without pledging collateral.
  limit: string;
  /// False when a rule stops them borrowing today, whatever the limit says.
  canBorrow: boolean;
  blockers: BorrowingBlocker[];
}

export interface AccountStatusSummary {
  // Identity
  memberNumber: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  paymentReference: string;
  status: MemberStatus;
  kycStatus: KycStatus;
  joinedAt: Date | null;

  /// Null when a member has been approved but no savings account exists yet —
  /// a real state during onboarding, and one the page must not show as zero.
  savings: {
    accountNumber: string;
    balance: string;
    available: string;
    locked: string;
    /// Gross ever credited. "Amafaranga yose yatanze".
    totalDeposits: string;
    totalWithdrawals: string;
    totalInterest: string;
    totalFees: string;
    currency: string;
    lastTransactionAt: Date | null;
  } | null;

  shareholding: ShareholdingSummary | null;
  loan: AccountLoanSummary | null;
  borrowing: AccountBorrowingLimit;
  warehouse: MemberWarehouseSummary | null;

  /// Every fine against this member, of both kinds — missed daily saving and
  /// late warehouse-credit instalments. A penalty is money taken off somebody,
  /// and the page that exists to answer "where do I stand" cannot answer it
  /// while the discipline half of the answer lives on another screen.
  fines: MemberFines;

  /// Guarantees in both directions: requests waiting for this member's answer,
  /// savings of theirs held for other members' loans, and the members standing
  /// behind their own loan. A request to guarantee is the one thing on this
  /// page that asks the reader to decide something, and it is answered here.
  guarantees: MemberGuarantees;

  /// Every movement on the member's ledger, newest first, capped. The page
  /// links onward to the full statement rather than paginating here.
  transactions: AccountTransactionRow[];
  transactionCount: number;

  currency: string;
}

/// How many ledger rows the page renders before sending the reader to the full
/// statement. Enough to cover a month of daily saving on one screen.
const TRANSACTION_LIMIT = 40;

/// A loan being repaid right now — the one the page calls "current".
export const LIVE_LOAN_STATUSES: LoanStatus[] = ["DISBURSED", "ACTIVE", "OVERDUE"];

/// Every loan that actually reached the member, settled ones included.
/// Applications and undisbursed approvals are excluded: money that was never
/// advanced is not money they borrowed.
export const ADVANCED_LOAN_STATUSES: LoanStatus[] = [
  "DISBURSED",
  "ACTIVE",
  "OVERDUE",
  "COMPLETED",
  "DEFAULTED",
  "WRITTEN_OFF",
  "RESTRUCTURED",
];

/// Wider than LIVE_LOAN_STATUSES: a loan approved but not yet paid out also
/// stops a second one, and the loan form counts it the same way.
export const OPEN_LOAN_STATUSES: LoanStatus[] = [
  "PENDING_DISBURSEMENT",
  ...LIVE_LOAN_STATUSES,
];

export async function getAccountStatusSummary(
  memberId: string
): Promise<AccountStatusSummary | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      status: true,
      kycStatus: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      associationId: true,
      user: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
      // `createdAt` because the lending unlock counts from the association's
      // own first day, not the member's.
      association: { select: { currency: true, createdAt: true } },
      savingsAccounts: {
        where: { isActive: true },
        orderBy: { openedAt: "asc" },
        take: 1,
        select: {
          accountNumber: true,
          balance: true,
          lockedBalance: true,
          totalDeposits: true,
          totalWithdrawals: true,
          totalInterest: true,
          totalFees: true,
          currency: true,
          lastTransactionAt: true,
        },
      },
    },
  });

  if (!member) return null;

  const [
    activeLoan,
    loanTotals,
    loanCount,
    transactions,
    transactionCount,
    standing,
    warehouse,
    fines,
    policy,
    openLoanCount,
    guarantees,
  ] = await Promise.all([
      prisma.loan.findFirst({
        where: { memberId, status: { in: LIVE_LOAN_STATUSES } },
        orderBy: { createdAt: "desc" },
        select: {
          reference: true,
          status: true,
          principal: true,
          totalPaid: true,
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
          daysOverdue: true,
          installments: {
            where: {
              status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID", "OVERDUE"] },
            },
            orderBy: { dueDate: "asc" },
            take: 1,
            select: { totalDue: true, totalPaid: true, dueDate: true },
          },
        },
      }),

      // Lifetime borrowing, across every loan that actually reached the
      // member.
      prisma.loan.aggregate({
        where: { memberId, status: { in: ADVANCED_LOAN_STATUSES } },
        _sum: { principal: true, totalPaid: true },
      }),

      prisma.loan.count({
        where: { memberId, status: { in: ADVANCED_LOAN_STATUSES } },
      }),

      prisma.savingsTransaction.findMany({
        where: { memberId },
        orderBy: { createdAt: "desc" },
        take: TRANSACTION_LIMIT,
        select: {
          id: true,
          reference: true,
          type: true,
          direction: true,
          status: true,
          channel: true,
          amount: true,
          balanceAfter: true,
          description: true,
          createdAt: true,
        },
      }),

      prisma.savingsTransaction.count({ where: { memberId } }),

      // Both of these already scope themselves to this member and are safe to
      // run for somebody with no savings account — they return a standing of
      // zero days and an empty warehouse position respectively.
      getMemberStanding(memberId),
      getMemberWarehouseSummary(memberId),
      listMemberFines(memberId),

      getPolicy(member.associationId),
      prisma.loan.count({
        where: { memberId, status: { in: OPEN_LOAN_STATUSES } },
      }),

      getMemberGuarantees(memberId),
    ]);

  const account = member.savingsAccounts[0] ?? null;
  const nextInstalment = activeLoan?.installments[0] ?? null;
  const currency = account?.currency ?? member.association.currency;

  const available = account
    ? availableBalance(account.balance, account.lockedBalance)
    : "0.00";

  return {
    memberNumber: member.memberNumber,
    fullName: `${member.user.firstName} ${member.user.lastName}`,
    phone: member.user.phone,
    email: member.user.email,
    paymentReference: member.paymentReference,
    status: member.status,
    kycStatus: member.kycStatus,
    // `joinedAt` is when they started; `approvedAt` is when the association
    // agreed. Members recruited at a meeting often have only the second.
    joinedAt: member.joinedAt ?? member.approvedAt,

    savings: account
      ? {
          accountNumber: account.accountNumber,
          balance: toMoneyString(account.balance),
          available,
          locked: toMoneyString(account.lockedBalance),
          totalDeposits: toMoneyString(account.totalDeposits),
          totalWithdrawals: toMoneyString(account.totalWithdrawals),
          totalInterest: toMoneyString(account.totalInterest),
          totalFees: toMoneyString(account.totalFees),
          currency: account.currency,
          lastTransactionAt: account.lastTransactionAt,
        }
      : null,

    shareholding: standing ? buildShareholding(standing) : null,

    loan: buildLoanSummary({
      activeLoan,
      nextInstalment,
      lifetimeBorrowed: loanTotals._sum.principal,
      lifetimeRepaid: loanTotals._sum.totalPaid,
      loanCount,
    }),

    borrowing: assessBorrowingLimit({
      policy,
      available,
      member,
      associationCreatedAt: member.association.createdAt,
      standing,
      openLoanCount,
      asOf: new Date(),
    }),

    warehouse,
    fines,
    guarantees,

    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      direction: transaction.direction,
      status: transaction.status,
      channel: transaction.channel,
      amount: toMoneyString(transaction.amount),
      balanceAfter: toMoneyString(transaction.balanceAfter),
      description: transaction.description,
      createdAt: transaction.createdAt,
    })),
    transactionCount,

    currency,
  };
}

/**
 * What the member may borrow today. Shared with the association-wide member
 * account statement so an officer's printout and the member's own page quote
 * the same limit for the same reasons.
 */
export function assessBorrowingLimit(input: {
  policy: AssociationPolicy;
  /// The AVAILABLE balance — see AccountBorrowingLimit.
  available: string;
  member: { approvedAt: Date | null; joinedAt: Date | null; createdAt: Date };
  /// The lending unlock counts from the association's own first day.
  associationCreatedAt: Date;
  standing: ContributionStanding | null;
  /// Loans in OPEN_LOAN_STATUSES.
  openLoanCount: number;
  asOf: Date;
}): AccountBorrowingLimit {
  const { member, asOf } = input;

  // Tenure anchored on approval, then joining, then creation — the order the
  // loan form uses, so the two screens count the same months.
  const since = member.approvedAt ?? member.joinedAt ?? member.createdAt;

  const assessment = assessBorrowing({
    policy: input.policy,
    savingsBalance: input.available,
    membershipMonths: wholeMonthsBetween(since, asOf),
    associationMonths: wholeMonthsBetween(input.associationCreatedAt, asOf),
    missedDays: input.standing?.missedDays ?? 0,
    outstandingFines: input.standing?.outstandingFineAmount ?? "0.00",
    hasActiveLoan: input.openLoanCount > 0,
  });

  return {
    percent: toMoney(input.policy.ownSavingsPercent).toDecimalPlaces(2).toString(),
    basis: input.available,
    limit: assessment.ownShareLimit,
    canBorrow: assessment.canBorrow,
    blockers: assessment.blockers,
  };
}

export function buildShareholding(standing: ContributionStanding): ShareholdingSummary {
  const daysCredited = Math.min(standing.dueDays, standing.coveredDays);
  const advanceDays = Math.max(0, standing.coveredDays - standing.dueDays);

  return {
    daysCredited,
    daysOwed: standing.dueDays,
    daysCovered: standing.coveredDays,
    dailyRate: standing.dailySavings,
    dailyTotal: standing.dailyTotal,
    dailyFee: standing.dailyFee,
    sharesHeld: toMoneyString(multiply(standing.dailySavings, daysCredited)),
    advanceDays,
    // Valued at the savings rate, not the full daily cost: the fee portion of
    // an advance is the platform's and never becomes the member's share.
    advanceAmount: toMoneyString(multiply(standing.dailySavings, advanceDays)),
    behindDays: standing.missedDays,
    behindAmount: standing.arrearsTotal,
    status: standing.status,
    outstandingFines: standing.outstandingFineAmount,
    daysUntilFine: standing.daysUntilFine,
  };
}

export function buildLoanSummary(input: {
  activeLoan: {
    reference: string;
    status: LoanStatus;
    principal: Prisma.Decimal;
    totalPaid: Prisma.Decimal;
    principalOutstanding: Prisma.Decimal;
    interestOutstanding: Prisma.Decimal;
    feesOutstanding: Prisma.Decimal;
    penaltyOutstanding: Prisma.Decimal;
    daysOverdue: number;
  } | null;
  nextInstalment: {
    totalDue: Prisma.Decimal;
    totalPaid: Prisma.Decimal;
    dueDate: Date;
  } | null;
  lifetimeBorrowed: Prisma.Decimal | null;
  lifetimeRepaid: Prisma.Decimal | null;
  loanCount: number;
}): AccountLoanSummary | null {
  const lifetimeBorrowed = toMoney(input.lifetimeBorrowed ?? 0);

  // Nothing to say: never borrowed, and nothing outstanding now.
  if (!input.activeLoan && !gt(lifetimeBorrowed, 0)) return null;

  const loan = input.activeLoan;

  return {
    reference: loan?.reference ?? null,
    status: loan?.status ?? null,
    principal: toMoneyString(loan?.principal ?? 0),
    // Outstanding is every component still owed, not principal alone —
    // quoting the smaller number here is how a "settled" loan turns out to
    // have penalties left on it.
    outstanding: loan
      ? toMoneyString(
          add(
            loan.principalOutstanding,
            loan.interestOutstanding,
            loan.feesOutstanding,
            loan.penaltyOutstanding
          )
        )
      : "0.00",
    totalPaid: toMoneyString(loan?.totalPaid ?? 0),
    daysOverdue: loan?.daysOverdue ?? 0,
    nextInstalment: input.nextInstalment
      ? {
          amount: toMoneyString(
            subtract(input.nextInstalment.totalDue, input.nextInstalment.totalPaid)
          ),
          dueDate: input.nextInstalment.dueDate,
        }
      : null,
    lifetimeBorrowed: toMoneyString(lifetimeBorrowed),
    lifetimeRepaid: toMoneyString(input.lifetimeRepaid ?? 0),
    loanCount: input.loanCount,
  };
}
