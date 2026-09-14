import { describe, expect, it } from "vitest";
import { illustrateLoan } from "@/lib/rules/borrowing";
import { generateSchedule } from "@/lib/services/loan-calculator";
import { DEFAULT_POLICY } from "@/lib/services/rulebook";
import { abs, subtract } from "@/lib/money";

/**
 * THE PRODUCT MUST RESTATE THE RULEBOOK, NOT APPROXIMATE IT.
 *
 * LOAN_MONTHLY_INTEREST says 2% a month. `generateSchedule` always reads its
 * rate as ANNUAL and ignores `interestPeriod`, so the product stores 24% FLAT
 * a year — algebraically the same thing, since
 *
 *     principal × 0.24 × months/12  ≡  principal × 0.02 × months
 *
 * If those two ever drift apart, a member is quoted one loan on the rules page
 * and charged another on the apply page. This is the test that stops the
 * product being "corrected" to 2 + MONTHLY, which would charge a twelfth of
 * the rule and look plausible on screen.
 *
 * WHY THE TWO HALVES ROUND DIFFERENTLY, AND WHY THAT IS ALLOWED.
 * `illustrateLoan` quantizes the MONTHLY interest and then multiplies by the
 * term, because the rule is stated per month and a member checks it a month at
 * a time. `generateSchedule` evaluates the whole term in one expression and
 * quantizes once, which is the more accurate total. For whole francs the two
 * are identical. They can differ by a single franc only when 2% of the
 * principal is itself sub-centime — which no real balance in RWF is. So whole
 * amounts are held to exact equality, and awkward ones only to a bounded
 * difference: a rounding convention, never a mispricing.
 */

const WHOLE_FRANC_PRINCIPALS = ["100000", "240000", "400000", "33333", "7"];
const TERMS = [1, 2, 3, 6];

describe("24% flat a year is exactly 2% a month", () => {
  for (const principal of WHOLE_FRANC_PRINCIPALS) {
    for (const months of TERMS) {
      it(`${principal} over ${months} month(s) agrees to the franc`, () => {
        const rulebook = illustrateLoan(DEFAULT_POLICY, principal, months);
        const product = generateSchedule({
          principal,
          annualRate: "24",
          method: "FLAT",
          termMonths: months,
          frequency: "MONTHLY",
        });

        expect(product.totalInterest).toBe(rulebook.totalInterest);
        expect(product.totalPayable).toBe(rulebook.totalRepayable);
      });
    }
  }

  /**
   * The one-month case, called out on its own.
   *
   * `buildFlatSchedule` used to compute `years = divide(termMonths, 12)`
   * first, and `divide` quantizes to two places — so one month was priced on
   * 0.08 of a year instead of 0.0833…, undercharging every single-month flat
   * loan by 4%. On 400,000 that was 7,680 instead of 8,000.
   */
  it("prices a one-month loan on a twelfth of a year, not on 0.08", () => {
    const product = generateSchedule({
      principal: "400000",
      annualRate: "24",
      method: "FLAT",
      termMonths: 1,
      frequency: "MONTHLY",
    });

    expect(product.totalInterest).toBe("8000.00");
  });

  it("stays within a franc when 2% of the principal is sub-centime", () => {
    for (const months of TERMS) {
      const rulebook = illustrateLoan(DEFAULT_POLICY, "1000.33", months);
      const product = generateSchedule({
        principal: "1000.33",
        annualRate: "24",
        method: "FLAT",
        termMonths: months,
        frequency: "MONTHLY",
      });

      const drift = abs(subtract(product.totalInterest, rulebook.totalInterest));
      expect(drift.lessThanOrEqualTo(1), `${months} month(s)`).toBe(true);
    }
  });
});
