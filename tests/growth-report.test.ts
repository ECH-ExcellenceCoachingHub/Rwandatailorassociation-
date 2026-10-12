import { describe, expect, it } from "vitest";
import {
  districtsWithSavings,
  growthRows,
  growthTotals,
  previousBalance,
  startOfToday,
} from "@/lib/services/growth-report";
import type { DistrictRow } from "@/lib/services/district-report";

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

/**
 * The shared image is counted differently from the district table it sits
 * above: only the members who have saved appear on it, and a district that
 * holds no savings has no row. The register itself is untouched by any of
 * this — these assertions guard the cut, not the ledger.
 */

/** A district table row with only the fields the card reads set. */
function districtRow(overrides: Partial<DistrictRow>): DistrictRow {
  return {
    district: null,
    recognised: false,
    province: null,
    members: 0,
    active: 0,
    savers: 0,
    nonSavers: 0,
    savings: "0.00",
    feesDeducted: "0.00",
    averageSavings: "0.00",
    memberRows: [],
    ...overrides,
  };
}

describe("districtsWithSavings", () => {
  it("keeps every district that holds savings", () => {
    const rows = [
      districtRow({ district: "Kicukiro", province: "Kigali", savings: "150000.00" }),
      districtRow({ district: "Musanze", province: "North", savings: "2400.00" }),
    ];
    expect(districtsWithSavings(rows).map((r) => r.district)).toEqual([
      "Kicukiro",
      "Musanze",
    ]);
  });

  it("leaves out a district whose members have saved nothing", () => {
    const rows = [
      districtRow({ district: "Kicukiro", province: "Kigali", savings: "150000.00" }),
      districtRow({ district: "Nyamasheke", province: "West", savings: "0.00", members: 20 }),
    ];
    expect(districtsWithSavings(rows).map((r) => r.district)).toEqual(["Kicukiro"]);
  });

  it("leaves out a district that saved and then withdrew it all", () => {
    // Four members there have paid savings in at least once — they are savers
    // on the register — but nothing is held, so the card has no row for them.
    const rows = [
      districtRow({ district: "Ruhango", province: "South", savings: "0.00", savers: 4 }),
    ];
    expect(districtsWithSavings(rows)).toEqual([]);
  });
});

describe("growthRows", () => {
  it("ranks the districts that have saved, highest first", () => {
    const rows = growthRows([
      districtRow({
        district: "Nyagatare",
        province: "East",
        savers: 9,
        savings: "3000.00",
      }),
      districtRow({
        district: "Kicukiro",
        province: "Kigali",
        savers: 12,
        savings: "120000.00",
      }),
      districtRow({
        district: "Nyanza",
        province: "South",
        savers: 3,
        savings: "800.00",
      }),
    ]);
    expect(rows.map((r) => r.district)).toEqual(["Kicukiro", "Nyagatare", "Nyanza"]);
  });

  it("carries who saved and what is held — never the register's headcount", () => {
    const [row] = growthRows([
      districtRow({
        district: "Gasabo",
        province: "Kigali",
        members: 40,
        savers: 6,
        nonSavers: 34,
        savings: "5000.00",
      }),
    ]);
    expect(row).toEqual({
      district: "Gasabo",
      province: "Kigali",
      savers: 6,
      savings: "5000.00",
    });
  });

  it("still shows members who saved without a district on file", () => {
    const rows = growthRows([
      districtRow({ district: null, savers: 2, savings: "700.00" }),
      districtRow({ district: "Rwamagana", province: "East", savers: 1, savings: "0.00" }),
    ]);
    expect(rows).toEqual([
      { district: null, province: null, savers: 2, savings: "700.00" },
    ]);
  });

  it("breaks a tie in savings by how many saved", () => {
    const rows = growthRows([
      districtRow({ district: "Gakenke", province: "North", savers: 4, savings: "1000.00" }),
      districtRow({
        district: "Ngororero",
        province: "West",
        savers: 11,
        savings: "1000.00",
      }),
    ]);
    expect(rows.map((r) => r.district)).toEqual(["Ngororero", "Gakenke"]);
  });
});

describe("growthTotals", () => {
  it("adds up the rows the card shows", () => {
    const totals = growthTotals([
      { district: "Kicukiro", province: "Kigali", savers: 12, savings: "120000.00" },
      { district: "Gasabo", province: "Kigali", savers: 6, savings: "50000.00" },
    ]);
    expect(totals).toEqual({ districts: 2, savers: 18, savings: "170000.00" });
  });

  it("counts districts, not a row with no district on file", () => {
    const totals = growthTotals([
      { district: null, province: null, savers: 2, savings: "700.00" },
      { district: "Kicukiro", province: "Kigali", savers: 4, savings: "300.00" },
    ]);
    expect(totals.districts).toBe(1);
  });

  it("is all zeroes when nothing has been saved", () => {
    expect(growthTotals([])).toEqual({ districts: 0, savers: 0, savings: "0.00" });
  });
});
