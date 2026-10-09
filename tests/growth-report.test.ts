import { describe, expect, it } from "vitest";
import { previousBalance, startOfToday } from "@/lib/services/growth-report";

/**
 * The growth card's one derived figure: what the association held before the
 * period opened. It is computed from the ledger rather than stored, so the
 * arithmetic — balance now, less what came in, plus what went out — has to be
 * right, including the sign.
 */

describe("previousBalance", () => {
  it("takes what is held now back to the start of the period", () => {
    // 432,650 held now, of which 61,350 came in since: 371,300 at the start.
    expect(previousBalance("432650.00", "61350.00", "0")).toBe("371300.00");
  });

  it("adds back what went out — a withdrawal reduced the balance", () => {
    // 50,000 held now, 80,000 in, 30,000 out since: 0 at the start.
    expect(previousBalance("50000.00", "80000.00", "30000.00")).toBe("0.00");
  });

  it("stays exact on figures too large for a float", () => {
    // 2^53 + 1 − 1e9: a float would round the first figure before subtracting.
    expect(
      previousBalance("9007199254740993.00", "1000000000.00", "0")
    ).toBe("9007198254740993.00");
  });

  it("can go negative — the period started in overdraft", () => {
    expect(previousBalance("1000.00", "5000.00", "0")).toBe("-4000.00");
  });
});

describe("startOfToday", () => {
  it("lands on midnight of the day in hand", () => {
    const start = startOfToday(new Date(2026, 9, 8, 14, 30));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(8);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("is the line the day-over-day comparison is drawn at", () => {
    // A balance derived from a window opening here is yesterday's closing
    // figure — the day the report compares against.
    const start = startOfToday(new Date(2026, 0, 1, 23, 59));
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});
