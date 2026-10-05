import { describe, expect, it } from "vitest";
import {
  backupKey,
  dueTiers,
  expiredKeys,
  isoWeek,
  parseBackupTime,
} from "@/lib/backup/schedule";

/**
 * Which tiers a night's backup is filed under, and which old ones are deleted.
 * Get "due" wrong and a week can pass with no weekly; get "expired" wrong and
 * the only copy from before a bad change is deleted the night it was needed.
 */

const at = (iso: string) => new Date(iso);

describe("backup keys", () => {
  it("round-trips the time through the key", () => {
    const when = at("2026-10-05T03:30:07Z");
    expect(backupKey("weekly", when)).toBe("weekly/rta-backup-20261005T033007Z.rtabak");
    expect(parseBackupTime(backupKey("weekly", when))).toEqual(when);
  });

  it("ignores files that are not backups", () => {
    expect(parseBackupTime("daily/notes.txt")).toBeNull();
    expect(parseBackupTime("daily/rta-backup-20261005T033007Z.rtabak.partial")).toBeNull();
  });
});

describe("isoWeek", () => {
  it("puts the first days of January in the previous year's last week when ISO says so", () => {
    expect(isoWeek(at("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(at("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  it("starts weeks on Monday", () => {
    expect(isoWeek(at("2026-10-04T23:59:59Z"))).toBe("2026-W40"); // Sunday
    expect(isoWeek(at("2026-10-05T00:00:00Z"))).toBe("2026-W41"); // Monday
  });
});

describe("dueTiers", () => {
  const now = at("2026-10-07T03:30:00Z"); // Wednesday

  it("files the first backup ever in every tier", () => {
    expect(dueTiers({ weekly: [], monthly: [] }, now)).toEqual(["daily", "weekly", "monthly"]);
  });

  it("is daily only once this week and month are covered", () => {
    const monday = backupKey("weekly", at("2026-10-05T03:30:00Z"));
    const first = backupKey("monthly", at("2026-10-01T03:30:00Z"));
    expect(dueTiers({ weekly: [monday], monthly: [first] }, now)).toEqual(["daily"]);
  });

  it("still makes the weekly when the start of the week was missed", () => {
    const lastWeek = backupKey("weekly", at("2026-09-28T03:30:00Z"));
    const first = backupKey("monthly", at("2026-10-01T03:30:00Z"));
    expect(dueTiers({ weekly: [lastWeek], monthly: [first] }, now)).toEqual(["daily", "weekly"]);
  });

  it("makes a new monthly when the month turns", () => {
    const september = backupKey("monthly", at("2026-09-01T03:30:00Z"));
    const thisWeek = backupKey("weekly", at("2026-10-05T03:30:00Z"));
    expect(dueTiers({ weekly: [thisWeek], monthly: [september] }, now)).toEqual(["daily", "monthly"]);
  });
});

describe("expiredKeys", () => {
  const daily = (day: number, hour = 3) =>
    backupKey("daily", at(`2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:30:00Z`));

  it("keeps the newest N days and deletes the rest", () => {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => daily(d));
    expect(expiredKeys(keys, "daily", 7).sort()).toEqual([daily(1), daily(2), daily(3)]);
  });

  it("does not let extra runs in one day push an older day out", () => {
    const keys = [daily(8), daily(9), daily(10, 3), daily(10, 9), daily(10, 14)];
    expect(expiredKeys(keys, "daily", 3)).toEqual([]);
    expect(expiredKeys(keys, "daily", 2)).toEqual([daily(8)]);
  });

  it("counts weeks and months, not files", () => {
    const weekly = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map((d) =>
      backupKey("weekly", at(`${d}T03:30:00Z`))
    );
    expect(expiredKeys(weekly, "weekly", 4)).toEqual([weekly[0]]);
  });

  it("never touches files that are not backups", () => {
    expect(expiredKeys(["daily/README.txt", daily(1)], "daily", 0)).toEqual([daily(1)]);
  });
});
