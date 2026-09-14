import {
  Decimal,
  add,
  allocate,
  gt,
  lt,
  multiply,
  percentageOf,
  quantize,
  subtract,
  toMoney,
  toMoneyString,
  type MoneyInput,
} from "@/lib/money";
import type {
  ChargeType,
  InterestMethod,
  RepaymentFrequency,
} from "@/lib/generated/prisma/enums";

/**
 * LOAN MATHEMATICS.
 *
 * Pure functions, no database, no side effects — which is what makes them
 * exhaustively testable. Every figure a member is shown or held to originates
 * here, so the arithmetic is worth proving rather than trusting.
 *
 * Two properties the tests hold this module to:
 *
 *   1. The instalments always sum to exactly the total payable. Dividing
 *      1,000,000 over 7 months leaves a remainder; if it is dropped, the final
 *      balance never reaches zero and the member is chased for a few francs
 *      forever. The remainder is distributed, never discarded.
 *
 *   2. Principal always amortises to exactly zero on the final instalment.
 */

export interface LoanTerms {
  principal: MoneyInput;
  /// Percentage, e.g. 18 for 18%.
  annualRate: MoneyInput;
  method: InterestMethod;
  termMonths: number;
  frequency: RepaymentFrequency;
  /// Days before the first instalment falls due.
  gracePeriodDays?: number;
  disbursementDate?: Date;

  processingFeeType?: ChargeType;
  processingFeeValue?: MoneyInput;
  insuranceFeeType?: ChargeType;
  insuranceFeeValue?: MoneyInput;
}

export interface Instalment {
  installmentNumber: number;
  dueDate: Date;
  principalDue: string;
  interestDue: string;
  feesDue: string;
  totalDue: string;
  /// Principal still outstanding after this instalment.
  balanceAfter: string;
}

export interface LoanSchedule {
  principal: string;
  totalInterest: string;
  processingFee: string;
  insuranceFee: string;
  totalFees: string;
  totalPayable: string;
  /// What actually reaches the member: principal less fees deducted up front.
  netDisbursement: string;
  instalments: Instalment[];
  periodsPerYear: number;
  numberOfPeriods: number;
  maturityDate: Date;
}

/** How many repayment periods fall in a year, per frequency. */
export const PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = {
  DAILY: 365,
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  // Treated as monthly unless a custom schedule is supplied explicitly.
  CUSTOM: 12,
};

export function periodsForTerm(
  termMonths: number,
  frequency: RepaymentFrequency
): number {
  switch (frequency) {
    case "DAILY":
      return Math.round(termMonths * 30);
    case "WEEKLY":
      return Math.round((termMonths * 52) / 12);
    case "BIWEEKLY":
      return Math.round((termMonths * 26) / 12);
    case "QUARTERLY":
      return Math.max(1, Math.round(termMonths / 3));
    case "MONTHLY":
    case "CUSTOM":
    default:
      return termMonths;
  }
}

/** Computes a fee that may be a flat amount or a percentage of principal. */
export function computeCharge(
  principal: MoneyInput,
  type: ChargeType | undefined,
  value: MoneyInput | undefined
): Decimal {
  if (!value) return toMoney(0);
  if (type === "PERCENTAGE") return percentageOf(principal, value);
  return quantize(value);
}

/**
 * Builds the full repayment schedule.
 *
 * FLAT: interest is charged on the original principal for the whole term. It
 * is simple to explain and common in community associations, but it costs the
 * member more than the headline rate suggests, because they pay interest on
 * money they have already repaid.
 *
 * REDUCING_BALANCE: interest accrues only on what is still owed. Uses the
 * standard annuity formula so every instalment is the same size, with the
 * split shifting from interest toward principal over the term.
 */
export function generateSchedule(terms: LoanTerms): LoanSchedule {
  const principal = quantize(terms.principal);

  if (!gt(principal, 0)) {
    throw new RangeError("Loan principal must be greater than zero");
  }
  if (!Number.isInteger(terms.termMonths) || terms.termMonths < 1) {
    throw new RangeError("Loan term must be a whole number of months, at least 1");
  }
  if (lt(terms.annualRate, 0)) {
    throw new RangeError("Interest rate cannot be negative");
  }

  const periods = periodsForTerm(terms.termMonths, terms.frequency);
  const periodsPerYear = PERIODS_PER_YEAR[terms.frequency];
  const periodRate = divideRate(terms.annualRate, periodsPerYear);

  const processingFee = computeCharge(
    principal,
    terms.processingFeeType,
    terms.processingFeeValue
  );
  const insuranceFee = computeCharge(
    principal,
    terms.insuranceFeeType,
    terms.insuranceFeeValue
  );
  const totalFees = add(processingFee, insuranceFee);

  const start = terms.disbursementDate ?? new Date();
  const dueDates = buildDueDates(start, periods, terms.frequency, terms.gracePeriodDays ?? 0);

  const rows =
    terms.method === "FLAT"
      ? buildFlatSchedule(principal, terms.annualRate, terms.termMonths, periods)
      : buildReducingSchedule(principal, periodRate, periods);

  // Fees are charged with the first instalment, which keeps the remaining
  // instalments a predictable, equal amount.
  const instalments: Instalment[] = rows.map((row, index) => {
    const feesDue = index === 0 ? totalFees : toMoney(0);
    return {
      installmentNumber: index + 1,
      dueDate: dueDates[index],
      principalDue: toMoneyString(row.principal),
      interestDue: toMoneyString(row.interest),
      feesDue: toMoneyString(feesDue),
      totalDue: toMoneyString(add(row.principal, row.interest, feesDue)),
      balanceAfter: toMoneyString(row.balanceAfter),
    };
  });

  const totalInterest = rows.reduce<Decimal>(
    (sum, row) => add(sum, row.interest),
    toMoney(0)
  );

  return {
    principal: toMoneyString(principal),
    totalInterest: toMoneyString(totalInterest),
    processingFee: toMoneyString(processingFee),
    insuranceFee: toMoneyString(insuranceFee),
    totalFees: toMoneyString(totalFees),
    totalPayable: toMoneyString(add(principal, totalInterest, totalFees)),
    // Fees are deducted at disbursement, so the member receives less than the
    // approved principal. Showing this explicitly avoids the single most
    // common complaint about association loans.
    netDisbursement: toMoneyString(subtract(principal, totalFees)),
    instalments,
    periodsPerYear,
    numberOfPeriods: periods,
    maturityDate: dueDates[dueDates.length - 1],
  };
}

interface ScheduleRow {
  principal: Decimal;
  interest: Decimal;
  balanceAfter: Decimal;
}

/**
 * Flat-rate schedule.
 *
 * Total interest = principal × annual rate × years. Both principal and
 * interest are split evenly across instalments using `allocate`, so the
 * columns each sum back to their exact total.
 */
function buildFlatSchedule(
  principal: Decimal,
  annualRate: MoneyInput,
  termMonths: number,
  periods: number
): ScheduleRow[] {
  // ONE EXPRESSION, QUANTIZED ONCE AT THE END.
  //
  // This used to compute `years = divide(termMonths, 12)` first, but `divide`
  // quantizes to two decimal places — so a one-month loan was priced on
  // 0.08 of a year instead of 0.0833…, undercharging the interest by 4% on
  // EVERY flat loan of a single month. On 400,000 at 24% that is 7,680
  // instead of 8,000. Rounding a ratio before multiplying money by it is
  // never safe; the rounding belongs at the end, where the franc is decided.
  const totalInterest = quantize(
    principal
      .times(toMoney(annualRate))
      .dividedBy(100)
      .times(termMonths)
      .dividedBy(12)
  );

  const principalParts = allocate(principal, periods);
  const interestParts = allocate(totalInterest, periods);

  let remaining = principal;

  return principalParts.map((principalPart, index) => {
    remaining = subtract(remaining, principalPart);
    return {
      principal: principalPart,
      interest: interestParts[index],
      // Guard against a stray negative from rounding on the final row.
      balanceAfter: lt(remaining, 0) ? toMoney(0) : remaining,
    };
  });
}

/**
 * Reducing-balance schedule using the annuity formula:
 *
 *   payment = P × r / (1 − (1 + r)^−n)
 *
 * The final instalment is adjusted to absorb accumulated rounding, so the
 * closing balance is exactly zero rather than a few francs either way.
 */
function buildReducingSchedule(
  principal: Decimal,
  periodRate: Decimal,
  periods: number
): ScheduleRow[] {
  // Interest-free loans are legitimate in an association context; the annuity
  // formula divides by zero for them, so they amortise evenly instead.
  if (periodRate.isZero()) {
    const parts = allocate(principal, periods);
    let remaining = principal;
    return parts.map((part) => {
      remaining = subtract(remaining, part);
      return { principal: part, interest: toMoney(0), balanceAfter: remaining };
    });
  }

  const onePlusR = periodRate.plus(1);
  const denominator = new Decimal(1).minus(onePlusR.pow(-periods));
  const payment = quantize(principal.times(periodRate).dividedBy(denominator));

  const rows: ScheduleRow[] = [];
  let balance = principal;

  for (let period = 1; period <= periods; period++) {
    const interest = quantize(balance.times(periodRate));

    let principalPart: Decimal;

    if (period === periods) {
      // Final instalment clears whatever is left, exactly.
      principalPart = balance;
    } else {
      principalPart = subtract(payment, interest);

      // Very high rates over short terms can make the computed interest exceed
      // the level payment. Rather than emit a negative principal — which would
      // grow the debt — the instalment covers interest only and the principal
      // is carried to the final row.
      if (lt(principalPart, 0)) principalPart = toMoney(0);
      if (gt(principalPart, balance)) principalPart = balance;
    }

    balance = subtract(balance, principalPart);

    rows.push({
      principal: principalPart,
      interest,
      balanceAfter: lt(balance, 0) ? toMoney(0) : balance,
    });
  }

  return rows;
}

/** Annual percentage rate → per-period decimal rate. */
function divideRate(annualRate: MoneyInput, periodsPerYear: number): Decimal {
  return toMoney(annualRate).dividedBy(100).dividedBy(periodsPerYear);
}

/**
 * Due dates for each instalment.
 *
 * ALL ARITHMETIC IS IN UTC, deliberately.
 *
 * The local-time methods (`setHours`, `setDate`, `getMonth`) produce different
 * calendar dates depending on the server's timezone: a loan disbursed at
 * 00:00 UTC, normalised with `setHours(0,0,0,0)` on a machine at UTC+2, moves
 * back to 22:00 the previous day. Every due date in the schedule then shifts a
 * day earlier — and a due date is not cosmetic here. It decides when an
 * instalment becomes overdue and when a penalty is charged, so a server
 * relocated to another region would silently start charging members a day
 * early. UTC keeps the schedule identical wherever it runs.
 *
 * Rwanda is UTC+2 year-round with no daylight saving, so a UTC-midnight
 * calendar date maps unambiguously onto a local one.
 *
 * Month arithmetic also avoids `setMonth` alone: a loan disbursed on the 31st
 * would otherwise skip February and land in March. The day is clamped to the
 * last valid day of the target month instead.
 */
function buildDueDates(
  start: Date,
  periods: number,
  frequency: RepaymentFrequency,
  gracePeriodDays: number
): Date[] {
  const anchor = new Date(start);
  anchor.setUTCHours(0, 0, 0, 0);
  if (gracePeriodDays > 0) anchor.setUTCDate(anchor.getUTCDate() + gracePeriodDays);

  const dates: Date[] = [];

  for (let period = 1; period <= periods; period++) {
    const due = new Date(anchor);

    switch (frequency) {
      case "DAILY":
        due.setUTCDate(anchor.getUTCDate() + period);
        break;
      case "WEEKLY":
        due.setUTCDate(anchor.getUTCDate() + period * 7);
        break;
      case "BIWEEKLY":
        due.setUTCDate(anchor.getUTCDate() + period * 14);
        break;
      case "QUARTERLY":
        addMonthsClamped(due, anchor, period * 3);
        break;
      case "MONTHLY":
      case "CUSTOM":
      default:
        addMonthsClamped(due, anchor, period);
        break;
    }

    dates.push(due);
  }

  return dates;
}

function addMonthsClamped(target: Date, anchor: Date, months: number): void {
  const day = anchor.getUTCDate();

  // Move to the 1st first: setting the month while the day is 31 rolls the
  // date forward into the following month before clamping can apply.
  target.setUTCDate(1);
  target.setUTCMonth(anchor.getUTCMonth() + months);

  // Day 0 of the next month is the last day of this one.
  const lastDayOfMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();

  target.setUTCDate(Math.min(day, lastDayOfMonth));
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityInput {
  savingsBalance: MoneyInput;
  requestedAmount: MoneyInput;
  termMonths: number;
  membershipMonths: number;
  hasActiveLoan: boolean;
  product: {
    name: string;
    minimumSavings: MoneyInput;
    savingsMultiplier: MoneyInput;
    minAmount: MoneyInput;
    maxAmount: MoneyInput;
    absoluteMaxAmount?: MoneyInput | null;
    minimumMembershipMonths: number;
    minTermMonths: number;
    maxTermMonths: number;
    singleActiveLoan: boolean;
  };
}

export interface EligibilityResult {
  eligible: boolean;
  maxEligibleAmount: string;
  failures: { rule: string; message: string }[];
  warnings: string[];
}

/**
 * Checks a request against the product's configured rules.
 *
 * Every limit comes from the LoanProduct record — nothing here is hard-coded,
 * so an association can change its lending policy without a code change. The
 * "3 × savings" example from the brief is just `savingsMultiplier = 3`.
 */
export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const failures: { rule: string; message: string }[] = [];
  const warnings: string[] = [];
  const { product } = input;

  const savings = toMoney(input.savingsBalance);
  const requested = toMoney(input.requestedAmount);

  // Ceiling = savings × multiplier, then capped by the product's own limits.
  let ceiling = multiply(savings, product.savingsMultiplier);
  if (gt(ceiling, product.maxAmount)) ceiling = quantize(product.maxAmount);
  if (product.absoluteMaxAmount && gt(ceiling, product.absoluteMaxAmount)) {
    ceiling = quantize(product.absoluteMaxAmount);
  }

  if (lt(savings, product.minimumSavings)) {
    failures.push({
      rule: "MINIMUM_SAVINGS",
      message: `A savings balance of at least ${toMoneyString(product.minimumSavings)} is required (current balance ${toMoneyString(savings)})`,
    });
  }

  if (input.membershipMonths < product.minimumMembershipMonths) {
    failures.push({
      rule: "MEMBERSHIP_DURATION",
      message: `Membership of at least ${product.minimumMembershipMonths} months is required (currently ${input.membershipMonths})`,
    });
  }

  if (lt(requested, product.minAmount)) {
    failures.push({
      rule: "MINIMUM_AMOUNT",
      message: `The smallest loan available under ${product.name} is ${toMoneyString(product.minAmount)}`,
    });
  }

  if (gt(requested, ceiling)) {
    failures.push({
      rule: "MAXIMUM_AMOUNT",
      message: `The most you can borrow is ${toMoneyString(ceiling)}, based on your savings of ${toMoneyString(savings)}`,
    });
  }

  if (input.termMonths < product.minTermMonths || input.termMonths > product.maxTermMonths) {
    failures.push({
      rule: "TERM",
      message: `The repayment period must be between ${product.minTermMonths} and ${product.maxTermMonths} months`,
    });
  }

  if (product.singleActiveLoan && input.hasActiveLoan) {
    failures.push({
      rule: "ACTIVE_LOAN",
      message: "You already have an active loan. It must be settled before you can borrow again.",
    });
  }

  // Advisory: allowed, but worth the reviewer's attention.
  if (failures.length === 0 && gt(requested, multiply(ceiling, "0.9"))) {
    warnings.push("This request is close to the member's maximum borrowing limit");
  }

  return {
    eligible: failures.length === 0,
    maxEligibleAmount: toMoneyString(ceiling),
    failures,
    warnings,
  };
}

/**
 * Overdue penalty.
 * Applied per the product's configuration, only after any grace period.
 */
export function computePenalty(params: {
  overdueAmount: MoneyInput;
  daysOverdue: number;
  penaltyType: ChargeType;
  penaltyValue: MoneyInput;
  graceDays: number;
}): string {
  if (params.daysOverdue <= params.graceDays) return "0.00";

  return toMoneyString(
    computeCharge(params.overdueAmount, params.penaltyType, params.penaltyValue)
  );
}
