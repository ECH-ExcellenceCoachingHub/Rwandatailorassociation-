/**
 * WHICH BACKUP TIERS ARE DUE, WHAT THEY ARE CALLED, AND WHICH ONES TO DELETE.
 *
 * One backup is taken a night. It is always filed as a daily; it is also filed
 * as this week's weekly if the week has none yet, and as this month's monthly
 * if the month has none yet. Deciding "due" from what is already in the store,
 * rather than from "is today Sunday / the 1st", is deliberate: a worker that
 * was down on Sunday night still produces that week's weekly on Monday, and a
 * month whose 1st was missed still gets its monthly.
 *
 * Retention counts PERIODS, not files. Keeping "7 daily" means the newest file
 * of each of the last seven days, so a handful of manual runs in one afternoon
 * cannot push last Tuesday's backup out of the window.
 *
 * Everything is UTC so the names and periods mean the same thing on every
 * machine that reads the store. Free of imports so it can be tested without a
 * database or a bucket.
 */

export const TIERS = ["daily", "weekly", "monthly"] as const;
export type Tier = (typeof TIERS)[number];

export interface Retention {
  daily: number;
  weekly: number;
  monthly: number;
}

const FILE_PREFIX = "rta-backup-";
export const FILE_EXTENSION = ".rtabak";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `2026-10-05T03:30:07.123Z` → `20261005T033007Z`. Sorts chronologically as text. */
export function backupStamp(at: Date): string {
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/** The file name a backup taken at `at` is stored under, in every tier. */
export function backupFileName(at: Date): string {
  return `${FILE_PREFIX}${backupStamp(at)}${FILE_EXTENSION}`;
}

/** The store key for a backup in a tier: `weekly/rta-backup-20261005T033007Z.rtabak`. */
export function backupKey(tier: Tier, at: Date): string {
  return `${tier}/${backupFileName(at)}`;
}

/** When the backup at `key` was taken, or null for anything that is not one of ours. */
export function parseBackupTime(key: string): Date | null {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const match = /^rta-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.rtabak$/.exec(name);
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

/** The ISO-8601 week a date falls in, e.g. `2026-W40`. Weeks start on Monday. */
export function isoWeek(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // Thursday of this week decides which year the week belongs to.
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${pad(week)}`;
}

/** The period a tier groups backups by: a day, an ISO week, or a month. */
export function periodOf(tier: Tier, at: Date): string {
  switch (tier) {
    case "daily":
      return at.toISOString().slice(0, 10);
    case "weekly":
      return isoWeek(at);
    case "monthly":
      return at.toISOString().slice(0, 7);
  }
}

/**
 * The tiers tonight's backup should be filed under. Daily always; weekly and
 * monthly only when their current period has nothing in it yet.
 */
export function dueTiers(
  existing: Pick<Record<Tier, string[]>, "weekly" | "monthly">,
  now: Date
): Tier[] {
  const tiers: Tier[] = ["daily"];

  for (const tier of ["weekly", "monthly"] as const) {
    const current = periodOf(tier, now);
    const covered = existing[tier].some((key) => {
      const at = parseBackupTime(key);
      return at !== null && periodOf(tier, at) === current;
    });
    if (!covered) tiers.push(tier);
  }

  return tiers;
}

/**
 * Keys in one tier that fall outside its retention window: everything not in
 * the newest `keep` distinct periods. Every file inside a kept period stays, so
 * a manual backup taken before a risky change is not deleted the same night.
 * Keys that are not backups are never returned — a stray file someone dropped
 * in the bucket is not this function's to delete.
 */
export function expiredKeys(keys: string[], tier: Tier, keep: number): string[] {
  const dated = keys
    .map((key) => ({ key, at: parseBackupTime(key) }))
    .filter((entry): entry is { key: string; at: Date } => entry.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const keptPeriods = new Set<string>();
  const expired: string[] = [];

  for (const { key, at } of dated) {
    const period = periodOf(tier, at);
    if (keptPeriods.has(period)) continue;
    if (keptPeriods.size < keep) {
      keptPeriods.add(period);
      continue;
    }
    expired.push(key);
  }

  return expired;
}
