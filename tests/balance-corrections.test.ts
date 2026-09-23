import { describe, expect, it } from "vitest";
import { redistributeSchedule, type ScheduleRow } from "@/lib/services/balance-corrections";
import { toMoney } from "@/lib/money";

/**
 * How a hand correction to a loan's outstanding figures is spread across its
 * repayment schedule. The schedule must keep agreeing with the loan's totals,
 * or the nightly overdue job and the member's own schedule screen will show
 * figures the loan itself no longer carries.
 */

const NOW = new Date("2026-09-23T12:00:00Z");
const DAY = 86_400_000;

function row(n: number, dueOffsetDays: number, overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: `i${n}`,
    installmentNumber: n,
    dueDate: new Date(NOW.getTime() + dueOffsetDays * DAY),
    status: "UPCOMING",
    principalDue: "10000",
    interestDue: "2000",
    feesDue: "0",
    penaltyDue: "0",
    principalPaid: "0",
    interestPaid: "0",
    feesPaid: "0",
    penaltyPaid: "0",
    totalPaid: "0",
    paidAt: null,
    ...overrides,
  };
}

const zero = { principal: toMoney(0), interest: toMoney(0), fees: toMoney(0), penalty: toMoney(0) };

describe("redistributeSchedule", () => {
  it("takes a reduction off the oldest unpaid instalments first", () => {
    const rows = [
      row(1, -40, { status: "PAID", principalPaid: "10000", interestPaid: "2000", totalPaid: "12000", paidAt: NOW }),
      row(2, -10, { status: "OVERDUE" }),
      row(3, 20),
    ];

    const changes = redistributeSchedule(rows, { ...zero, interest: toMoney(-3000) }, NOW);

    // Instalment 1 is already paid, so it has no room; 2 loses all its
    // interest and 3 takes the remaining 1,000.
    expect(changes.map((c) => c.id)).toEqual(["i2", "i3"]);
    expect(changes[0]).toMatchObject({ interestDue: "0.00", totalDue: "10000.00", status: "OVERDUE" });
    expect(changes[1]).toMatchObject({ interestDue: "1000.00", totalDue: "11000.00", status: "UPCOMING" });
  });

  it("marks an instalment paid when the correction leaves nothing owed on it", () => {
    const rows = [
      row(1, -10, { status: "PARTIALLY_PAID", principalPaid: "10000", totalPaid: "10000" }),
      row(2, 20),
    ];

    const [change] = redistributeSchedule(rows, { ...zero, interest: toMoney(-2000) }, NOW);

    expect(change).toMatchObject({ id: "i1", status: "PAID", totalDue: "10000.00" });
    expect(change.paidAt).toEqual(NOW);
  });

  it("adds principal or interest to the last instalment, so the loan runs longer", () => {
    const rows = [row(1, -10, { status: "OVERDUE" }), row(2, 20), row(3, 50)];

    const changes = redistributeSchedule(rows, { ...zero, principal: toMoney(5000) }, NOW);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: "i3", principalDue: "15000.00", totalDue: "17000.00" });
  });

  it("adds a penalty to the oldest unpaid instalment, because it is owed now", () => {
    const rows = [
      row(1, -40, { status: "PAID", principalPaid: "10000", interestPaid: "2000", totalPaid: "12000", paidAt: NOW }),
      row(2, -10, { status: "OVERDUE" }),
      row(3, 20),
    ];

    const [change] = redistributeSchedule(rows, { ...zero, penalty: toMoney(1500) }, NOW);

    expect(change).toMatchObject({ id: "i2", penaltyDue: "1500.00", totalDue: "13500.00", status: "OVERDUE" });
  });

  it("reopens a paid instalment when an increase lands on it", () => {
    const rows = [
      row(1, -40, { status: "PAID", principalPaid: "10000", interestPaid: "2000", totalPaid: "12000", paidAt: NOW }),
    ];

    const [change] = redistributeSchedule(rows, { ...zero, interest: toMoney(500) }, NOW);

    // Past due, so it is overdue again rather than merely partly paid.
    expect(change).toMatchObject({ status: "OVERDUE", totalDue: "12500.00", paidAt: null });
  });

  it("leaves waived instalments untouched", () => {
    const rows = [row(1, -10, { status: "WAIVED" }), row(2, 20)];

    const changes = redistributeSchedule(rows, { ...zero, principal: toMoney(-4000) }, NOW);

    expect(changes.map((c) => c.id)).toEqual(["i2"]);
    expect(changes[0].principalDue).toBe("6000.00");
  });
});
