import { describe, expect, it } from "vitest";
import { splitByWeight } from "@/lib/services/pool-deductions";

/**
 * Dividing a deduction from the members' pool. The one property that matters
 * above all is that the parts add back up to exactly what was taken.
 */

const sum = (parts: { toString(): string }[]) =>
  parts.reduce((total, p) => total + Number(p.toString()), 0);

describe("splitByWeight", () => {
  it("splits in proportion to the weights", () => {
    const parts = splitByWeight("1000", ["100", "300"]);
    expect(parts.map(String)).toEqual(["250", "750"]);
  });

  it("works in whole francs when the total is whole, and still sums exactly", () => {
    const parts = splitByWeight("1000", [1, 1, 1]);
    expect(parts.map(String)).toEqual(["334", "333", "333"]);
    expect(sum(parts)).toBe(1000);
  });

  it("gives leftover units to the largest remainders, not just the first entries", () => {
    // Exact shares are 142.86, 285.71 and 571.43 — the remainders rank the
    // first (0.86) and second (0.71) above the third (0.43).
    const parts = splitByWeight("1000", [1, 2, 4]);
    expect(parts.map(String)).toEqual(["143", "286", "571"]);
    expect(sum(parts)).toBe(1000);
  });

  it("works in cents when the total has cents", () => {
    const parts = splitByWeight("100.01", [1, 1]);
    expect(parts.map((p) => p.toFixed(2))).toEqual(["50.01", "50.00"]);
  });

  it("gives nothing to a zero weight", () => {
    const parts = splitByWeight("500", [0, 5, 0]);
    expect(parts.map(String)).toEqual(["0", "500", "0"]);
  });

  it("returns zeros rather than dividing by zero when every weight is zero", () => {
    expect(splitByWeight("500", [0, 0]).map(String)).toEqual(["0", "0"]);
  });

  it("always sums exactly across awkward weights", () => {
    const weights = [17, 3, 101, 44, 9, 1, 250];
    for (const total of ["99999", "12345.67", "7"]) {
      const parts = splitByWeight(total, weights);
      expect(sum(parts)).toBeCloseTo(Number(total), 2);
    }
  });
});
