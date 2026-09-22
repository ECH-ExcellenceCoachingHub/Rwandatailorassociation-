import { isZero, type MoneyInput } from "@/lib/money";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * Taking somebody off the register, and the two ways of doing it.
 *
 * DELETING erases the member, their login and everything recorded against
 * them — savings, withdrawals, loans, fines, service fees, interest shares and
 * warehouse issues. Nothing about their history stops it: it exists for test
 * accounts and records made in error, which are exactly the ones that tend to
 * have a few transactions on them. What it leaves behind is kept consistent —
 * goods still out go back into stock, money that came in through the bank goes
 * back to the unmatched queue — and a full copy of the file goes into the
 * audit log, which afterwards is the only place the member exists.
 *
 * CLOSING is for a real member who leaves. Their savings rows are what the
 * association's balance is the sum of, their loan repayments are its income,
 * their fines were collected. Those are the association's accounts as much as
 * the member's, and closing keeps every one of them.
 *
 * Kept free of the database so the rule can be read and tested on its own.
 */

/** Everything recorded against a member that deleting them takes with it. */
export const MEMBER_HISTORY_KINDS = [
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

export type MemberHistoryKind = (typeof MEMBER_HISTORY_KINDS)[number];

export interface MemberHistory {
  savingsTransactions: number;
  /// Cached balance plus the locked portion, summed over every account.
  savingsBalance: MoneyInput;
  withdrawals: number;
  loanApplications: number;
  loans: number;
  /// Inbound payments and bank lines matched to this member, and BK claims
  /// raised in their name. Deleting does not erase these — they are the
  /// bank's record, not the member's — it returns them to the unmatched queue.
  payments: number;
  fines: number;
  serviceFees: number;
  interestShares: number;
  warehouse: number;
  /// Guarantees still pending or accepted on somebody else's loan. The loan
  /// keeps the guarantor's name as free text; only the link goes.
  guarantees: number;
}

export interface HistoryCount {
  key: MemberHistoryKind;
  /// Zero for the balance, which is a sum of money rather than a count.
  count: number;
}

/**
 * What deleting this member takes with them, for the confirmation to list.
 * Empty means a record nothing has touched.
 */
export function historyToErase(history: MemberHistory): HistoryCount[] {
  const found: HistoryCount[] = [];

  for (const key of MEMBER_HISTORY_KINDS) {
    if (key === "savingsBalance") {
      if (!isZero(history.savingsBalance)) found.push({ key, count: 0 });
      continue;
    }
    const count = history[key];
    if (count > 0) found.push({ key, count });
  }

  return found;
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
