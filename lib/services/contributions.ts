import "server-only";
import { prisma, withFinancialTransaction } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  add,
  gt,
  multiply,
  toMoney,
  toMoneyString,
} from "@/lib/money";
import {
  LedgerError,
  buildTransactionReference,
  postSavingsTransaction,
} from "@/lib/services/ledger";
import { getPolicy, policyFromRules, type AssociationPolicy } from "@/lib/services/rulebook";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";

/**
 * THE DAILY SAVING, AND WHAT HAPPENS WHEN SOMEBODY FALLS BEHIND.
 *
 * The rule is one line — save 1,000 a day plus 50 service fee, and a fine
 * follows seven missed days — and every hard decision in this module comes
 * from refusing to store that as a schedule.
 *
 * WHY THERE IS NO ROW PER DAY. The obvious design gives every member a row per
 * calendar day, marked paid or missed. It is wrong for the people this is
 * built for: a tailor does not pay 1,050 on Tuesday, they pay 7,350 on
 * Saturday when the market has been good, and a schedule of daily slots has to
 * be told how to spread that. Instead, TWO COUNTS ARE COMPARED:
 *
 *     days owed     = calendar days since the obligation began
 *     days covered  = total contributed ÷ the daily total
 *
 * Their difference is how far behind somebody is. Paying a week at once
 * advances the second count by seven and needs no special case; paying an odd
 * amount advances it by however many whole days that buys. Nothing has to be
 * reconciled overnight, no row can go missing, and the answer is the same
 * whether it is computed today or reconstructed from the ledger in five years.
 *
 * WHY ARREARS ARE NEVER CACHED. `days covered` is derived from the savings
 * ledger, which is the same append-only record every other figure in this
 * platform is derived from. A cached arrears column would be one more thing
 * that can silently disagree with the money — see rule 3 of the schema.
 *
 * WHY A FINE IS A DEBT AND NOT A DEBIT. Assessing a fine records what is owed
 * and tells the member. It does NOT reach into their savings. Two reasons: a
 * member with an empty balance would be driven negative by an automatic debit
 * for the crime of having no money, and an officer must have the chance to
 * waive a fine before it has already been taken. Collection is a separate,
 * deliberate act — `settleFine` — with its own audit entry.
 */

// ---------------------------------------------------------------------------
// Counting days
// ---------------------------------------------------------------------------

/**
 * The calendar day of `date` in the association's own timezone, as a count of
 * days since the epoch.
 *
 * IN THE ASSOCIATION'S TIMEZONE, NOT THE SERVER'S. Kigali runs two hours ahead
 * of UTC, so a contribution paid at nine in the evening is tomorrow's in UTC.
 * Counting in UTC would tell a member who has paid every single day that they
 * are one day behind, which is precisely the accusation that destroys trust in
 * a system like this.
 *
 * Falls back to UTC if the association carries a timezone Node cannot resolve,
 * rather than throwing: a mistyped timezone must not take the dashboard down.
 */
export function dayIndexIn(timeZone: string, date: Date): number {
  let iso: string;
  try {
    iso = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    iso = date.toISOString().slice(0, 10);
  }

  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

// ---------------------------------------------------------------------------
// The pure calculation
// ---------------------------------------------------------------------------

/** A fine already on the record, as far as the threshold logic is concerned. */
export interface PriorFine {
  missedDays: number;
  dueDayIndex: number;
}

export interface StandingInputs {
  policy: AssociationPolicy;
  timeZone: string;
  /// When the daily obligation began for this member.
  obligationStart: Date;
  asOf: Date;
  /// Gross contributions ever credited — the savings account's `totalDeposits`.
  totalContributed: string;
  /// Highest contribution-day the platform fee has been charged through.
  feeChargedThroughDay: number;
  /// Non-cancelled fines, so a repeat fine is not issued for the same arrears.
  priorFines: PriorFine[];
  /// Fines still owed, in money. Folded into the clearing figure.
  outstandingFineAmount: string;
  isExempt: boolean;
  /// Shares the member holds. Each saves the daily amount set in the rulebook;
  /// absent counts as one, which is what members enrolled before shares were
  /// recorded were already paying.
  shares?: number;
}

export type ContributionStatus =
  | "EXEMPT"
  | "CURRENT"
  | "AT_RISK"
  | "BEHIND"
  | "FINABLE";

export interface ContributionStanding {
  status: ContributionStatus;

  dueDays: number;
  coveredDays: number;
  missedDays: number;

  /// What the missed days are worth, split the way the rules split them.
  arrearsTotal: string;
  arrearsSavings: string;
  arrearsFee: string;

  /// Days left before the next fine. 0 means it lands tonight.
  daysUntilFine: number;

  /// Everything owed right now: missed contributions plus unpaid fines. The
  /// single number a member should be shown, because it is the only one they
  /// can act on.
  clearingAmount: string;
  outstandingFineAmount: string;

  /// Set when tonight's run should assess a fine. Null when clear, inside the
  /// grace period, or already fined for these arrears.
  fineDue: {
    missedDays: number;
    dueDayIndex: number;
    /// The saving left unpaid by the days this fine covers. Recorded for the
    /// member's reading; the fine itself does not depend on it.
    arrearsAmount: string;
    amountPerShare: string;
    shares: number;
    amount: string;
  } | null;

  /// What the next fine will be for this member — the per-share fine times
  /// their shares — so a warning can name the figure rather than the rule.
  fineAmount: string;

  /// Contribution-days paid for whose service fee has not been taken yet.
  feeDaysOwed: number;
  feeAmountOwed: string;

  /// One day of membership, for display beside everything above.
  dailyTotal: string;
  /// The savings half of that — the part that becomes the member's own share
  /// rather than the platform's fee. Carried out of the policy because the
  /// account page builds the shareholding figure from it, and reading the
  /// rulebook a second time there could disagree with what was used here.
  dailySavings: string;
  /// The service-fee half of a day, per share. Carried beside dailySavings so
  /// the dashboard never subtracts two money strings itself and so a member
  /// with several shares sees the fee multiplied rather than a flat figure.
  dailyFee: string;
}

/**
 * Works out exactly where a member stands. No database, no clock of its own —
 * everything it needs is an argument, so every branch below is unit-testable
 * and the nightly job and the member's dashboard cannot disagree.
 */
export function computeStanding(input: StandingInputs): ContributionStanding {
  const { policy } = input;

  // The rulebook's daily saving and daily service fee are both per share. A
  // member who took five shares saves five times the saving and pays five
  // times the service fee each day. Anyone enrolled before shares were
  // recorded counts as one share, which is exactly what they were paying.
  const shares = Math.max(1, input.shares ?? 1);
  const dailySavings = multiply(policy.dailySavings, shares);
  const dailyFee = multiply(policy.platformFeePerDay, shares);
  const dailyTotal = toMoney(add(dailySavings, dailyFee));

  const startIndex = dayIndexIn(input.timeZone, input.obligationStart);
  const todayIndex = dayIndexIn(input.timeZone, input.asOf);

  // Inclusive of the first day: a member admitted this morning owes today.
  // Negative when an obligation is dated in the future, which an administrator
  // is allowed to do when admitting somebody who starts next month.
  const dueDays = Math.max(0, todayIndex - startIndex + 1);

  // An association that has set its daily amount to zero has suspended the
  // obligation rather than made everybody infinitely behind.
  const coveredDays = dailyTotal.greaterThan(0)
    ? Math.floor(toMoney(input.totalContributed).dividedBy(dailyTotal).toNumber())
    : dueDays;

  const missedDays = Math.max(0, dueDays - coveredDays);

  const arrearsSavings = multiply(dailySavings, missedDays);
  const arrearsFee = multiply(dailyFee, missedDays);
  const arrearsTotal = add(arrearsSavings, arrearsFee);

  const daysUntilFine = Math.max(0, policy.graceDays - missedDays);

  // Fees are owed for days the member has PAID for, never for days they have
  // missed. Charging the service fee on a day nobody contributed would bill a
  // member for a service they did not use and drive their balance down while
  // they were already struggling.
  const feeDaysOwed = Math.max(0, coveredDays - input.feeChargedThroughDay);
  const feeAmountOwed = multiply(dailyFee, feeDaysOwed);

  // Per share, like the saving and the fee: a member with three shares is
  // fined three times the rulebook's figure.
  const fineAmount = multiply(policy.penaltyPerShare, shares);

  const fineDue = resolveFineDue({
    policy,
    priorFines: input.priorFines,
    coveredDays,
    missedDays,
    dueDays,
    dailySavings: dailySavings.toFixed(2),
    shares,
  });

  const clearingAmount = add(arrearsTotal, input.outstandingFineAmount);

  const status: ContributionStatus = input.isExempt
    ? "EXEMPT"
    : missedDays >= policy.graceDays
      ? "FINABLE"
      : missedDays === 0
        ? "CURRENT"
        : daysUntilFine <= policy.reminderLeadDays
          ? "AT_RISK"
          : "BEHIND";

  return {
    status,
    dueDays,
    coveredDays,
    missedDays,
    arrearsTotal: toMoneyString(arrearsTotal),
    arrearsSavings: toMoneyString(arrearsSavings),
    arrearsFee: toMoneyString(arrearsFee),
    daysUntilFine,
    clearingAmount: toMoneyString(clearingAmount),
    outstandingFineAmount: toMoneyString(input.outstandingFineAmount),
    fineDue: input.isExempt ? null : fineDue,
    fineAmount: toMoneyString(fineAmount),
    feeDaysOwed: input.isExempt ? 0 : feeDaysOwed,
    feeAmountOwed: toMoneyString(input.isExempt ? 0 : feeAmountOwed),
    dailyTotal: toMoneyString(dailyTotal),
    dailySavings: toMoneyString(dailySavings),
    dailyFee: toMoneyString(dailyFee),
  };
}

/**
 * Decides whether tonight's run owes this member a fine.
 *
 * THE PROBLEM THIS SOLVES. The job runs every night, and a member who is
 * fourteen days behind must be fined twice in total — not once a night for a
 * fortnight, and not a second time the moment they pay a little without fully
 * catching up. Dates cannot answer that; a date-keyed fine gets reissued the
 * moment the arrears shift.
 *
 * THE RULE. A fine is triggered by the grace period, and each further fine
 * requires another full repeat period of missed days beyond the last one that
 * still bites. A prior fine "still bites" while the member has not yet covered
 * the days it punished — `dueDayIndex > coveredDays`. Once they have paid past
 * that point the fine drops out of the reckoning and the count starts again at
 * the plain grace period, which is what a member who caught up and later fell
 * behind again would expect.
 *
 * Worked through, with grace 7 and repeat 7:
 *
 *   covered 10, due 24 → 14 behind, nothing prior      → fine (threshold 7)
 *   covered 10, due 25 → 15 behind, prior at 14        → no fine (needs 21)
 *   covered 15, due 25 → 10 behind, prior still bites  → no fine (needs 21)
 *   covered 15, due 36 → 21 behind, prior still bites  → fine (threshold 21)
 *   covered 36, due 44 →  8 behind, no prior bites     → fine (threshold 7)
 */
function resolveFineDue(input: {
  policy: AssociationPolicy;
  priorFines: PriorFine[];
  coveredDays: number;
  missedDays: number;
  dueDays: number;
  /// One day's saving for this member, shares included. Only to record what
  /// the days THIS fine covers left unpaid; the fine is not worked out from it.
  dailySavings: string;
  /// Shares held, which the fine is charged on.
  shares: number;
}): ContributionStanding["fineDue"] {
  const { policy, missedDays, dueDays } = input;

  if (missedDays < policy.graceDays) return null;

  // A prior fine still bites while the member has not yet paid for the days it
  // punished. Once they have, it drops out and the count starts afresh.
  const biting = input.priorFines.filter(
    (fine) => fine.dueDayIndex > input.coveredDays
  );

  const highestPrior = biting.reduce(
    (highest, fine) => Math.max(highest, fine.missedDays),
    0
  );

  const threshold =
    biting.length > 0 ? highestPrior + policy.penaltyRepeatDays : policy.graceDays;

  if (missedDays < threshold) return null;

  // ONE FLAT FINE PER STRETCH, FOR THE DAYS NO EARLIER FINE HAS PUNISHED.
  //
  // PENALTY_REPEAT_DAYS: "The same arrears are never fined twice: each fine
  // covers days the earlier ones did not." The fine is the per-share figure
  // times the member's shares, whatever the stretch left unpaid — 500 for a
  // one-share member at seven days, another 500 at fourteen, and 1,500 in all
  // at twenty-one. The unpaid saving for the stretch is still recorded so the
  // member can see what the days they were fined for amounted to.
  //
  // The missedDays RECORDED on the fine stays cumulative: the threshold above
  // is derived from it, and storing the stretch instead would peg the
  // threshold at one repeat period forever and fine every night after it.
  const chargeableDays = missedDays - highestPrior;
  const arrears = multiply(input.dailySavings, chargeableDays);

  const amount = multiply(policy.penaltyPerShare, input.shares);

  // A fine set to zero would otherwise mint a zero-value fine every night — a
  // notification and an audit entry for nothing at all.
  if (!gt(amount, 0)) return null;

  return {
    missedDays,
    dueDayIndex: dueDays,
    arrearsAmount: toMoneyString(arrears),
    amountPerShare: policy.penaltyPerShare,
    shares: input.shares,
    amount: toMoneyString(amount),
  };
}

// ---------------------------------------------------------------------------
// Reading a member's standing
// ---------------------------------------------------------------------------

export interface MemberStanding extends ContributionStanding {
  memberId: string;
  memberNumber: string;
  memberName: string;
  paymentReference: string;
  phone: string | null;
  savingsBalance: string;
  currency: string;
  obligationStart: Date;
  isExempt: boolean;
  exemptReason: string | null;
  exemptUntil: Date | null;
  fines: {
    id: string;
    reference: string;
    amount: string;
    missedDays: number;
    /// Set on fines assessed under the old percentage rule, null since. See
    /// the note on ContributionFine in the schema.
    rate: string | null;
    amountPerShare: string | null;
    shares: number | null;
    status: string;
    assessedAt: Date;
    waiverReason: string | null;
  }[];
}

/** Everything needed to place one member against the contribution rules. */
export async function getMemberStanding(
  memberId: string,
  options: { asOf?: Date } = {}
): Promise<MemberStanding | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      associationId: true,
      memberNumber: true,
      paymentReference: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
      association: {
        select: {
          timezone: true,
          currency: true,
          // The rulebook rides along in the same statement — the same filter
          // `getPolicy` applies — rather than costing a second round trip once
          // the association id is known.
          rules: {
            where: { isSystem: true, isActive: true },
            select: { key: true, value: true },
          },
        },
      },
      savingsAccounts: {
        where: { isActive: true },
        select: { balance: true, totalDeposits: true },
      },
      contributionStanding: true,
      sharesSubscribed: true,
      contributionFines: {
        where: { status: { in: ["OUTSTANDING", "SETTLED"] } },
        orderBy: { dueDayIndex: "desc" },
        take: 10,
        select: {
          id: true,
          reference: true,
          amount: true,
          missedDays: true,
          dueDayIndex: true,
          rate: true,
          amountPerShare: true,
          shares: true,
          status: true,
          assessedAt: true,
          waiverReason: true,
        },
      },
      platformFeeCharges: {
        where: { status: "CHARGED" },
        orderBy: { coveredThroughDay: "desc" },
        take: 1,
        select: { coveredThroughDay: true },
      },
    },
  });

  if (!member) return null;

  const policy = policyFromRules(member.association.rules);

  const totalContributed = member.savingsAccounts.reduce(
    (total, account) => add(total, account.totalDeposits),
    toMoney(0)
  );

  const savingsBalance = member.savingsAccounts.reduce(
    (total, account) => add(total, account.balance),
    toMoney(0)
  );

  const outstandingFines = member.contributionFines.filter(
    (fine) => fine.status === "OUTSTANDING"
  );

  const outstandingFineAmount = outstandingFines.reduce(
    (total, fine) => add(total, fine.amount),
    toMoney(0)
  );

  const standing = computeStanding({
    policy,
    timeZone: member.association.timezone,
    obligationStart: resolveObligationStart(member),
    shares: member.sharesSubscribed ?? 1,
    asOf: options.asOf ?? new Date(),
    totalContributed: toMoneyString(totalContributed),
    feeChargedThroughDay: member.platformFeeCharges[0]?.coveredThroughDay ?? 0,
    priorFines: member.contributionFines.map((fine) => ({
      missedDays: fine.missedDays,
      dueDayIndex: fine.dueDayIndex,
    })),
    outstandingFineAmount: toMoneyString(outstandingFineAmount),
    isExempt: isCurrentlyExempt(member.contributionStanding, options.asOf ?? new Date()),
  });

  return {
    ...standing,
    memberId: member.id,
    memberNumber: member.memberNumber,
    memberName: `${member.user.firstName} ${member.user.lastName}`,
    paymentReference: member.paymentReference,
    phone: member.user.phone,
    savingsBalance: toMoneyString(savingsBalance),
    currency: member.association.currency,
    obligationStart: resolveObligationStart(member),
    isExempt: isCurrentlyExempt(member.contributionStanding, options.asOf ?? new Date()),
    exemptReason: member.contributionStanding?.exemptReason ?? null,
    exemptUntil: member.contributionStanding?.exemptUntil ?? null,
    fines: member.contributionFines.map((fine) => ({
      id: fine.id,
      reference: fine.reference,
      amount: toMoneyString(fine.amount),
      missedDays: fine.missedDays,
      rate: fine.rate === null ? null : toMoney(fine.rate).toFixed(2),
      amountPerShare:
        fine.amountPerShare === null ? null : toMoneyString(fine.amountPerShare),
      shares: fine.shares,
      status: fine.status,
      assessedAt: fine.assessedAt,
      waiverReason: fine.waiverReason,
    })),
  };
}

/**
 * When this member's obligation began.
 *
 * Falls back through approval, then join date, then the day the record was
 * created. NEVER defaults to "today", which would show a member who joined two
 * years ago as perfectly up to date and quietly forgive every missed day.
 */
function resolveObligationStart(member: {
  contributionStanding: { obligationStartDate: Date | null } | null;
  approvedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
}): Date {
  return (
    member.contributionStanding?.obligationStartDate ??
    member.approvedAt ??
    member.joinedAt ??
    member.createdAt
  );
}

/** An exemption with a date on it stops applying when that date passes. */
function isCurrentlyExempt(
  standing: { isExempt: boolean; exemptUntil: Date | null } | null,
  asOf: Date
): boolean {
  if (!standing?.isExempt) return false;
  if (!standing.exemptUntil) return true;
  return standing.exemptUntil.getTime() > asOf.getTime();
}

// ---------------------------------------------------------------------------
// The association-wide view
// ---------------------------------------------------------------------------

export interface StandingsPage {
  rows: MemberStandingRow[];
  total: number;
  summary: {
    members: number;
    current: number;
    behind: number;
    finable: number;
    exempt: number;
    totalArrears: string;
    outstandingFines: string;
    feesPending: string;
  };
}

export interface MemberStandingRow {
  memberId: string;
  memberNumber: string;
  memberName: string;
  paymentReference: string;
  status: ContributionStatus;
  missedDays: number;
  daysUntilFine: number;
  arrearsTotal: string;
  outstandingFineAmount: string;
  clearingAmount: string;
  savingsBalance: string;
  feeDaysOwed: number;
  /// The daily service fee for this member, multiplied by their share count.
  dailyFee: string;
  /// Shares held.
  shares: number;
  isExempt: boolean;
  /// The fines still owed, so the admin table can offer "collect" and "waive"
  /// without a query per row. Carried here rather than fetched per member
  /// because a page of 25 rows would otherwise issue 25 more round trips for
  /// data that almost every row does not have.
  outstandingFines: { id: string; amount: string }[];
  /// ISO date, for the dialog that corrects when a member's obligation began.
  obligationStart: string;
}

/**
 * Everyone's standing, for the admin compliance screen.
 *
 * Computed in the application rather than in SQL. That is a deliberate
 * trade: the arithmetic is intricate enough that having ONE implementation,
 * unit-tested and shared with the member's own page, matters more than the
 * query being a single aggregate. An association has hundreds of members, not
 * millions, and the alternative — a second copy of the fine-threshold logic
 * written in SQL — is exactly how a member ends up seeing one figure on their
 * dashboard and an officer another on theirs.
 */
export async function listStandings(
  associationId: string,
  options: {
    status?: ContributionStatus | "ALL";
    search?: string;
    page?: number;
    pageSize?: number;
    asOf?: Date;
  } = {}
): Promise<StandingsPage> {
  const pageSize = Math.min(options.pageSize ?? 25, 200);
  const page = Math.max(1, options.page ?? 1);

  const computed = (await computeStandings(associationId, options)).map(
    ({ row }) => row
  );

  const summary = {
    members: computed.length,
    current: computed.filter((row) => row.status === "CURRENT").length,
    behind: computed.filter(
      (row) => row.status === "BEHIND" || row.status === "AT_RISK"
    ).length,
    finable: computed.filter((row) => row.status === "FINABLE").length,
    exempt: computed.filter((row) => row.status === "EXEMPT").length,
    totalArrears: toMoneyString(
      computed.reduce((total, row) => add(total, row.arrearsTotal), toMoney(0))
    ),
    outstandingFines: toMoneyString(
      computed.reduce((total, row) => add(total, row.outstandingFineAmount), toMoney(0))
    ),
    feesPending: toMoneyString(
      computed.reduce(
        (total, row) => add(total, multiply(row.dailyFee, row.feeDaysOwed)),
        toMoney(0)
      )
    ),
  };

  const filtered =
    options.status && options.status !== "ALL"
      ? computed.filter((row) => row.status === options.status)
      : computed;

  // Worst first. An arrears screen sorted by name is a screen nobody acts on.
  //
  // The float conversion is for ORDERING ONLY and never flows back into a
  // stored value — the same edge-conversion rule the charts follow. Two fines
  // a cent apart sorting the wrong way round costs nothing; the amounts
  // themselves stay exact strings.
  const ordered = filtered.sort(
    (a, b) =>
      b.missedDays - a.missedDays ||
      Number(b.outstandingFineAmount) - Number(a.outstandingFineAmount) ||
      a.memberName.localeCompare(b.memberName)
  );

  return {
    rows: ordered.slice((page - 1) * pageSize, page * pageSize),
    total: ordered.length,
    summary,
  };
}

/**
 * Every contributing member's standing, unsorted and unpaginated — the
 * computation behind `listStandings`, shared with the association-wide member
 * account statement so the arrears an officer prints and the arrears on the
 * compliance screen come from the same arithmetic.
 *
 * Carries the full `ContributionStanding` beside the row because the statement
 * also needs the day counts the shareholding figure is built from.
 */
export async function computeStandings(
  associationId: string,
  options: { search?: string; asOf?: Date } = {}
): Promise<{ row: MemberStandingRow; standing: ContributionStanding }[]> {
  const asOf = options.asOf ?? new Date();

  const [policy, association, members] = await Promise.all([
    getPolicy(associationId),
    prisma.association.findUnique({
      where: { id: associationId },
      select: { timezone: true, currency: true },
    }),
    prisma.member.findMany({
      // Only members who are actually expected to contribute. A pending
      // applicant has not been admitted and a departed member has no
      // obligation; showing either as "behind" would put people who owe
      // nothing at the top of an arrears list.
      where: {
        associationId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        ...(options.search
          ? {
              OR: [
                { memberNumber: { contains: options.search, mode: "insensitive" } },
                { paymentReference: { contains: options.search, mode: "insensitive" } },
                {
                  user: {
                    OR: [
                      { firstName: { contains: options.search, mode: "insensitive" } },
                      { lastName: { contains: options.search, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        memberNumber: true,
        paymentReference: true,
        joinedAt: true,
        approvedAt: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
        savingsAccounts: {
          where: { isActive: true },
          select: { balance: true, totalDeposits: true },
        },
        contributionStanding: true,
        sharesSubscribed: true,
        contributionFines: {
          where: { status: { in: ["OUTSTANDING", "SETTLED"] } },
          orderBy: { dueDayIndex: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            missedDays: true,
            dueDayIndex: true,
            status: true,
          },
        },
        platformFeeCharges: {
          where: { status: "CHARGED" },
          orderBy: { coveredThroughDay: "desc" },
          take: 1,
          select: { coveredThroughDay: true },
        },
      },
    }),
  ]);

  const timeZone = association?.timezone ?? "Africa/Kigali";

  return members.map((member) => {
    const totalContributed = member.savingsAccounts.reduce(
      (total, account) => add(total, account.totalDeposits),
      toMoney(0)
    );
    const savingsBalance = member.savingsAccounts.reduce(
      (total, account) => add(total, account.balance),
      toMoney(0)
    );
    const outstandingFines = member.contributionFines.filter(
      (fine) => fine.status === "OUTSTANDING"
    );

    const outstandingFineAmount = outstandingFines.reduce(
      (total, fine) => add(total, fine.amount),
      toMoney(0)
    );

    const obligationStart = resolveObligationStart(member);

    const standing = computeStanding({
      policy,
      timeZone,
      obligationStart,
      shares: member.sharesSubscribed ?? 1,
      asOf,
      totalContributed: toMoneyString(totalContributed),
      feeChargedThroughDay: member.platformFeeCharges[0]?.coveredThroughDay ?? 0,
      priorFines: member.contributionFines.map((fine) => ({
        missedDays: fine.missedDays,
        dueDayIndex: fine.dueDayIndex,
      })),
      outstandingFineAmount: toMoneyString(outstandingFineAmount),
      isExempt: isCurrentlyExempt(member.contributionStanding, asOf),
    });

    const row: MemberStandingRow = {
      memberId: member.id,
      memberNumber: member.memberNumber,
      memberName: `${member.user.firstName} ${member.user.lastName}`,
      paymentReference: member.paymentReference,
      status: standing.status,
      missedDays: standing.missedDays,
      daysUntilFine: standing.daysUntilFine,
      arrearsTotal: standing.arrearsTotal,
      outstandingFineAmount: standing.outstandingFineAmount,
      clearingAmount: standing.clearingAmount,
      savingsBalance: toMoneyString(savingsBalance),
      feeDaysOwed: standing.feeDaysOwed,
      dailyFee: standing.dailyFee,
      shares: member.sharesSubscribed ?? 1,
      isExempt: standing.status === "EXEMPT",
      outstandingFines: outstandingFines.map((fine) => ({
        id: fine.id,
        amount: toMoneyString(fine.amount),
      })),
      obligationStart: obligationStart.toISOString().slice(0, 10),
    };

    return { row, standing };
  });
}

// ---------------------------------------------------------------------------
// Charging the platform's service fee
// ---------------------------------------------------------------------------

export interface FeeRunResult {
  membersConsidered: number;
  charged: number;
  skippedInsufficientFunds: number;
  totalCharged: string;
}

/**
   * Takes the service fee for every contribution-day a member has paid for and
   * not yet been charged.
   *
   * THE SEQUENCE THIS PRODUCES ON A STATEMENT, which is the whole point of doing
   * it as a debit rather than by splitting the deposit:
   *
   *     DEPOSIT   +1,050    balance 1,050
   *     FEE          -50    balance 1,000
   *
   * The member sees what they paid, what the service cost, and what they saved.
   * Crediting 1,000 and quietly pocketing 50 would show a member who paid 1,050
   * a deposit of 1,000, and there is no honest way to explain that on a receipt.
   *
   * The daily fee is per share, so a member holding three shares is debited
   * 150 per day and the PlatformFeeCharge records that 150 as its feePerDay.
   *
   * IDEMPOTENT by the unique index on (memberId, coveredThroughDay): a second run
   * finds the charge already there and does nothing.
   *
   * A member whose balance cannot cover the fee is SKIPPED, not overdrawn. They
   * are caught up on the next run once they contribute again.
   */
export async function chargePlatformFees(
  associationId: string,
  options: { actorId?: string | null; asOf?: Date; memberIds?: string[] } = {}
): Promise<FeeRunResult> {
  const asOf = options.asOf ?? new Date();
  const policy = await getPolicy(associationId);

  const result: FeeRunResult = {
    membersConsidered: 0,
    charged: 0,
    skippedInsufficientFunds: 0,
    totalCharged: "0.00",
  };

  // No fee configured is a legitimate configuration — an association running
  // the platform for free — and must not produce a run of zero-value debits.
  if (!gt(policy.platformFeePerDay, 0)) return result;

  const association = await prisma.association.findUnique({
    where: { id: associationId },
    select: { timezone: true },
  });
  const timeZone = association?.timezone ?? "Africa/Kigali";

  const members = await prisma.member.findMany({
    where: {
      associationId,
      status: "ACTIVE",
      ...(options.memberIds ? { id: { in: options.memberIds } } : {}),
    },
    select: {
      id: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      contributionStanding: true,
      sharesSubscribed: true,
      savingsAccounts: {
        where: { isActive: true },
        orderBy: { openedAt: "asc" },
        take: 1,
        select: { id: true, totalDeposits: true },
      },
      platformFeeCharges: {
        where: { status: "CHARGED" },
        orderBy: { coveredThroughDay: "desc" },
        take: 1,
        select: { coveredThroughDay: true },
      },
    },
  });

  let total = toMoney(0);

  for (const member of members) {
    const account = member.savingsAccounts[0];
    if (!account) continue;
    if (isCurrentlyExempt(member.contributionStanding, asOf)) continue;

    result.membersConsidered++;

    const chargedThrough = member.platformFeeCharges[0]?.coveredThroughDay ?? 0;

    const standing = computeStanding({
      policy,
      timeZone,
      obligationStart: resolveObligationStart(member),
      shares: member.sharesSubscribed ?? 1,
      asOf,
      totalContributed: toMoneyString(account.totalDeposits),
      feeChargedThroughDay: chargedThrough,
      priorFines: [],
      outstandingFineAmount: "0.00",
      isExempt: false,
    });

    if (standing.feeDaysOwed <= 0) continue;

    const coveredThroughDay = chargedThrough + standing.feeDaysOwed;

    try {
      await withFinancialTransaction(async (tx) => {
        const posted = await postSavingsTransaction(
          {
            savingsAccountId: account.id,
            type: "FEE",
            direction: "DEBIT",
            amount: standing.feeAmountOwed,
            description: `Platform service fee for ${standing.feeDaysOwed} contribution day(s)`,
            postedById: options.actorId ?? null,
            // Never. A member cannot be pushed into the red by a fee.
            allowOverdraft: false,
          },
          tx
        );

        await tx.platformFeeCharge.create({
          data: {
            associationId,
            memberId: member.id,
            reference: buildTransactionReference("PSF"),
            daysCovered: standing.feeDaysOwed,
            coveredThroughDay,
            feePerDay: standing.dailyFee,
            amount: standing.feeAmountOwed,
            savingsTransactionId: posted.id,
            chargedById: options.actorId ?? null,
          },
        });

        await recordAudit(
          {
            action: AUDIT_ACTIONS.PLATFORM_FEE_CHARGED,
            entityType: "PlatformFeeCharge",
            entityId: member.id,
            associationId,
            newValue: {
              memberId: member.id,
              days: standing.feeDaysOwed,
              amount: standing.feeAmountOwed,
              coveredThroughDay,
            },
            metadata: { savingsTransaction: posted.reference },
          },
          options.actorId ? { id: options.actorId } : null,
          tx
        );
      });

      result.charged++;
      total = add(total, standing.feeAmountOwed);
    } catch (error) {
      if (error instanceof LedgerError && error.code === "INSUFFICIENT_FUNDS") {
        result.skippedInsufficientFunds++;
        continue;
      }

      // A unique-constraint collision means a concurrent run already charged
      // these days. That is the index doing its job, not a failure.
      if (isUniqueViolation(error)) continue;

      logger.error(
        { err: error, memberId: member.id, associationId },
        "platform fee charge failed"
      );
    }
  }

  result.totalCharged = toMoneyString(total);
  return result;
}

// ---------------------------------------------------------------------------
// Assessing fines
// ---------------------------------------------------------------------------

export interface FineRunResult {
  membersConsidered: number;
  assessed: number;
  totalAssessed: string;
}

/**
 * Assesses the fines the rules call for tonight, and tells each member.
 *
 * Nothing is taken from anybody's savings here — see the note at the top of
 * this file. The fine is recorded as owed and the member is notified with the
 * figure that clears it.
 */
export async function assessFines(
  associationId: string,
  options: { actorId?: string | null; asOf?: Date; memberIds?: string[] } = {}
): Promise<FineRunResult> {
  const asOf = options.asOf ?? new Date();
  const policy = await getPolicy(associationId);

  const result: FineRunResult = {
    membersConsidered: 0,
    assessed: 0,
    totalAssessed: "0.00",
  };

  if (!gt(policy.penaltyPerShare, 0)) return result;

  const association = await prisma.association.findUnique({
    where: { id: associationId },
    select: { timezone: true, currency: true },
  });
  const timeZone = association?.timezone ?? "Africa/Kigali";

  const members = await prisma.member.findMany({
    where: {
      associationId,
      status: "ACTIVE",
      ...(options.memberIds ? { id: { in: options.memberIds } } : {}),
    },
    select: {
      id: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      paymentReference: true,
      userId: true,
      contributionStanding: true,
      sharesSubscribed: true,
      savingsAccounts: {
        where: { isActive: true },
        select: { totalDeposits: true },
      },
      contributionFines: {
        where: { status: { in: ["OUTSTANDING", "SETTLED"] } },
        orderBy: { dueDayIndex: "desc" },
        take: 10,
        select: {
          amount: true,
          missedDays: true,
          dueDayIndex: true,
          status: true,
        },
      },
      platformFeeCharges: {
        where: { status: "CHARGED" },
        orderBy: { coveredThroughDay: "desc" },
        take: 1,
        select: { coveredThroughDay: true },
      },
    },
  });

  let total = toMoney(0);

  for (const member of members) {
    if (isCurrentlyExempt(member.contributionStanding, asOf)) continue;

    result.membersConsidered++;

    const totalContributed = member.savingsAccounts.reduce(
      (sum, account) => add(sum, account.totalDeposits),
      toMoney(0)
    );

    const outstandingFineAmount = member.contributionFines
      .filter((fine) => fine.status === "OUTSTANDING")
      .reduce((sum, fine) => add(sum, fine.amount), toMoney(0));

    const standing = computeStanding({
      policy,
      timeZone,
      obligationStart: resolveObligationStart(member),
      shares: member.sharesSubscribed ?? 1,
      asOf,
      totalContributed: toMoneyString(totalContributed),
      feeChargedThroughDay: member.platformFeeCharges[0]?.coveredThroughDay ?? 0,
      priorFines: member.contributionFines.map((fine) => ({
        missedDays: fine.missedDays,
        dueDayIndex: fine.dueDayIndex,
      })),
      outstandingFineAmount: toMoneyString(outstandingFineAmount),
      isExempt: false,
    });

    if (!standing.fineDue) continue;

    const fine = standing.fineDue;

    try {
      const created = await prisma.contributionFine.create({
        data: {
          associationId,
          memberId: member.id,
          reference: buildTransactionReference("FIN"),
          missedDays: fine.missedDays,
          dueDayIndex: fine.dueDayIndex,
          arrearsAmount: fine.arrearsAmount,
          amountPerShare: fine.amountPerShare,
          shares: fine.shares,
          amount: fine.amount,
          currency: association?.currency ?? "RWF",
          assessedAt: asOf,
          assessedById: options.actorId ?? null,
        },
        select: { id: true, reference: true },
      });

      await recordAudit(
        {
          action: AUDIT_ACTIONS.CONTRIBUTION_FINE_ASSESSED,
          entityType: "ContributionFine",
          entityId: created.id,
          associationId,
          newValue: {
            memberId: member.id,
            reference: created.reference,
            missedDays: fine.missedDays,
            arrears: fine.arrearsAmount,
            amountPerShare: fine.amountPerShare,
            shares: fine.shares,
            amount: fine.amount,
          },
          severity: "NOTICE",
        },
        options.actorId ? { id: options.actorId } : null
      );

      await notify({
        userId: member.userId,
        event: NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED,
        context: {
          amount: fine.amount,
          reference: created.reference,
          daysBehind: fine.missedDays,
          finePerShare: fine.amountPerShare,
          fineShares: fine.shares,
          // Arrears plus every fine still owed, INCLUDING the one just
          // assessed. Quoting only the new fine would name a figure that does
          // not clear the account, and a member who paid it exactly would be
          // fined again for the remainder.
          clearingAmount: toMoneyString(add(standing.clearingAmount, fine.amount)),
        },
        entityType: "ContributionFine",
        entityId: created.id,
      });

      result.assessed++;
      total = add(total, fine.amount);
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      logger.error(
        { err: error, memberId: member.id, associationId },
        "fine assessment failed"
      );
    }
  }

  result.totalAssessed = toMoneyString(total);
  return result;
}

// ---------------------------------------------------------------------------
// Acting on a fine
// ---------------------------------------------------------------------------

export class ContributionError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "INSUFFICIENT_FUNDS"
  ) {
    super(message);
    this.name = "ContributionError";
  }
}

/**
 * Collects an outstanding fine from the member's savings.
 *
 * A deliberate act by an officer, never automatic. The debit and the status
 * change are one transaction, so a fine can never be marked settled without
 * the money having moved.
 */
export async function settleFine(params: {
  associationId: string;
  fineId: string;
  actorId: string;
}): Promise<{ reference: string; amount: string }> {
  return withFinancialTransaction(async (tx) => {
    const fine = await tx.contributionFine.findFirst({
      where: { id: params.fineId, associationId: params.associationId },
      select: {
        id: true,
        reference: true,
        amount: true,
        status: true,
        memberId: true,
        member: {
          select: {
            userId: true,
            savingsAccounts: {
              where: { isActive: true },
              orderBy: { openedAt: "asc" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    if (!fine) throw new ContributionError("That fine does not exist", "NOT_FOUND");

    if (fine.status !== "OUTSTANDING") {
      throw new ContributionError(
        `This fine is already ${fine.status.toLowerCase()}`,
        "INVALID_STATE"
      );
    }

    const accountId = fine.member.savingsAccounts[0]?.id;
    if (!accountId) {
      throw new ContributionError(
        "This member has no active savings account to collect from",
        "NOT_FOUND"
      );
    }

    let posted;
    try {
      posted = await postSavingsTransaction(
        {
          savingsAccountId: accountId,
          type: "PENALTY",
          direction: "DEBIT",
          amount: toMoneyString(fine.amount),
          description: `Contribution fine ${fine.reference}`,
          postedById: params.actorId,
          allowOverdraft: false,
        },
        tx
      );
    } catch (error) {
      if (error instanceof LedgerError && error.code === "INSUFFICIENT_FUNDS") {
        throw new ContributionError(
          "This member's savings do not cover the fine. It stays outstanding until they contribute, or an officer waives it.",
          "INSUFFICIENT_FUNDS"
        );
      }
      throw error;
    }

    await tx.contributionFine.update({
      where: { id: fine.id },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        savingsTransactionId: posted.id,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.CONTRIBUTION_FINE_SETTLED,
        entityType: "ContributionFine",
        entityId: fine.id,
        associationId: params.associationId,
        newValue: {
          reference: fine.reference,
          amount: toMoneyString(fine.amount),
          savingsTransaction: posted.reference,
        },
        metadata: { memberId: fine.memberId },
      },
      { id: params.actorId },
      tx
    );

    return { reference: fine.reference, amount: toMoneyString(fine.amount) };
  });
}

/** Forgives a fine. The reason is mandatory and is shown to the member. */
export async function waiveFine(params: {
  associationId: string;
  fineId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const fine = await prisma.contributionFine.findFirst({
    where: { id: params.fineId, associationId: params.associationId },
    select: { id: true, reference: true, amount: true, status: true, memberId: true },
  });

  if (!fine) throw new ContributionError("That fine does not exist", "NOT_FOUND");

  if (fine.status !== "OUTSTANDING") {
    throw new ContributionError(
      `Only an outstanding fine can be waived — this one is ${fine.status.toLowerCase()}`,
      "INVALID_STATE"
    );
  }

  await prisma.contributionFine.update({
    where: { id: fine.id },
    data: {
      status: "WAIVED",
      waivedAt: new Date(),
      waivedById: params.actorId,
      waiverReason: params.reason,
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CONTRIBUTION_FINE_WAIVED,
      entityType: "ContributionFine",
      entityId: fine.id,
      associationId: params.associationId,
      oldValue: { status: "OUTSTANDING", amount: toMoneyString(fine.amount) },
      newValue: { status: "WAIVED" },
      reason: params.reason,
      metadata: { memberId: fine.memberId, reference: fine.reference },
      severity: "NOTICE",
    },
    { id: params.actorId }
  );
}

/**
 * Excuses a member from contributing, or brings them back into it.
 *
 * Creates the standing row on first use — most members never need one, so it
 * is not written at registration.
 */
export async function setExemption(params: {
  associationId: string;
  memberId: string;
  actorId: string;
  isExempt: boolean;
  reason: string;
  until?: Date | null;
}): Promise<void> {
  const member = await prisma.member.findFirst({
    where: { id: params.memberId, associationId: params.associationId },
    select: { id: true },
  });

  if (!member) throw new ContributionError("That member does not exist", "NOT_FOUND");

  await prisma.memberContributionStanding.upsert({
    where: { memberId: params.memberId },
    create: {
      associationId: params.associationId,
      memberId: params.memberId,
      isExempt: params.isExempt,
      exemptReason: params.reason,
      exemptUntil: params.until ?? null,
    },
    update: {
      isExempt: params.isExempt,
      exemptReason: params.reason,
      exemptUntil: params.until ?? null,
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CONTRIBUTION_EXEMPTION_CHANGED,
      entityType: "Member",
      entityId: params.memberId,
      associationId: params.associationId,
      newValue: { isExempt: params.isExempt, until: params.until ?? null },
      reason: params.reason,
      severity: "NOTICE",
    },
    { id: params.actorId }
  );
}

/**
 * Moves the day a member's obligation began.
 *
 * Consequential: it changes how many days everyone agrees they owe, and
 * therefore what they are in arrears for. Audited at WARNING for that reason.
 */
export async function setObligationStart(params: {
  associationId: string;
  memberId: string;
  actorId: string;
  startDate: Date;
  reason: string;
}): Promise<void> {
  const existing = await prisma.memberContributionStanding.findUnique({
    where: { memberId: params.memberId },
    select: { obligationStartDate: true },
  });

  await prisma.memberContributionStanding.upsert({
    where: { memberId: params.memberId },
    create: {
      associationId: params.associationId,
      memberId: params.memberId,
      obligationStartDate: params.startDate,
    },
    update: { obligationStartDate: params.startDate },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CONTRIBUTION_EXEMPTION_CHANGED,
      entityType: "Member",
      entityId: params.memberId,
      associationId: params.associationId,
      oldValue: { obligationStartDate: existing?.obligationStartDate ?? null },
      newValue: { obligationStartDate: params.startDate },
      reason: params.reason,
      severity: "WARNING",
    },
    { id: params.actorId }
  );
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface ReminderRunResult {
  considered: number;
  warned: number;
  clearedNotices: number;
}

/**
 * Warns members who are about to be fined.
 *
 * ESCALATION, NOT REPETITION. `lastReminderStage` holds the arrears count the
 * member was last warned at, and a new warning goes out only when they have
 * fallen further behind. A member who is five days down on Monday and still
 * five days down on Tuesday hears nothing on Tuesday — daily nagging is how
 * people learn to ignore the message that actually mattered, and every SMS is
 * billed.
 *
 * The stage resets to zero when they catch up, so somebody who falls behind
 * again months later is warned properly rather than treated as already told.
 */
export async function sendContributionReminders(
  associationId: string,
  options: { asOf?: Date } = {}
): Promise<ReminderRunResult> {
  const asOf = options.asOf ?? new Date();
  const policy = await getPolicy(associationId);

  const result: ReminderRunResult = { considered: 0, warned: 0, clearedNotices: 0 };

  const association = await prisma.association.findUnique({
    where: { id: associationId },
    select: { timezone: true },
  });
  const timeZone = association?.timezone ?? "Africa/Kigali";

  const members = await prisma.member.findMany({
    where: { associationId, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      joinedAt: true,
      approvedAt: true,
      createdAt: true,
      paymentReference: true,
      contributionStanding: true,
      sharesSubscribed: true,
      savingsAccounts: {
        where: { isActive: true },
        select: { balance: true, totalDeposits: true },
      },
      contributionFines: {
        where: { status: "OUTSTANDING" },
        select: { amount: true, missedDays: true, dueDayIndex: true },
      },
      platformFeeCharges: {
        where: { status: "CHARGED" },
        orderBy: { coveredThroughDay: "desc" },
        take: 1,
        select: { coveredThroughDay: true },
      },
    },
    take: 5000,
  });

  for (const member of members) {
    if (isCurrentlyExempt(member.contributionStanding, asOf)) continue;

    result.considered++;

    const totalContributed = member.savingsAccounts.reduce(
      (sum, account) => add(sum, account.totalDeposits),
      toMoney(0)
    );
    const balance = member.savingsAccounts.reduce(
      (sum, account) => add(sum, account.balance),
      toMoney(0)
    );
    const outstandingFineAmount = member.contributionFines.reduce(
      (sum, fine) => add(sum, fine.amount),
      toMoney(0)
    );

    const standing = computeStanding({
      policy,
      timeZone,
      obligationStart: resolveObligationStart(member),
      shares: member.sharesSubscribed ?? 1,
      asOf,
      totalContributed: toMoneyString(totalContributed),
      feeChargedThroughDay: member.platformFeeCharges[0]?.coveredThroughDay ?? 0,
      priorFines: member.contributionFines.map((fine) => ({
        missedDays: fine.missedDays,
        dueDayIndex: fine.dueDayIndex,
      })),
      outstandingFineAmount: toMoneyString(outstandingFineAmount),
      isExempt: false,
    });

    const lastStage = member.contributionStanding?.lastReminderStage ?? 0;

    // Caught up. Clear the escalation state, and say so once — but only to
    // somebody who was actually warned, so a member who has never been behind
    // is never congratulated for it.
    if (standing.missedDays === 0) {
      if (lastStage > 0) {
        await upsertReminderState(associationId, member.id, 0, asOf);
        await notify({
          userId: member.userId,
          event: NOTIFICATION_EVENTS.CONTRIBUTION_BACK_ON_TRACK,
          context: { balance: toMoneyString(balance) },
          entityType: "Member",
          entityId: member.id,
        });
        result.clearedNotices++;
      }
      continue;
    }

    // Warn once the fine is within the lead time, and again on any day the
    // member has slipped further than when they were last told.
    const withinLeadTime = standing.daysUntilFine <= policy.reminderLeadDays;
    const slippedFurther = standing.missedDays > lastStage;

    if (!withinLeadTime || !slippedFurther) continue;

    await notify({
      userId: member.userId,
      event: NOTIFICATION_EVENTS.CONTRIBUTION_DUE_WARNING,
      context: {
        daysBehind: standing.missedDays,
        daysUntilFine: standing.daysUntilFine,
        clearingAmount: standing.clearingAmount,
        // The fine this member would actually be charged, shares included,
        // rather than the rulebook's per-share figure they would have to
        // multiply out themselves.
        fineAmount: standing.fineAmount,
      },
      entityType: "Member",
      entityId: member.id,
    });

    await upsertReminderState(associationId, member.id, standing.missedDays, asOf);
    result.warned++;
  }

  return result;
}

async function upsertReminderState(
  associationId: string,
  memberId: string,
  stage: number,
  asOf: Date
): Promise<void> {
  await prisma.memberContributionStanding.upsert({
    where: { memberId },
    create: {
      associationId,
      memberId,
      lastReminderStage: stage,
      lastReminderAt: asOf,
      lastEvaluatedAt: asOf,
    },
    update: {
      lastReminderStage: stage,
      lastReminderAt: asOf,
      lastEvaluatedAt: asOf,
    },
  });
}

/** Prisma's unique-constraint error, without importing the whole error class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

