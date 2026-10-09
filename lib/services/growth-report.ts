import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, subtract, toMoneyString, type MoneyInput } from "@/lib/money";
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
 */

export interface GrowthRow {
  /// Null for members with no district on file.
  district: string | null;
  province: string | null;
  members: number;
  /// Members who have paid savings in at least once.
  savers: number;
  /// Members on the register who have never paid anything in.
  nonSavers: number;
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
    members: number;
    districts: number;
    savers: number;
    nonSavers: number;
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

  const rows = districtReport.districts
    .map((row) => ({
      district: row.district,
      province: row.province,
      members: row.members,
      savers: row.savers,
      nonSavers: row.nonSavers,
      savings: row.savings,
    }))
    .sort(
      (a, b) =>
        Number(b.savings) - Number(a.savings) ||
        b.members - a.members ||
        (a.district ?? "").localeCompare(b.district ?? "")
    );

  return {
    association: districtReport.association,
    asOf: districtReport.asOf,
    since,
    previousSavings: previousBalance(
      districtReport.totals.savings,
      credits._sum.amount ?? 0,
      debits._sum.amount ?? 0
    ),
    rows,
    totals: {
      members: districtReport.totals.members,
      districts: districtReport.totals.districts,
      savers: districtReport.totals.savers,
      nonSavers: districtReport.totals.nonSavers,
      savings: districtReport.totals.savings,
    },
  };
}
