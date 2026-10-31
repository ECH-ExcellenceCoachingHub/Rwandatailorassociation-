import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, isPositive, subtract, toMoneyString, ZERO, type MoneyInput } from "@/lib/money";
import type { DistrictReport } from "./district-report";

/**
 * THE GROWTH SUMMARY — the one-page report the association shares.
 *
 * The district report answers who holds what; this answers the question a
 * general meeting asks first: how far have we come. It reuses the district
 * report's rows (already loaded on the reports page, so no second scan of the
 * register) and adds the only genuinely new figure — what the same money was
 * worth before the period began.
 *
 * That figure comes from the ledger, not from a snapshot table: a balance held
 * on the day the period opened is what is held now, minus everything credited
 * since, plus everything debited since. Completed ledger rows are the only
 * record of every movement, so the arithmetic closes exactly.
 *
 * The period is chosen by the reader. By default it opens on the last day
 * deposits were posted — the day the latest statement or payments went in — so
 * the uplift shows what that batch added, however many quiet days have passed
 * since. Yesterday, the start of the month, or any earlier day's close can be
 * picked instead.
 *
 * THE CARD IS COUNTED DIFFERENTLY FROM EVERYTHING ELSE ON THE PAGE. It is the
 * one report that leaves the building — it is captured as a picture and shared
 * — so it counts only what has actually been saved: the members who have paid
 * savings in, and the districts that hold savings. A district whose members
 * have saved nothing yet has no row on the card. Those districts, and every
 * member on the register, stay on the district table above it and in its PDF
 * and CSV: the exception belongs to the image alone.
 */

export interface GrowthRow {
  /// Null for members with no district on file.
  district: string | null;
  province: string | null;
  /// Members in the district who have paid savings in at least once.
  savers: number;
  /// Shares subscribed by members in the district.
  shares: number;
  /// The district's savings balance.
  savings: string;
}

export interface GrowthReport {
  association: { name: string; code: string } | null;
  asOf: Date;
  /// The moment the comparison period opened — always a midnight, so the
  /// balance it derives is the previous day's closing figure.
  since: Date;
  /// What the reader chose to compare against.
  comparison: GrowthComparison;
  /// When deposits were last posted, or null if none ever have been.
  lastDepositAt: Date | null;
  /// Savings held when the period opened, derived from the ledger.
  previousSavings: string;
  /// Districts ranked by savings, highest first — the card's table order.
  rows: GrowthRow[];
  totals: {
    /// Districts holding savings — the rows on the card.
    districts: number;
    /// Members who have saved, in those districts.
    savers: number;
    /// Shares subscribed by members in those districts.
    shares: number;
    savings: string;
  };
}

/** Midnight at the start of the day in hand. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Midnight today: the line between yesterday and now. */
export function startOfToday(now: Date): Date {
  return startOfDay(now);
}

/**
 * What the growth figure is measured against:
 * - "last-deposit": the close of the day before deposits were last posted;
 * - "yesterday": yesterday's close;
 * - "month": the close of last month;
 * - "date": the close of a day the reader picked (`date`, YYYY-MM-DD).
 */
export const COMPARISON_MODES = ["last-deposit", "yesterday", "month", "date"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export interface GrowthComparison {
  mode: ComparisonMode;
  /// The picked day as YYYY-MM-DD; null unless mode is "date".
  date: string | null;
}

export const DEFAULT_COMPARISON: GrowthComparison = { mode: "last-deposit", date: null };

/** A YYYY-MM-DD string as local midnight, or null if it is not a real day. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  // 2026-02-31 would otherwise roll quietly into March.
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

/** Local YYYY-MM-DD, the shape a date input reads and writes. */
export function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The comparison named in the page's query string. Anything unrecognised — and
 * a picked day that is today or later, whose close has not happened yet —
 * falls back to the default rather than failing the page.
 */
export function parseComparison(raw: string | undefined, now: Date): GrowthComparison {
  if (raw === "yesterday" || raw === "month" || raw === "last-deposit") {
    return { mode: raw, date: null };
  }
  const day = raw ? parseDay(raw) : null;
  if (raw && day && day < startOfToday(now)) return { mode: "date", date: raw };
  return DEFAULT_COMPARISON;
}

/**
 * Where the ledger window opens for a comparison. The window always opens at
 * a midnight, and the balance before it is the previous day's close — so a
 * picked day's close means opening the window the morning after.
 */
export function comparisonStart(
  comparison: GrowthComparison,
  now: Date,
  lastDepositAt: Date | null
): Date {
  switch (comparison.mode) {
    case "yesterday":
      return startOfToday(now);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "date": {
      const day = comparison.date ? parseDay(comparison.date) : null;
      if (!day) return startOfToday(now);
      return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    }
    case "last-deposit":
      // Nothing deposited yet: there is no batch to measure, so yesterday it is.
      return lastDepositAt ? startOfDay(lastDepositAt) : startOfToday(now);
  }
}

/**
 * What was held at the start of a period: the balance held now, less what came
 * in since, plus what went out since. Deliberately separate from the query so
 * the sign convention can be tested without a ledger.
 */
export function previousBalance(
  current: MoneyInput,
  creditsSince: MoneyInput,
  debitsSince: MoneyInput
): string {
  return toMoneyString(subtract(add(current, debitsSince), creditsSince));
}

/**
 * The districts that belong on the shared card: the ones holding savings.
 *
 * A district whose members have saved nothing yet — including one that saved
 * and then withdrew everything — says nothing on a picture sent round after a
 * meeting, and its zero row pulls the leading bar of the ranking down with it.
 * The district table and its downloads keep every district on the register;
 * this filter is the image's alone.
 *
 * Anything at or below zero is left out: a savings balance is never negative,
 * so "nothing saved" and "nothing left" are the same thing here.
 */
export function districtsWithSavings<T extends { savings: string }>(districts: T[]): T[] {
  return districts.filter((row) => isPositive(row.savings));
}

/** The card's rows: the districts that hold savings, ranked by savings. */
export function growthRows(districts: DistrictReport["districts"]): GrowthRow[] {
  return districtsWithSavings(districts)
    .map((row) => ({
      district: row.district,
      province: row.province,
      savers: row.savers,
      shares: row.shares,
      savings: row.savings,
    }))
    // Highest savings first. Ties fall back to how many saved, then the
    // district name, so the same data always ranks the same way.
    .sort(
      (a, b) =>
        Number(b.savings) - Number(a.savings) ||
        b.savers - a.savers ||
        (a.district ?? "").localeCompare(b.district ?? "")
    );
}

/**
 * What the card's rows add up to. The district count is of districts, so a row
 * with no district on file — members who never recorded one — is shown but
 * never counted as one, and every figure here matches the table on the card.
 */
export function growthTotals(rows: GrowthRow[]): GrowthReport["totals"] {
  return {
    districts: rows.filter((row) => row.district !== null).length,
    savers: rows.reduce((sum, row) => sum + row.savers, 0),
    shares: rows.reduce((sum, row) => sum + row.shares, 0),
    savings: toMoneyString(add(ZERO, ...rows.map((row) => row.savings))),
  };
}

export async function buildGrowthReport(
  associationId: string | null,
  districtReport: DistrictReport,
  comparison: GrowthComparison = DEFAULT_COMPARISON
): Promise<GrowthReport> {
  // null means platform-wide (super admin). Prisma needs the filter omitted
  // entirely rather than set to null.
  const scope = associationId ? { associationId } : {};

  // Posting time, not value date: "the last day we added deposits" is the day
  // a statement was imported, whatever dates the bank put on its lines. Fee
  // runs and other debits post nightly, so only deposits mark a batch.
  const lastDeposit = await prisma.savingsTransaction.findFirst({
    where: { ...scope, status: "COMPLETED", type: "DEPOSIT", direction: "CREDIT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const lastDepositAt = lastDeposit?.createdAt ?? null;
  const since = comparisonStart(comparison, districtReport.asOf, lastDepositAt);

  const [credits, debits] = await Promise.all([
    prisma.savingsTransaction.aggregate({
      where: { ...scope, status: "COMPLETED", direction: "CREDIT", createdAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { ...scope, status: "COMPLETED", direction: "DEBIT", createdAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);

  const rows = growthRows(districtReport.districts);
  const totals = growthTotals(rows);

  return {
    association: districtReport.association,
    asOf: districtReport.asOf,
    since,
    comparison,
    lastDepositAt,
    // A district with no savings adds nothing to this total, so it is the whole
    // register's figure however the rows are cut — and it is the same total the
    // card's table adds up to.
    previousSavings: previousBalance(
      totals.savings,
      credits._sum.amount ?? 0,
      debits._sum.amount ?? 0
    ),
    rows,
    totals,
  };
}
