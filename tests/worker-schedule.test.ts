import { describe, expect, it } from "vitest";
import { dailyCron, lastDailySlot } from "@/worker/schedule";

/**
 * The worker decides a nightly run was missed by comparing its last success
 * against the most recent slot. Get the slot a day wrong and it either re-runs
 * the fine sweep every quarter hour or never notices that one was skipped.
 *
 * Dates are built from local-time parts because the slot is local time — the
 * clock node-cron schedules on — so these hold in any timezone.
 */
describe("lastDailySlot", () => {
  const slot = { hour: 1, minute: 30 };

  it("is today's slot once it has passed", () => {
    expect(lastDailySlot(slot, new Date(2026, 8, 11, 14, 0))).toEqual(
      new Date(2026, 8, 11, 1, 30)
    );
  });

  it("is yesterday's slot while today's has not come round", () => {
    expect(lastDailySlot(slot, new Date(2026, 8, 11, 1, 29))).toEqual(
      new Date(2026, 8, 10, 1, 30)
    );
  });

  it("counts the slot's own minute as come round", () => {
    expect(lastDailySlot(slot, new Date(2026, 8, 11, 1, 30))).toEqual(
      new Date(2026, 8, 11, 1, 30)
    );
  });

  it("steps back across a month end", () => {
    expect(lastDailySlot(slot, new Date(2026, 9, 1, 0, 15))).toEqual(
      new Date(2026, 8, 30, 1, 30)
    );
  });
});

describe("dailyCron", () => {
  it("puts the minute before the hour", () => {
    expect(dailyCron({ hour: 1, minute: 30 })).toBe("30 1 * * *");
  });
});
