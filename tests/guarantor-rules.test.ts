import { describe, expect, it } from "vitest";
import { assessBorrowing, securedCeiling } from "@/lib/rules/borrowing";
import { DEFAULT_POLICY } from "@/lib/services/rulebook";

/**
 * Guarantors, as the rulebook sees them.
 *
 * Savings of 300,000 put the own share at 240,000 (80%). A request of 400,000
 * therefore goes 160,000 beyond it — the part other members must stand behind.
 */

const eligible = {
  policy: DEFAULT_POLICY,
  savingsBalance: "300000",
  membershipMonths: 8,
  associationMonths: 12,
  missedDays: 0,
  outstandingFines: "0.00",
  hasActiveLoan: false,
};

describe("guarantors cover the part above the own share", () => {
  it("needs nothing else when their pledges cover it all", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "400000",
      guaranteedAmount: "160000",
    });

    expect(result.aboveOwnShare).toBe("160000.00");
    expect(result.guaranteed).toBe("160000.00");
    expect(result.uncoveredAboveShare).toBe("0.00");
    expect(result.collateralRequired).toBe("0.00");
    expect(result.blockers).toEqual([]);
    expect(result.requestAllowed).toBe(true);
    // Allowed, but only once each guarantor accepts — said, not hidden.
    expect(result.requirements.map((r) => r.rule)).toContain("GUARANTORS_TO_ACCEPT");
  });

  it("refuses when they cover only part of it and nothing else is pledged", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "400000",
      guaranteedAmount: "100000",
    });

    expect(result.uncoveredAboveShare).toBe("60000.00");
    const blocker = result.blockers.find((b) => b.rule === "COLLATERAL");
    expect(blocker).toBeDefined();
    expect(blocker!.params.guaranteed).toBe("100000.00");
    expect(blocker!.params.uncovered).toBe("60000.00");
    expect(result.requestAllowed).toBe(false);
  });

  it("lets pledged items back what the guarantors do not", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "400000",
      guaranteedAmount: "100000",
      collateralValue: "60000",
    });

    expect(result.collateralRequired).toBe("60000.00");
    expect(result.blockers).toEqual([]);
    const toRecord = result.requirements.find((r) => r.rule === "COLLATERAL_TO_RECORD");
    expect(toRecord?.params.above).toBe("60000.00");
  });

  it("counts a pledge only up to what is needed", () => {
    const result = assessBorrowing({
      ...eligible,
      requestedAmount: "400000",
      guaranteedAmount: "500000",
    });

    expect(result.guaranteed).toBe("160000.00");
    expect(result.uncoveredAboveShare).toBe("0.00");
  });

  it("asks nothing of anyone within the own share", () => {
    const result = assessBorrowing({ ...eligible, requestedAmount: "240000" });

    expect(result.aboveOwnShare).toBe("0.00");
    expect(result.guaranteed).toBe("0.00");
    expect(result.requirements.map((r) => r.rule)).not.toContain("GUARANTORS_TO_ACCEPT");
  });
});

describe("what the committee may approve", () => {
  it("is the own share plus accepted guarantees plus items", () => {
    expect(
      securedCeiling({
        ownShareLimit: "240000.00",
        acceptedGuarantees: "100000.00",
        collateralValue: "60000.00",
        collateralRequiredAboveShare: true,
        collateralCoveragePercent: "100",
      })
    ).toBe("400000.00");
  });

  it("values items at the coverage rate", () => {
    // Items must be worth 150% of what they back, so 60,000 of items backs 40,000.
    expect(
      securedCeiling({
        ownShareLimit: "240000.00",
        acceptedGuarantees: "0.00",
        collateralValue: "60000.00",
        collateralRequiredAboveShare: true,
        collateralCoveragePercent: "150",
      })
    ).toBe("280000.00");
  });

  it("is unlimited when the rules ask for no security", () => {
    expect(
      securedCeiling({
        ownShareLimit: "240000.00",
        acceptedGuarantees: "0.00",
        collateralRequiredAboveShare: false,
        collateralCoveragePercent: "100",
      })
    ).toBeNull();
  });
});
