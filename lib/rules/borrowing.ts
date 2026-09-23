import {
  add,
  divide,
  gt,
  max,
  multiply,
  percentageOf,
  subtract,
  toMoney,
  toMoneyString,
} from "@/lib/money";
import type { AssociationPolicy } from "@/lib/services/rulebook";

/**
 * WHAT A MEMBER MAY BORROW, AND WHAT IT WILL COST THEM.
 *
 * Deliberately NOT server-only, and deliberately pure. The same function runs
 * on the server, where it decides, and in the member's browser, where it shows
 * them the answer as they type an amount into the application form. One
 * implementation means the figure a member is shown before they apply is the
 * figure they are judged against when they do — a form that encourages
 * somebody to request 400,000 and is then refused by a server rule they never
 * saw is how people conclude the committee is playing favourites.
 *
 * WHY THIS IS SEPARATE FROM `checkEligibility` IN THE LOAN CALCULATOR. That
 * function enforces the LOAN PRODUCT's limits — minimum amount, term bounds,
 * the savings multiplier the product was configured with. This one enforces
 * the ASSOCIATION'S OWN RULES, which apply to every product alike: how long
 * the association must have been running, how long you must have been saving,
 * the share of your own savings you may take without pledging anything, and
 * the fact that somebody behind on their daily contribution may not borrow at
 * all. Both run; a request has to satisfy the two.
 *
 * THE STRUCTURE OF THE ANSWER matters as much as the answer. A member turned
 * down is told which rule stopped them and what would change it — "you may
 * borrow 240,000 on your own savings; above that, guarantors must cover the
 * difference" is actionable, and "not eligible" is not.
 *
 * ABOVE THE OWN SHARE, GUARANTORS FIRST. The part of a loan above the member's
 * own share is other members' money, so it is backed by other members: one or
 * more guarantors, each a member who pledges part of their own savings. Their
 * pledges are added up against that part. Whatever they do not cover can still
 * be backed by pledged items at the collateral coverage rate, so an
 * association that also takes machines or materials keeps doing so.
 */

/// How many guarantors one application may name. Here rather than in the
/// guarantor service because the form in the browser enforces it too.
export const MAX_GUARANTORS = 10;

export interface BorrowingAssessmentInput {
  policy: AssociationPolicy;
  /// The member's own savings balance.
  savingsBalance: string;
  /// Whole months the member has been contributing.
  membershipMonths: number;
  /// Whole months the association has been running, for the lending unlock.
  associationMonths: number;
  /// How far behind the member is on the daily saving, and what they owe.
  missedDays: number;
  outstandingFines: string;
  hasActiveLoan: boolean;
  /// What the member wants, when they have named a figure.
  requestedAmount?: string | null;
  /// Value of the items pledged, when any have been offered.
  collateralValue?: string | null;
  /// What guarantors pledge from their own savings, added together. On the
  /// form and at submission this is what was ASKED of them; at approval it is
  /// only what they have ACCEPTED.
  guaranteedAmount?: string | null;
  termMonths?: number | null;
}

/**
 * Why a member cannot borrow, or cannot borrow this much.
 *
 * CARRIES ITS OWN NUMBERS SEPARATELY FROM ITS SENTENCE. `message` is the
 * English form, which is what the server stores in the application's
 * eligibility snapshot and returns from the API; `rule` and `params` are what
 * the member's page uses to render the same fact in Kinyarwanda. Returning
 * only the sentence would have made this module untranslatable, and the
 * audience that most needs to understand why they were refused is the one
 * reading Kinyarwanda.
 */
export interface BorrowingBlocker {
  rule: BlockerRule;
  params: Record<string, string | number>;
  message: string;
}

export type BlockerRule =
  | "LENDING_NOT_OPEN"
  | "MEMBERSHIP_TOO_SHORT"
  | "IN_ARREARS"
  | "FINE_OUTSTANDING"
  | "ACTIVE_LOAN"
  | "AMOUNT"
  | "ABOVE_MAXIMUM"
  | "COLLATERAL"
  | "TERM_TOO_LONG";

/** A condition the member can still satisfy, rather than a refusal. */
export interface BorrowingRequirement {
  rule: "NO_SAVINGS" | "COLLATERAL_TO_RECORD" | "GUARANTORS_TO_ACCEPT";
  params: Record<string, string | number>;
  message: string;
}

export interface LoanIllustration {
  principal: string;
  termMonths: number;
  monthlyRate: string;
  /// Flat interest: the rate applied to the principal for each month of the
  /// term. Flat rather than reducing-balance because it is what the rule as
  /// stated means, and because a member can check it with a phone calculator.
  monthlyInterest: string;
  totalInterest: string;
  /// The two halves of the interest under the sharing rule.
  memberShareOfInterest: string;
  associationShareOfInterest: string;
  totalRepayable: string;
  monthlyInstalment: string;
  /// Interest less the part that comes back to the member: what the loan
  /// actually costs them once the sharing rule is taken into account.
  netCostToMember: string;
}

export interface BorrowingAssessment {
  /// The most this member may take against their own savings alone.
  ownShareLimit: string;
  /// The largest loan the rules allow at all: a multiple of the member's
  /// savings (STGT Art. 34). Nothing — guarantors or collateral — lifts it.
  maximumLoan: string;
  /// Of the requested amount, how much would come from the association's
  /// pooled money — that is, other members' savings.
  aboveOwnShare: string;
  /// How much of `aboveOwnShare` guarantors' pledges cover. Never more than
  /// `aboveOwnShare`: a pledge beyond what is needed secures nothing.
  guaranteed: string;
  /// `aboveOwnShare` less `guaranteed`: the part guarantors leave uncovered.
  uncoveredAboveShare: string;
  /// Collateral value the rules require for the uncovered part.
  collateralRequired: string;
  /// How much more collateral is needed than has been offered.
  collateralShortfall: string;
  collateralSatisfied: boolean;

  /// True when the member may borrow at all today.
  canBorrow: boolean;
  /// True when the specific request also passes.
  requestAllowed: boolean;
  blockers: BorrowingBlocker[];
  /// Conditions the member can still satisfy, rather than hard refusals.
  requirements: BorrowingRequirement[];

  /// Months until the member becomes eligible, 0 when they already are.
  monthsUntilMemberEligible: number;
  monthsUntilLendingOpens: number;

  maxTermMonths: number;
  illustration: LoanIllustration | null;
}

/**
 * Places a member, and optionally a specific request, against the rulebook.
 *
 * Every branch returns a sentence a member can act on. Nothing here throws:
 * an assessment is asked for on page loads where the member has typed nothing
 * yet, and a half-filled form must produce guidance rather than an error.
 */
export function assessBorrowing(
  input: BorrowingAssessmentInput
): BorrowingAssessment {
  const { policy } = input;

  const savings = toMoney(input.savingsBalance);
  const blockers: BorrowingBlocker[] = [];
  const requirements: BorrowingRequirement[] = [];

  // --- What the member may take against their own savings ------------------

  const ownShareLimit = percentageOf(savings, policy.ownSavingsPercent);
  const maximumLoan = percentageOf(savings, policy.loanMaxSavingsMultiplePercent);
  const maximumPercent = toMoney(policy.loanMaxSavingsMultiplePercent)
    .toDecimalPlaces(2)
    .toString();

  // --- Rules about the member and the moment -------------------------------

  const monthsUntilLendingOpens = Math.max(
    0,
    policy.lendingUnlockMonths - input.associationMonths
  );

  if (monthsUntilLendingOpens > 0) {
    blockers.push({
      rule: "LENDING_NOT_OPEN",
      params: {
        required: policy.lendingUnlockMonths,
        remaining: monthsUntilLendingOpens,
      },
      message: `The association starts lending after ${policy.lendingUnlockMonths} months of saving. That is ${monthsUntilLendingOpens} month(s) away.`,
    });
  }

  const monthsUntilMemberEligible = Math.max(
    0,
    policy.memberMinimumMonths - input.membershipMonths
  );

  if (monthsUntilMemberEligible > 0) {
    blockers.push({
      rule: "MEMBERSHIP_TOO_SHORT",
      params: {
        required: policy.memberMinimumMonths,
        current: input.membershipMonths,
        remaining: monthsUntilMemberEligible,
      },
      message: `You must have been saving for ${policy.memberMinimumMonths} months before you can borrow. You have ${input.membershipMonths} month(s), so ${monthsUntilMemberEligible} more to go.`,
    });
  }

  if (policy.arrearsBlockBorrowing && input.missedDays > 0) {
    blockers.push({
      rule: "IN_ARREARS",
      params: { days: input.missedDays },
      message: `You are ${input.missedDays} day(s) behind on your daily saving. Clear it and you can apply the same day.`,
    });
  }

  if (policy.arrearsBlockBorrowing && gt(input.outstandingFines, 0)) {
    blockers.push({
      rule: "FINE_OUTSTANDING",
      params: { amount: toMoneyString(input.outstandingFines) },
      message: `You have ${toMoneyString(input.outstandingFines)} of unpaid fines. They must be settled or waived before you can borrow.`,
    });
  }

  if (input.hasActiveLoan) {
    blockers.push({
      rule: "ACTIVE_LOAN",
      params: {},
      message: "You already have a loan running. It must be finished before you take another.",
    });
  }

  // A member with nothing saved has no own-share to lend against, and under
  // the collateral rule would be borrowing entirely against pledged items.
  // Stated as a requirement rather than a blocker: it is true and useful, and
  // the association may still lend against collateral alone if it chooses.
  if (!savings.greaterThan(0)) {
    requirements.push({
      rule: "NO_SAVINGS",
      params: {},
      message: "You have no savings yet, so any loan would rest entirely on collateral.",
    });
  }

  // --- The specific request ------------------------------------------------

  const requested = input.requestedAmount ? toMoney(input.requestedAmount) : null;

  const aboveOwnShare =
    requested && gt(requested, ownShareLimit)
      ? subtract(requested, ownShareLimit)
      : toMoney(0);

  // Guarantors cover the part above the own share first. Capped at that part:
  // the pledges are compared against it, never against the whole loan.
  const pledged = toMoney(input.guaranteedAmount ?? 0);
  const guaranteed = gt(pledged, aboveOwnShare) ? aboveOwnShare : pledged;
  const uncovered = subtract(aboveOwnShare, guaranteed);

  const collateralRequired = policy.collateralRequiredAboveShare
    ? percentageOf(uncovered, policy.collateralCoveragePercent)
    : toMoney(0);

  const collateralOffered = toMoney(input.collateralValue ?? 0);

  const collateralShortfall = max(subtract(collateralRequired, collateralOffered), 0);
  const collateralSatisfied = !gt(collateralShortfall, 0);

  const requestBlockers: BorrowingBlocker[] = [];

  if (requested) {
    if (!requested.greaterThan(0)) {
      requestBlockers.push({
        rule: "AMOUNT",
        params: {},
        message: "Enter the amount you want to borrow.",
      });
    } else if (gt(requested, maximumLoan)) {
      requestBlockers.push({
        rule: "ABOVE_MAXIMUM",
        params: {
          requested: toMoneyString(requested),
          maximum: toMoneyString(maximumLoan),
          percent: maximumPercent,
        },
        message: `The largest loan the rules allow is ${toMoneyString(maximumLoan)} — ${maximumPercent}% of your savings. Ask for ${toMoneyString(maximumLoan)} or less.`,
      });
    }

    if (gt(guaranteed, 0) && policy.collateralRequiredAboveShare) {
      requirements.push({
        rule: "GUARANTORS_TO_ACCEPT",
        params: { guaranteed: toMoneyString(guaranteed) },
        message: `${toMoneyString(guaranteed)} is backed by your guarantors. Each of them must accept from their own account before the committee can approve it.`,
      });
    }

    if (gt(uncovered, 0) && policy.collateralRequiredAboveShare) {
      if (collateralSatisfied) {
        requirements.push({
          rule: "COLLATERAL_TO_RECORD",
          params: {
            above: toMoneyString(uncovered),
            required: toMoneyString(collateralRequired),
          },
          message: `${toMoneyString(uncovered)} of this is above your own savings share and not covered by guarantors, so the committee must record collateral worth at least ${toMoneyString(collateralRequired)}.`,
        });
      } else {
        requestBlockers.push({
          rule: "COLLATERAL",
          params: {
            requested: toMoneyString(requested),
            above: toMoneyString(aboveOwnShare),
            guaranteed: toMoneyString(guaranteed),
            uncovered: toMoneyString(uncovered),
            required: toMoneyString(collateralRequired),
            offered: toMoneyString(collateralOffered),
            shortfall: toMoneyString(collateralShortfall),
          },
          message: `Borrowing ${toMoneyString(requested)} goes ${toMoneyString(aboveOwnShare)} beyond your own share, and that part must be backed by guarantors. Guarantors cover ${toMoneyString(guaranteed)}, which leaves ${toMoneyString(uncovered)}: add guarantors for it, or pledge items worth ${toMoneyString(collateralRequired)} (you have offered ${toMoneyString(collateralOffered)}).`,
        });
      }
    }
  }

  const term = input.termMonths ?? policy.loanMaxTermMonths;

  if (input.termMonths && input.termMonths > policy.loanMaxTermMonths) {
    requestBlockers.push({
      rule: "TERM_TOO_LONG",
      params: { max: policy.loanMaxTermMonths },
      message: `Loans are repaid within ${policy.loanMaxTermMonths} months, after which what is still owed is charged at a higher rate. Choose a term of ${policy.loanMaxTermMonths} months or fewer.`,
    });
  }

  const canBorrow = blockers.length === 0;

  return {
    ownShareLimit: toMoneyString(ownShareLimit),
    maximumLoan: toMoneyString(maximumLoan),
    aboveOwnShare: toMoneyString(aboveOwnShare),
    guaranteed: toMoneyString(guaranteed),
    uncoveredAboveShare: toMoneyString(uncovered),
    collateralRequired: toMoneyString(collateralRequired),
    collateralShortfall: toMoneyString(collateralShortfall),
    collateralSatisfied,

    canBorrow,
    requestAllowed: canBorrow && requestBlockers.length === 0 && requested !== null,
    blockers: [...blockers, ...requestBlockers],
    requirements,

    monthsUntilMemberEligible,
    monthsUntilLendingOpens,
    maxTermMonths: policy.loanMaxTermMonths,

    illustration:
      requested && requested.greaterThan(0)
        ? illustrateLoan(policy, toMoneyString(requested), term)
        : null,
  };
}

/**
 * The largest loan the committee may approve on what is actually secured.
 *
 * The borrower's own share, plus what guarantors have ACCEPTED, plus whatever
 * the recorded items cover at the collateral coverage rate. Null when the rules
 * ask for no security above the own share, because then nothing here limits
 * the approval.
 *
 * Never above `maximumLoan` when one is given — the by-laws' cap of a multiple
 * of savings (Art. 34) binds however well a loan is secured.
 *
 * Pure and shared, so the reviewer's screen shows the same ceiling the server
 * enforces when they press approve.
 */
export function securedCeiling(input: {
  ownShareLimit: string;
  acceptedGuarantees: string;
  collateralValue?: string | null;
  collateralRequiredAboveShare: boolean;
  collateralCoveragePercent: string;
  maximumLoan?: string | null;
}): string | null {
  const cap = input.maximumLoan ?? null;
  const withCap = (secured: string | null): string | null => {
    if (cap === null) return secured;
    if (secured === null) return toMoneyString(cap);
    return gt(secured, cap) ? toMoneyString(cap) : secured;
  };

  if (!input.collateralRequiredAboveShare) return withCap(null);

  const coverage = toMoney(input.collateralCoveragePercent);
  // A coverage rate of zero means items cover any amount; nothing is capped.
  if (!coverage.greaterThan(0)) return withCap(null);

  const coveredByItems = divide(
    multiply(toMoney(input.collateralValue ?? 0), 100),
    coverage
  );

  return withCap(
    toMoneyString(add(input.ownShareLimit, input.acceptedGuarantees, coveredByItems))
  );
}

/**
 * What a loan of this size actually costs, under the rules as they stand.
 *
 * The member's share of the interest is shown as a separate line, and so is
 * the net cost after it. Under a 2% rule split one point each way, a member
 * repaying 12,000 of interest gets 6,000 of it back, and the honest headline
 * for what the loan cost them is 6,000 — not 12,000, and not zero.
 *
 * FLAT INTEREST, computed on the original principal for every month of the
 * term. That is what "2% a month for three months" means to the people who wrote
 * the rule, and it is arithmetic a member can check by hand — which matters
 * more here than the theoretical superiority of a reducing balance.
 */
export function illustrateLoan(
  policy: AssociationPolicy,
  principal: string,
  termMonths: number
): LoanIllustration {
  const months = Math.max(1, Math.min(termMonths, policy.loanMaxTermMonths));

  const monthlyInterest = percentageOf(principal, policy.loanMonthlyInterest);
  const totalInterest = multiply(monthlyInterest, months);
  const totalRepayable = add(principal, totalInterest);

  // The member's half is taken first and the association's is the remainder,
  // for the same reason as in the interest-sharing service: two independent
  // roundings would not sum back to the interest actually paid.
  const memberShare = multiply(
    totalInterest,
    divide(policy.interestMemberPoints, orOne(
      add(policy.interestMemberPoints, policy.interestAssociationPoints)
    ))
  );

  return {
    principal: toMoneyString(principal),
    termMonths: months,
    monthlyRate: toMoney(policy.loanMonthlyInterest).toFixed(2),
    monthlyInterest: toMoneyString(monthlyInterest),
    totalInterest: toMoneyString(totalInterest),
    memberShareOfInterest: toMoneyString(memberShare),
    associationShareOfInterest: toMoneyString(subtract(totalInterest, memberShare)),
    totalRepayable: toMoneyString(totalRepayable),
    monthlyInstalment: toMoneyString(divide(totalRepayable, months)),
    netCostToMember: toMoneyString(subtract(totalInterest, memberShare)),
  };
}

/**
 * Guards the interest-share divisor.
 *
 * An association that sets both interest points to zero has said it shares no
 * interest. That is a valid choice and must yield "the member gets nothing",
 * not a division by zero in the middle of a loan quotation.
 */
function orOne(value: ReturnType<typeof add>) {
  return value.greaterThan(0) ? value : toMoney(1);
}

/**
 * Whole months between two dates, rounded down.
 *
 * By calendar month rather than by dividing elapsed days, so a member who
 * joined on 4 March is six months in on 4 September — which is what both they
 * and the committee will count. Dividing by an average month length makes the
 * anniversary drift by a day or two each year and produces the maddening case
 * of somebody being told they have "5 months" on the day they know is six.
 */
export function wholeMonthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

  // Not yet reached the day-of-month anniversary, so the last month is not
  // complete. A member who joined on the 31st is credited at the end of a
  // shorter month rather than being made to wait for the next long one.
  if (to.getDate() < Math.min(from.getDate(), daysInMonth(to))) months--;

  return Math.max(0, months);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

