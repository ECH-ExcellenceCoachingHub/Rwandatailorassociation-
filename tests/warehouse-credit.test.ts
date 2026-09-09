import { describe, expect, it } from "vitest";
import { addMonthsClamped, quoteCredit } from "@/lib/services/warehouse-credit";
import { DEFAULT_POLICY, type AssociationPolicy } from "@/lib/services/rulebook";
import { Decimal, toMoney } from "@/lib/money";

/**
 * Warehouse credit arithmetic.
 *
 * The properties asserted here are the ones whose absence produces a member
 * chased for four francs the system cannot clear, or a fine that nobody can
 * explain. They exercise the shipped code unmodified, so a failure is a defect
 * in the feature rather than in the test.
 *
 * The FINE is not tested here: it needs a database, because its whole point is
 * that a unique index — not this code — is what stops a member being fined
 * twice for one month. Asserting it against a mock would test the mock.
 */

const sum = (values: string[]) =>
  values.reduce((total, v) => total.plus(toMoney(v)), new Decimal(0)).toFixed(2);

/**
 * A due date is a LOCAL day — the day the member is told to pay, not an
 * instant. `new Date("2026-01-15")` would parse as UTC midnight, which is a
 * different calendar day in most timezones and the wrong thing to assert on,
 * so dates are built and read locally throughout.
 */
const localDate = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

/** The association's own rules: 2% once, three months, 7% for a missed month. */
const policy = DEFAULT_POLICY;

function withPolicy(overrides: Partial<AssociationPolicy>): AssociationPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

describe("the rulebook defaults", () => {
  it("carries the terms the association actually agreed", () => {
    expect(policy.warehouseCreditInterest).toBe("2.0000");
    expect(policy.warehouseCreditTermMonths).toBe(3);
    expect(policy.warehouseCreditFineRate).toBe("7.0000");
  });
});

describe("quoteCredit", () => {
  it("charges 2% once, not once a month", () => {
    const quote = quoteCredit(policy, "200000.00", localDate(2026, 1, 15));

    // 2% of 200,000 is 4,000 for the WHOLE term. Charged monthly it would be
    // 12,000, which is the mistake this assertion exists to catch.
    expect(quote.interestAmount).toBe("4000.00");
    expect(quote.totalPayable).toBe("204000.00");
  });

  it("splits the total into three instalments that sum to it exactly", () => {
    const quote = quoteCredit(policy, "200000.00", localDate(2026, 1, 15));

    expect(quote.schedule).toHaveLength(3);
    expect(sum(quote.schedule.map((row) => row.totalDue))).toBe("204000.00");
    expect(sum(quote.schedule.map((row) => row.principalDue))).toBe("200000.00");
    expect(sum(quote.schedule.map((row) => row.interestDue))).toBe("4000.00");
  });

  it("amortises the goods value to exactly zero", () => {
    // 100,000 over three months does not divide evenly: 33,333.33 × 3 leaves a
    // cent unaccounted for, and a balance of 0.01 is a credit that can never
    // be closed.
    const quote = quoteCredit(policy, "100000.00", localDate(2026, 3, 31));

    expect(sum(quote.schedule.map((row) => row.principalDue))).toBe("100000.00");
    expect(quote.schedule[quote.schedule.length - 1].balanceAfter).toBe("0.00");
  });

  it("never leaves a rounding tail on an awkward value", () => {
    for (const value of ["1.00", "0.01", "10.00", "99999.99", "12345.67"]) {
      const quote = quoteCredit(policy, value, localDate(2026, 1, 1));
      expect(sum(quote.schedule.map((row) => row.principalDue))).toBe(
        toMoney(value).toFixed(2)
      );
      expect(quote.schedule[quote.schedule.length - 1].balanceAfter).toBe("0.00");
      expect(sum(quote.schedule.map((row) => row.totalDue))).toBe(
        quote.totalPayable
      );
    }
  });

  it("falls due monthly, starting one month after the goods are taken", () => {
    const quote = quoteCredit(policy, "90000.00", localDate(2026, 1, 15));

    expect(quote.schedule.map((row) => ymd(row.dueDate))).toEqual(
      ["2026-02-15", "2026-03-15", "2026-04-15"]
    );
    expect(ymd(quote.firstDueDate)).toBe("2026-02-15");
    expect(ymd(quote.maturityDate)).toBe("2026-04-15");
  });

  it("freezes the fine rate onto the quote", () => {
    const quote = quoteCredit(policy, "50000.00");
    expect(quote.fineRate).toBe("7.0000");
  });

  it("honours an association that has retuned its own rules", () => {
    const quote = quoteCredit(
      withPolicy({
        warehouseCreditInterest: "5.0000",
        warehouseCreditTermMonths: 4,
      }),
      "100000.00",
      localDate(2026, 1, 10)
    );

    expect(quote.interestAmount).toBe("5000.00");
    expect(quote.schedule).toHaveLength(4);
    expect(sum(quote.schedule.map((row) => row.totalDue))).toBe("105000.00");
  });

  it("survives a term of one month rather than dividing by zero", () => {
    const quote = quoteCredit(
      withPolicy({ warehouseCreditTermMonths: 1 }),
      "60000.00",
      localDate(2026, 5, 5)
    );

    expect(quote.schedule).toHaveLength(1);
    expect(quote.schedule[0].totalDue).toBe("61200.00");
    expect(quote.schedule[0].balanceAfter).toBe("0.00");
  });

  it("charges nothing extra when the association charges no interest", () => {
    const quote = quoteCredit(
      withPolicy({ warehouseCreditInterest: "0.0000" }),
      "75000.00"
    );

    expect(quote.interestAmount).toBe("0.00");
    expect(quote.totalPayable).toBe("75000.00");
    expect(sum(quote.schedule.map((row) => row.interestDue))).toBe("0.00");
  });
});

describe("addMonthsClamped", () => {
  it("keeps the same day of the month", () => {
    expect(ymd(addMonthsClamped(localDate(2026, 1, 15), 1))).toBe(
      "2026-02-15"
    );
  });

  it("clamps to the end of a shorter month rather than rolling into the next", () => {
    // 31 January + 1 month is 28 February, not 3 March. Rolling would hand the
    // member three extra days of credit and put the fine on the wrong month.
    expect(ymd(addMonthsClamped(localDate(2026, 1, 31), 1))).toBe(
      "2026-02-28"
    );
    expect(ymd(addMonthsClamped(localDate(2026, 1, 31), 3))).toBe(
      "2026-04-30"
    );
  });

  it("handles a leap year", () => {
    expect(ymd(addMonthsClamped(localDate(2028, 1, 31), 1))).toBe(
      "2028-02-29"
    );
  });

  it("crosses a year boundary", () => {
    expect(ymd(addMonthsClamped(localDate(2026, 11, 30), 3))).toBe(
      "2027-02-28"
    );
  });
});

describe("what a missed month costs", () => {
  /**
   * The fine is 7% of what is STILL UNPAID on that month, not of the whole
   * credit. These are the figures quoted in the member-facing rule, so if the
   * rate ever changes the rule text and this test fail together.
   */
  const fineOn = (arrears: string, rate: string) =>
    toMoney(arrears).times(toMoney(rate).dividedBy(100)).toFixed(2);

  it("fines a wholly missed month on the whole month", () => {
    const quote = quoteCredit(policy, "200000.00", localDate(2026, 1, 15));
    const month = quote.schedule[0];

    // 204,000 over three months is 68,000 a month, give or take the cent the
    // even split cannot place — the first instalment carries the remainder of
    // both the goods value and the interest, so it reads 68,000.01. That is
    // the price of every column summing exactly, and it is invisible at the
    // scale RWF is quoted in.
    expect(Number(month.totalDue)).toBeCloseTo(68000, 1);

    // The figure the rule quotes: 7% of a wholly missed month is 4,760.
    expect(fineOn(month.totalDue, policy.warehouseCreditFineRate)).toBe("4760.00");
  });

  it("fines a part-paid month only on the part left unpaid", () => {
    // 48,000 of the 68,000 paid late leaves 20,000, and 7% of that is 1,400 —
    // the second example in the rule. A fine on the whole instalment would be
    // 4,760 and would punish the member for the part they did pay.
    expect(fineOn("20000.00", policy.warehouseCreditFineRate)).toBe("1400.00");
  });
});
