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
 * The period is a day: yesterday's closing balance against what is held now,
 * which is the comparison the association already makes when it reads the
 * figures out at a meeting.
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
  /// The district's savings balance.
  savings: string;
}

export interface GrowthReport {
  association: { name: string; code: string } | null;
  asOf: Date;
  /// The day the comparison period opened — midnight today, so the balance it
  /// derives is yesterday's closing figure.
  since: Date;
  /// Savings held when the period opened, derived from the ledger.
  previousSavings: string;
  /// Districts ranked by savings, highest first — the card's table order.
  rows: GrowthRow[];
  totals: {
    /// Districts holding savings — the rows on the card.
    districts: number;
    /// Members who have saved, in those districts.
    savers: number;
    savings: string;
  };
}

/** Midnight today: the line between yesterday and now. */
export function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
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
    savings: toMoneyString(add(ZERO, ...rows.map((row) => row.savings))),
  };
}

export async function buildGrowthReport(
  associationId: string | null,
  districtReport: DistrictReport,
  since: Date = startOfToday(districtReport.asOf)
): Promise<GrowthReport> {
  // null means platform-wide (super admin). Prisma needs the filter omitted
  // entirely rather than set to null.
  const scope = associationId ? { associationId } : {};

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
