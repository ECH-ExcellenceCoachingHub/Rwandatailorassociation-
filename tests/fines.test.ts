import { describe, expect, it } from "vitest";
import { mergeFines, type FineRow } from "@/lib/services/fines";

/**
 * The fines register interleaves two tables.
 *
 * What is asserted here is the one claim that is not obvious from reading
 * `listFines`: that fetching only the first N*pageSize rows of each table is
 * enough to serve page N of the merged list correctly. Get that wrong and the
 * register does not fail loudly — it quietly omits fines from later pages, and
 * an association discovers at an audit that its own penalty record was
 * incomplete. So the property is pinned rather than trusted.
 *
 * Everything else in that service is a Prisma query, and asserting those
 * against a mock would test the mock. They belong to integration coverage, for
 * the same reason the warehouse-credit fine does.
 */

function fine(overrides: Partial<FineRow> & { reference: string; assessedAt: Date }): FineRow {
  return {
    id: overrides.reference,
    kind: "CONTRIBUTION",
    memberId: "m1",
    memberName: "Test Member",
    memberNumber: "0001",
    amount: "500.00",
    arrearsAmount: "10000.00",
    rate: "5",
    currency: "RWF",
    status: "OUTSTANDING",
    settledAt: null,
    waivedAt: null,
    waiverReason: null,
    missedDays: 3,
    daysLate: null,
    installmentNumber: null,
    creditReference: null,
    canSettle: true,
    ...overrides,
  };
}

/** A day apart each, newest first, so the merge order is unambiguous. */
function series(prefix: string, count: number, kind: FineRow["kind"]): FineRow[] {
  return Array.from({ length: count }, (_, index) =>
    fine({
      reference: `${prefix}-${String(index).padStart(3, "0")}`,
      // Descending, matching what `orderBy: { assessedAt: "desc" }` returns.
      assessedAt: new Date(2026, 0, 1, 12, 0, 0, 0 - index * 1000),
      kind,
      installmentNumber: kind === "WAREHOUSE_CREDIT" ? index + 1 : null,
    })
  );
}

describe("mergeFines", () => {
  it("returns every row, newest first", () => {
    const merged = mergeFines(
      series("C", 5, "CONTRIBUTION"),
      series("W", 3, "WAREHOUSE_CREDIT")
    );

    expect(merged).toHaveLength(8);

    for (let index = 1; index < merged.length; index += 1) {
      expect(merged[index - 1].assessedAt.getTime()).toBeGreaterThanOrEqual(
        merged[index].assessedAt.getTime()
      );
    }
  });

  it("orders ties by reference rather than leaving them to the sort", () => {
    // A nightly batch stamps every fine it raises with the same instant. Left
    // unbroken, the order between them is not guaranteed to be the same on the
    // next request — and a row that moves can be read twice or skipped while
    // paging.
    const sameInstant = new Date(2026, 0, 1, 3, 0, 0);
    const rows = [
      fine({ reference: "W-002", assessedAt: sameInstant, kind: "WAREHOUSE_CREDIT" }),
      fine({ reference: "C-001", assessedAt: sameInstant }),
      fine({ reference: "C-003", assessedAt: sameInstant }),
    ];

    expect(mergeFines(rows).map((row) => row.reference)).toEqual([
      "C-001",
      "C-003",
      "W-002",
    ]);
    // Same input in a different order must land the same way round.
    expect(mergeFines([...rows].reverse()).map((row) => row.reference)).toEqual([
      "C-001",
      "C-003",
      "W-002",
    ]);
  });

  it("serves any page from the first page*pageSize rows of each list", () => {
    // The property listFines relies on. Truncating each list the way the query
    // does must not change the page that comes out.
    const contributions = series("C", 60, "CONTRIBUTION");
    const credits = series("W", 45, "WAREHOUSE_CREDIT");
    const complete = mergeFines(contributions, credits);

    const pageSize = 10;

    for (let page = 1; page <= 10; page += 1) {
      const reach = page * pageSize;
      const start = (page - 1) * pageSize;

      const truncated = mergeFines(
        contributions.slice(0, reach),
        credits.slice(0, reach)
      ).slice(start, start + pageSize);

      expect(truncated).toEqual(complete.slice(start, start + pageSize));
    }
  });

  it("still serves the page when one list is empty", () => {
    // The type filter narrows to one table, and `reach` then over-fetches from
    // a list that is not there at all.
    const credits = series("W", 30, "WAREHOUSE_CREDIT");

    expect(mergeFines([], credits.slice(0, 20)).slice(10, 20)).toEqual(
      mergeFines([], credits).slice(10, 20)
    );
  });
});
