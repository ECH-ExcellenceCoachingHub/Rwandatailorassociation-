import { isZero, type MoneyInput } from "@/lib/money";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * Taking somebody off the register, and which of the two ways is open.
 *
 * DELETING erases the member, their login and their savings account. It is
 * only possible for a record money has never touched — an application made in
 * error, a duplicate typed in twice. The schema enforces this independently:
 * every ledger table points at Member with `onDelete: Restrict`, so an
 * attempt to erase a member with history fails at the database no matter what
 * this module says.
 *
 * CLOSING is for everyone else. A member who leaves has savings rows that the
 * association's balance is the sum of, loans whose repayments are the
 * association's income, fines that were collected. Those are the association's
 * accounts as much as the member's, and they have to outlive the membership.
 *
 * Kept free of the database so the rule can be read and tested on its own.
 */

/** Everything that makes a member's record part of the association's accounts. */
export const REMOVAL_BLOCKERS = [
  "savingsTransactions",
  "savingsBalance",
  "withdrawals",
  "loanApplications",
  "loans",
  "payments",
  "fines",
  "serviceFees",
  "interestShares",
  "warehouse",
  "guarantees",
] as const;

export type RemovalBlocker = (typeof REMOVAL_BLOCKERS)[number];

export interface MemberHistory {
  savingsTransactions: number;
  /// Cached balance plus the locked portion, summed over every account. With
  /// no transactions both should be zero; a non-zero one means the cache and
  /// the ledger disagree, which is a reason to stop, not to erase the evidence.
  savingsBalance: MoneyInput;
  withdrawals: number;
  loanApplications: number;
  loans: number;
  /// Inbound payments and bank lines matched to this member, and BK claims
  /// raised in their name. The foreign keys are SetNull, so deleting would not
  /// fail — it would silently turn attributed money into unattributed money.
  payments: number;
  fines: number;
  serviceFees: number;
  interestShares: number;
  warehouse: number;
  /// Guarantees still pending or accepted. A released or declined guarantee
  /// keeps the guarantor's name as free text and loses nothing by the link
  /// going, so it does not count.
  guarantees: number;
}

export interface BlockerCount {
  key: RemovalBlocker;
  /// Zero for the balance, which is a sum of money rather than a count.
  count: number;
}

/** What stands in the way of erasing this member. Empty means they can be. */
export function removalBlockers(history: MemberHistory): BlockerCount[] {
  const blockers: BlockerCount[] = [];

  for (const key of REMOVAL_BLOCKERS) {
    if (key === "savingsBalance") {
      if (!isZero(history.savingsBalance)) blockers.push({ key, count: 0 });
      continue;
    }
    const count = history[key];
    if (count > 0) blockers.push({ key, count });
  }

  return blockers;
}

/**
 * Statuses a membership can be closed from. A pending application is declined
 * rather than closed — it never started — and a rejected or already-closed one
 * has nothing left to end.
 */
export const CLOSABLE_STATUSES: ReadonlySet<MemberStatus> = new Set<MemberStatus>([
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
]);
