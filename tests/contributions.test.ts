import { describe, expect, it } from "vitest";
import {
  computeStanding,
  dayIndexIn,
  type StandingInputs,
} from "@/lib/services/contributions";
import { DEFAULT_POLICY, type AssociationPolicy } from "@/lib/services/rulebook";
import { splitInterest } from "@/lib/services/interest-sharing";
import {
  assessBorrowing,
  illustrateLoan,
  wholeMonthsBetween,
} from "@/lib/rules/borrowing";

/**
 * THE RULES, PROVED.
 *
 * Everything tested here decides what a member owes or may borrow, and every
 * one of these figures ends up on a screen the member is expected to accept.
 * The parts worth proving are the ones where being slightly wrong is invisible
 * until somebody is charged for it:
 *
 *   • how a lump-sum payment turns into days covered — the whole arrears model
 *     rests on it, and getting it wrong accuses a paid-up member of arrears;
 *   • when a repeat fine is and is not due — the failure mode is fining
 *     somebody every night for a fortnight;
 *   • that the two halves of the interest sum back to the interest collected;
 *   • that the borrowing limit and its illustration agree with the rule as it
 *     was written down.
 *
 * The database is deliberately absent. Every function below is pure, which is
 * why it can be tested this way — and it is pure precisely so that it can be.
 */

const TZ = "Africa/Kigali";

/** Midday, so a timezone slip of a couple of hours cannot change the day. */
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** RTA's own rules: 1,000 + 50 a day per share, 7% after 7 days, 2% a month split 1/1. */
const POLICY: AssociationPolicy = DEFAULT_POLICY;

function standing(overrides: Partial<StandingInputs> = {}) {
  const input: StandingInputs = {
    policy: POLICY,
    timeZone: TZ,
    obligationStart: at("2026-01-01"),
    asOf: at("2026-01-10"),
    totalContributed: "0",
    feeChargedThroughDay: 0,
    priorFines: [],
    outstandingFineAmount: "0.00",
    isExempt: false,
    ...overrides,
  };
  return computeStanding(input);
}

describe("the daily contribution", () => {
    it("multiplies both the daily saving and the service fee by the member's shares", () => {
      const result = standing({
        obligationStart: at("2026-01-01"),
        asOf: at("2026-01-01"),
        shares: 5,
      });

      expect(result.dailySavings).toBe("5000.00");
      expect(result.dailyFee).toBe("250.00");
      expect(result.dailyTotal).toBe("5250.00");
      expect(result.arrearsTotal).toBe("5250.00");
    });

    it("counts a member with no shares recorded as holding one", () => {
      expect(standing({ shares: undefined }).dailyTotal).toBe("1050.00");
    });

    it("covers days at the member's own daily total", () => {
      // Five shares cost 5,250 a day, so 15,150 buys two days — not three.
      const result = standing({
        obligationStart: at("2026-01-01"),
        asOf: at("2026-01-03"),
        totalContributed: "15150",
        shares: 5,
      });

      expect(result.coveredDays).toBe(2);
      expect(result.missedDays).toBe(1);
    });

  it("counts the first day as owed", () => {
    const result = standing({
      obligationStart: at("2026-01-01"),
      asOf: at("2026-01-01"),
    });

    expect(result.dueDays).toBe(1);
    expect(result.missedDays).toBe(1);
    expect(result.arrearsTotal).toBe("1050.00");
  });

  it("treats a member who has paid every day as up to date", () => {
    // Ten days at 1,050.
    const result = standing({
      asOf: at("2026-01-10"),
      totalContributed: "10500",
    });

    expect(result.dueDays).toBe(10);
    expect(result.coveredDays).toBe(10);
    expect(result.missedDays).toBe(0);
    expect(result.status).toBe("CURRENT");
    expect(result.arrearsTotal).toBe("0.00");
  });

  // The case the whole design exists for: a tailor pays a week at a time.
  it("credits a lump sum as the days it buys", () => {
    const result = standing({
      asOf: at("2026-01-07"),
      totalContributed: "7350",
    });

    expect(result.coveredDays).toBe(7);
    expect(result.missedDays).toBe(0);
  });

  it("ignores a part-day: money that does not buy a whole day buys none", () => {
    // 7,000 is six full days plus 700 — not enough for the seventh.
    const result = standing({
      asOf: at("2026-01-07"),
      totalContributed: "7000",
    });

    expect(result.coveredDays).toBe(6);
    expect(result.missedDays).toBe(1);
  });

  it("splits arrears into the savings and the service fee", () => {
    const result = standing({
      asOf: at("2026-01-05"),
      totalContributed: "0",
    });

    expect(result.missedDays).toBe(5);
    expect(result.arrearsSavings).toBe("5000.00");
    expect(result.arrearsFee).toBe("250.00");
    expect(result.arrearsTotal).toBe("5250.00");
  });

  it("owes nothing before the obligation starts", () => {
    const result = standing({
      obligationStart: at("2026-03-01"),
      asOf: at("2026-01-10"),
    });

    expect(result.dueDays).toBe(0);
    expect(result.missedDays).toBe(0);
    expect(result.status).toBe("CURRENT");
  });

  it("counts nobody as behind while an exemption holds", () => {
    const result = standing({ asOf: at("2026-02-01"), isExempt: true });

    expect(result.status).toBe("EXEMPT");
    expect(result.fineDue).toBeNull();
    expect(result.feeDaysOwed).toBe(0);
  });
});

describe("warning before the fine", () => {
  it("is current with nothing missed", () => {
    expect(standing({ asOf: at("2026-01-03"), totalContributed: "3150" }).status).toBe(
      "CURRENT"
    );
  });

  it("is behind, but not yet warned, early in the grace period", () => {
    // Four days missed, grace of seven, lead time of two: still three days of
    // warning-free room.
    const result = standing({ asOf: at("2026-01-04") });
    expect(result.missedDays).toBe(4);
    expect(result.daysUntilFine).toBe(3);
    expect(result.status).toBe("BEHIND");
  });

  it("is at risk once the fine is within the reminder lead time", () => {
    const result = standing({ asOf: at("2026-01-06") });
    expect(result.missedDays).toBe(6);
    expect(result.daysUntilFine).toBe(1);
    expect(result.status).toBe("AT_RISK");
  });

  it("names the exact figure that clears everything", () => {
    const result = standing({
      asOf: at("2026-01-06"),
      outstandingFineAmount: "350.00",
    });

    // Six days of 1,050, plus a fine already owed.
    expect(result.arrearsTotal).toBe("6300.00");
    expect(result.clearingAmount).toBe("6650.00");
  });
});

describe("assessing the fine", () => {
  it("does not fine inside the grace period", () => {
    expect(standing({ asOf: at("2026-01-06") }).fineDue).toBeNull();
  });

  it("fines 7% of the unpaid savings on the seventh missed day", () => {
    const result = standing({ asOf: at("2026-01-07") });

    expect(result.missedDays).toBe(7);
    expect(result.status).toBe("FINABLE");
    // Seven days of 1,000 unpaid savings; 7% of 7,000. The service fee is NOT
    // in the base — a member is fined for what they did not save, not for a
    // service they did not receive.
    expect(result.fineDue).toMatchObject({
      arrearsAmount: "7000.00",
      rate: "7.0000",
      amount: "490.00",
    });
  });

  // The four cases from the doc comment on resolveFineDue, in order.
  describe("and not fining the same arrears twice", () => {
    const start = at("2026-01-01");

    it("fines the first time the grace period is passed", () => {
      const result = standing({
        obligationStart: start,
        asOf: at("2026-01-24"),
        totalContributed: "10500", // 10 days covered
      });

      expect(result.missedDays).toBe(14);
      expect(result.fineDue?.dueDayIndex).toBe(24);
    });

    it("does not fine again the next night", () => {
      const result = standing({
        obligationStart: start,
        asOf: at("2026-01-25"),
        totalContributed: "10500",
        priorFines: [{ missedDays: 14, dueDayIndex: 24 }],
      });

      expect(result.missedDays).toBe(15);
      expect(result.fineDue).toBeNull();
    });

    it("does not fine again when the member pays something but stays behind", () => {
      const result = standing({
        obligationStart: start,
        asOf: at("2026-01-25"),
        totalContributed: "15750", // 15 days covered
        priorFines: [{ missedDays: 14, dueDayIndex: 24 }],
      });

      expect(result.missedDays).toBe(10);
      expect(result.fineDue).toBeNull();
    });

    it("fines again after another full stretch of missed days", () => {
      const result = standing({
        obligationStart: start,
        asOf: at("2026-02-05"), // day 36
        totalContributed: "15750", // 15 days covered
        priorFines: [{ missedDays: 14, dueDayIndex: 24 }],
      });

      expect(result.missedDays).toBe(21);
      expect(result.fineDue?.missedDays).toBe(21);
    });

    it("starts afresh once the member has caught up past the old fine", () => {
      const result = standing({
        obligationStart: start,
        asOf: at("2026-02-13"), // day 44
        totalContributed: "37800", // 36 days covered — past the old fine's day
        priorFines: [
          { missedDays: 14, dueDayIndex: 24 },
          { missedDays: 21, dueDayIndex: 36 },
        ],
      });

      expect(result.missedDays).toBe(8);
      // Eight missed days clears the plain grace period again.
      expect(result.fineDue?.missedDays).toBe(8);
    });
  });

  it("never mints a fine of zero when the rate is zero", () => {
    const free: AssociationPolicy = { ...POLICY, penaltyRate: "0.0000" };
    const result = standing({ policy: free, asOf: at("2026-02-01") });

    expect(result.missedDays).toBeGreaterThan(POLICY.graceDays);
    expect(result.fineDue).toBeNull();
  });
});

describe("the platform service fee", () => {
  it("is owed for days paid for, never for days missed", () => {
    // Twenty days have passed; the member has paid for five.
    const result = standing({
      asOf: at("2026-01-20"),
      totalContributed: "5250",
    });

    expect(result.missedDays).toBe(15);
    expect(result.feeDaysOwed).toBe(5);
    expect(result.feeAmountOwed).toBe("250.00");
  });

  it("charges nothing again for days already charged", () => {
    const result = standing({
      asOf: at("2026-01-10"),
      totalContributed: "10500",
      feeChargedThroughDay: 10,
    });

    expect(result.feeDaysOwed).toBe(0);
    expect(result.feeAmountOwed).toBe("0.00");
  });

  it("charges only the new days after a partial run", () => {
    const result = standing({
      asOf: at("2026-01-10"),
      totalContributed: "10500",
      feeChargedThroughDay: 6,
    });

    expect(result.feeDaysOwed).toBe(4);
    expect(result.feeAmountOwed).toBe("200.00");
  });
});

describe("counting days in the association's own timezone", () => {
  it("treats a late-evening Kigali payment as that day, not the next", () => {
    // 22:30 in Kigali on 4 September is 20:30 UTC the same day; an hour later
    // it is still the 4th locally but the 5th nowhere. The case that bites is
    // the reverse — 23:30 local is 21:30 UTC, same date — so assert the pair
    // that a naive UTC truncation gets wrong.
    const lateLocal = new Date("2026-09-04T21:30:00.000Z"); // 23:30 Kigali
    const earlyNext = new Date("2026-09-04T22:30:00.000Z"); // 00:30 Kigali, 5th

    expect(dayIndexIn(TZ, lateLocal)).toBe(dayIndexIn(TZ, at("2026-09-04")));
    expect(dayIndexIn(TZ, earlyNext)).toBe(dayIndexIn(TZ, at("2026-09-05")));
  });

  it("falls back rather than throwing on an unusable timezone", () => {
    expect(() => dayIndexIn("Not/AZone", at("2026-01-01"))).not.toThrow();
  });
});

describe("splitting the interest a borrower pays", () => {
  it("gives the member half under the 1-and-1 rule", () => {
    const split = splitInterest(POLICY, "12000");

    expect(split.memberShare).toBe("6000.00");
    expect(split.associationShare).toBe("6000.00");
  });

  // The reason the association's share is a subtraction and not a second
  // percentage: two roundings of the same halving invent money.
  it("always sums back to exactly what was collected", () => {
    for (const amount of ["0.01", "1.00", "833.33", "1666.67", "99999.99"]) {
      const split = splitInterest(POLICY, amount);
      const sum = (
        Number(split.memberShare) + Number(split.associationShare)
      ).toFixed(2);
      expect(sum).toBe(Number(amount).toFixed(2));
    }
  });

  it("honours an uneven split", () => {
    const uneven: AssociationPolicy = {
      ...POLICY,
      interestMemberPoints: "0.5000",
      interestAssociationPoints: "1.5000",
    };

    const split = splitInterest(uneven, "12000");
    expect(split.memberShare).toBe("3000.00");
    expect(split.associationShare).toBe("9000.00");
  });

  it("gives the association everything when nothing is shared", () => {
    const none: AssociationPolicy = {
      ...POLICY,
      interestMemberPoints: "0.0000",
      interestAssociationPoints: "0.0000",
    };

    const split = splitInterest(none, "12000");
    expect(split.memberShare).toBe("0.00");
    expect(split.associationShare).toBe("12000.00");
  });
});

describe("what a member may borrow", () => {
  const eligible = {
    policy: POLICY,
    savingsBalance: "300000",
    membershipMonths: 8,
    associationMonths: 12,
    missedDays: 0,
    outstandingFines: "0.00",
    hasActiveLoan: false,
  };

  it("allows 80% of a member's own savings with nothing pledged", () => {
    const result = assessBorrowing({ ...eligible, requestedAmount: "240000" });

    expect(result.ownShareLimit).toBe("240000.00");
    expect(result.aboveOwnShare).toBe("0.00");
    expect(result.collateralRequired).toBe("0.00");
    expect(result.blockers).toEqual([]);
    expect(result.requestAllowed).toBe(true);
  });

  it("requires collateral for the part above that share", () => {
    const result = assessBorrowing({ ...eligible, requestedAmount: "400000" });

    expect(result.aboveOwnShare).toBe("160000.00");
    expect(result.collateralRequired).toBe("160000.00");
    expect(result.collateralSatisfied).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toContain("COLLATERAL");
  });

  it("allows it once enough has been pledged", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "400000",
      collateralValue: "160000",
    });

    expect(result.collateralShortfall).toBe("0.00");
    expect(result.blockers).toEqual([]);
    // Still a requirement, not a refusal: the committee must record what was
    // pledged, and the member is told so rather than blocked by it.
    expect(result.requirements.map((r) => r.rule)).toContain("COLLATERAL_TO_RECORD");
  });

  it("holds lending closed until the association has saved long enough", () => {
    const result = assessBorrowing({ ...eligible, associationMonths: 3 });

    expect(result.monthsUntilLendingOpens).toBe(3);
    expect(result.blockers.map((b) => b.rule)).toContain("LENDING_NOT_OPEN");
  });

  it("makes a new member wait their six months", () => {
    const result = assessBorrowing({ ...eligible, membershipMonths: 2 });

    expect(result.monthsUntilMemberEligible).toBe(4);
    expect(result.blockers.map((b) => b.rule)).toContain("MEMBERSHIP_TOO_SHORT");
  });

  it("refuses a member who is behind, and says what would fix it", () => {
    const result = assessBorrowing({ ...eligible, missedDays: 3 });

    const blocker = result.blockers.find((b) => b.rule === "IN_ARREARS");
    expect(blocker?.message).toContain("3 day");
    expect(result.canBorrow).toBe(false);
  });

  it("refuses a member with an unpaid fine", () => {
    const result = assessBorrowing({ ...eligible, outstandingFines: "490.00" });
    expect(result.blockers.map((b) => b.rule)).toContain("FINE_OUTSTANDING");
  });

  it("refuses a term beyond the six-month limit", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "100000",
      termMonths: 12,
    });

    expect(result.blockers.map((b) => b.rule)).toContain("TERM_TOO_LONG");
  });
});

describe("what a loan costs", () => {
  it("works out 2% a month over six months, flat", () => {
    const quote = illustrateLoan(POLICY, "100000", 6);

    expect(quote.monthlyInterest).toBe("2000.00");
    expect(quote.totalInterest).toBe("12000.00");
    expect(quote.totalRepayable).toBe("112000.00");
    // Six equal instalments of principal plus interest.
    expect(quote.monthlyInstalment).toBe("18666.67");
  });

  it("shows the half that comes back, and the real net cost", () => {
    const quote = illustrateLoan(POLICY, "100000", 6);

    expect(quote.memberShareOfInterest).toBe("6000.00");
    expect(quote.associationShareOfInterest).toBe("6000.00");
    // What the loan actually cost: 12,000 charged, 6,000 returned.
    expect(quote.netCostToMember).toBe("6000.00");
  });

  it("never quotes a term longer than the rules allow", () => {
    expect(illustrateLoan(POLICY, "100000", 24).termMonths).toBe(6);
  });
});

describe("counting membership in whole months", () => {
  it("credits the anniversary day itself", () => {
    expect(
      wholeMonthsBetween(new Date(2026, 2, 4), new Date(2026, 8, 4))
    ).toBe(6);
  });

  it("does not credit the day before", () => {
    expect(
      wholeMonthsBetween(new Date(2026, 2, 4), new Date(2026, 8, 3))
    ).toBe(5);
  });

  // Somebody who joined on the 31st must not be held back by February.
  it("credits a month-end joiner at the end of a shorter month", () => {
    expect(
      wholeMonthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 28))
    ).toBe(1);
  });

  it("never returns a negative", () => {
    expect(
      wholeMonthsBetween(new Date(2026, 8, 4), new Date(2026, 2, 4))
    ).toBe(0);
  });
});
