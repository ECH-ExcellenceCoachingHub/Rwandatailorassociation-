import "server-only";
import { prisma, withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import {
  add,
  gt,
  isPositive,
  subtract,
  toMoney,
  toMoneyString,
  Decimal,
  type MoneyInput,
} from "@/lib/money";
import { buildTransactionReference, postSavingsTransaction } from "@/lib/services/ledger";
import type {
  MemberStatus,
  PoolDeductionAllocation,
  PoolDeductionPurpose,
} from "@/lib/generated/prisma/enums";

/**
 * MONEY TAKEN OUT OF THE MEMBERS' POOL.
 *
 * The association's money is its members' savings. When the committee spends
 * or lends some of it out — a loan to one member paid for by everybody, a
 * machine for the workshop, a rent bill — that money leaves every member's
 * balance at once, and every one of them is entitled to know how much of it
 * was theirs and why it went.
 *
 * THREE THINGS THIS MODULE HOLDS TO:
 *
 *  1. ALL OR NOTHING. Every member's share is posted inside one database
 *     transaction. A deduction that reached half the membership would leave
 *     the other half holding money the pool no longer has.
 *
 *  2. THE SHARES SUM TO THE WHOLE. Shares are worked out by largest remainder,
 *     so the per-member amounts add up to exactly the amount taken — never a
 *     franc more or less than the committee decided.
 *
 *  3. NOBODY IS TOLD AFTER THE FACT BY ACCIDENT. Every affected member is
 *     notified with the reason, their part and their new balance, and the
 *     deduction stays on their account status page and on the association's
 *     page for good. Each share is an ordinary ADJUSTMENT on their ledger,
 *     which carries the reason and does not touch `totalDeposits` — so a
 *     deduction never makes a member look behind on their daily saving.
 */

export class PoolDeductionError extends Error {
  constructor(
    message: string,
    readonly code: "NO_MEMBERS" | "INSUFFICIENT_FUNDS" | "INVALID_AMOUNT" | "NOT_FOUND"
  ) {
    super(message);
    this.name = "PoolDeductionError";
  }
}

/// Members whose savings are still held by the association. Exited and
/// rejected members have been paid out, and pending ones have not paid in.
const POOL_MEMBER_STATUSES: MemberStatus[] = ["ACTIVE", "SUSPENDED", "INACTIVE"];

/// Generous: one ledger row and one audit row per member, in one transaction.
const POSTING_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/**
 * Divides `total` between weights, so that the parts sum to exactly `total`.
 *
 * Works in whole francs when the total is whole — a member shown a share of
 * 1,234.57 Frw from a 50,000 Frw decision would rightly ask where the cents
 * came from — and in cents otherwise. Each part is first rounded down; the
 * units left over go one at a time to the largest fractional remainders, ties
 * to the earlier entry, which keeps the result deterministic.
 *
 * Pure — no database. Entries with zero weight receive zero.
 */
export function splitByWeight(total: MoneyInput, weights: MoneyInput[]): Decimal[] {
  const amount = toMoney(total);
  const ws = weights.map((w) => toMoney(w));
  const weightSum = ws.reduce((sum, w) => sum.plus(w), new Decimal(0));

  if (!isPositive(amount) || !weightSum.greaterThan(0)) {
    return ws.map(() => new Decimal(0));
  }

  const unit = amount.modulo(1).isZero() ? new Decimal(1) : new Decimal("0.01");

  const exact = ws.map((w) => amount.times(w).dividedBy(weightSum).dividedBy(unit));
  const floors = exact.map((x) => x.floor());
  let leftover = amount
    .dividedBy(unit)
    .minus(floors.reduce((sum, f) => sum.plus(f), new Decimal(0)))
    .toNumber();

  const order = exact
    .map((x, index) => ({ index, fraction: x.minus(floors[index]!) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index);

  const units = [...floors];
  for (const { index } of order) {
    if (leftover <= 0) break;
    units[index] = units[index]!.plus(1);
    leftover--;
  }

  return units.map((u) => u.times(unit).toDecimalPlaces(2));
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PoolDeductionLine {
  memberId: string;
  userId: string;
  memberNumber: string;
  name: string;
  shares: number;
  savingsAccountId: string;
  balance: string;
  amount: string;
  balanceAfter: string;
  /// True when this member's part is more than their balance.
  shortfall: boolean;
}

export interface PoolDeductionPlan {
  totalAmount: string;
  allocation: PoolDeductionAllocation;
  /// Everything members have saved, before the deduction.
  poolBalance: string;
  lines: PoolDeductionLine[];
  /// Members whose part would exceed their balance. Must be empty to post.
  shortfalls: number;
}

interface PoolAccount {
  memberId: string;
  userId: string;
  memberNumber: string;
  name: string;
  shares: number;
  savingsAccountId: string;
  balance: Decimal;
}

async function loadPoolAccounts(
  client: TxClient | typeof prisma,
  associationId: string
): Promise<PoolAccount[]> {
  const accounts = await client.savingsAccount.findMany({
    where: {
      associationId,
      isActive: true,
      member: { status: { in: POOL_MEMBER_STATUSES } },
    },
    // Stable order, which is also the lock order below.
    orderBy: { id: "asc" },
    select: {
      id: true,
      balance: true,
      member: {
        select: {
          id: true,
          userId: true,
          memberNumber: true,
          sharesSubscribed: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // One account per member. A member with two would otherwise be charged twice.
  const seen = new Set<string>();
  const result: PoolAccount[] = [];
  for (const account of accounts) {
    if (seen.has(account.member.id)) continue;
    seen.add(account.member.id);
    result.push({
      memberId: account.member.id,
      userId: account.member.userId,
      memberNumber: account.member.memberNumber,
      name: `${account.member.user.firstName} ${account.member.user.lastName}`.trim(),
      shares: account.member.sharesSubscribed ?? 1,
      savingsAccountId: account.id,
      balance: toMoney(account.balance),
    });
  }
  return result;
}

function weightFor(account: PoolAccount, allocation: PoolDeductionAllocation): Decimal {
  switch (allocation) {
    case "BY_BALANCE":
      return gt(account.balance, 0) ? account.balance : new Decimal(0);
    case "BY_SHARES":
      return new Decimal(Math.max(account.shares, 0));
    case "EQUAL":
      return new Decimal(1);
  }
}

function planFrom(
  accounts: PoolAccount[],
  totalAmount: MoneyInput,
  allocation: PoolDeductionAllocation
): PoolDeductionPlan {
  const total = toMoney(totalAmount);
  if (!isPositive(total)) {
    throw new PoolDeductionError("The amount must be greater than zero", "INVALID_AMOUNT");
  }

  const poolBalance = accounts.reduce((sum, a) => add(sum, a.balance), toMoney(0));
  if (gt(total, poolBalance)) {
    throw new PoolDeductionError(
      `The members' savings total ${toMoneyString(poolBalance)}, which cannot cover ${toMoneyString(total)}`,
      "INSUFFICIENT_FUNDS"
    );
  }

  const parts = splitByWeight(
    total,
    accounts.map((a) => weightFor(a, allocation))
  );

  const lines: PoolDeductionLine[] = [];
  accounts.forEach((account, index) => {
    const part = parts[index]!;
    if (!isPositive(part)) return;
    const after = subtract(account.balance, part);
    lines.push({
      memberId: account.memberId,
      userId: account.userId,
      memberNumber: account.memberNumber,
      name: account.name,
      shares: account.shares,
      savingsAccountId: account.savingsAccountId,
      balance: toMoneyString(account.balance),
      amount: toMoneyString(part),
      balanceAfter: toMoneyString(after),
      shortfall: after.isNegative(),
    });
  });

  if (lines.length === 0) {
    throw new PoolDeductionError("No member has savings to take this from", "NO_MEMBERS");
  }

  return {
    totalAmount: toMoneyString(total),
    allocation,
    poolBalance: toMoneyString(poolBalance),
    lines,
    shortfalls: lines.filter((l) => l.shortfall).length,
  };
}

/** What every member would lose, before anything is posted. */
export async function previewPoolDeduction(params: {
  associationId: string;
  totalAmount: string;
  allocation: PoolDeductionAllocation;
}): Promise<PoolDeductionPlan> {
  const accounts = await loadPoolAccounts(prisma, params.associationId);
  if (accounts.length === 0) {
    throw new PoolDeductionError("This association has no members with savings", "NO_MEMBERS");
  }
  return planFrom(accounts, params.totalAmount, params.allocation);
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export interface PostPoolDeductionInput {
  associationId: string;
  actorId: string;
  purpose: PoolDeductionPurpose;
  title: string;
  reason: string;
  totalAmount: string;
  allocation: PoolDeductionAllocation;
  beneficiaryMemberId?: string | null;
}

export async function postPoolDeduction(
  input: PostPoolDeductionInput
): Promise<{ id: string; reference: string; membersAffected: number }> {
  if (input.beneficiaryMemberId) {
    const beneficiary = await prisma.member.findFirst({
      where: { id: input.beneficiaryMemberId, associationId: input.associationId },
      select: { id: true },
    });
    if (!beneficiary) {
      throw new PoolDeductionError("That member does not belong to this association", "NOT_FOUND");
    }
  }

  const reference = buildTransactionReference("DED");

  const { deduction, plan, posted } = await withFinancialTransaction(
    async (tx) => {
      const accounts = await loadPoolAccounts(tx, input.associationId);
      if (accounts.length === 0) {
        throw new PoolDeductionError("This association has no members with savings", "NO_MEMBERS");
      }

      // Lock every account in the pool, in id order so two concurrent postings
      // cannot deadlock, then re-read the balances under the lock. The preview
      // the officer looked at may be minutes old; the split must be worked out
      // on the balances actually being debited.
      const ids = accounts.map((a) => a.savingsAccountId);
      const locked = await tx.$queryRaw<{ id: string; balance: string }[]>`
        SELECT id, balance::text AS balance FROM savings_accounts
        WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE
      `;
      const lockedBalance = new Map(locked.map((row) => [row.id, toMoney(row.balance)]));
      for (const account of accounts) {
        account.balance = lockedBalance.get(account.savingsAccountId) ?? account.balance;
      }

      const plan = planFrom(accounts, input.totalAmount, input.allocation);
      if (plan.shortfalls > 0) {
        throw new PoolDeductionError(
          `${plan.shortfalls} member(s) do not have enough savings to cover their part. Split by balance instead, or reduce the amount.`,
          "INSUFFICIENT_FUNDS"
        );
      }

      const deduction = await tx.associationDeduction.create({
        data: {
          associationId: input.associationId,
          reference,
          purpose: input.purpose,
          title: input.title,
          reason: input.reason,
          totalAmount: plan.totalAmount,
          allocation: input.allocation,
          membersAffected: plan.lines.length,
          beneficiaryMemberId: input.beneficiaryMemberId ?? null,
          recordedById: input.actorId,
        },
        select: { id: true, reference: true },
      });

      const posted: { line: PoolDeductionLine; balanceAfter: string }[] = [];
      for (const line of plan.lines) {
        const row = await postSavingsTransaction(
          {
            savingsAccountId: line.savingsAccountId,
            type: "ADJUSTMENT",
            direction: "DEBIT",
            amount: line.amount,
            description: `${deduction.reference}: ${input.title}`,
            adjustmentReason: input.reason,
            postedById: input.actorId,
            poolDeductionId: deduction.id,
          },
          tx
        );
        posted.push({ line, balanceAfter: row.balanceAfter });
      }

      await recordAudit(
        {
          action: AUDIT_ACTIONS.POOL_DEDUCTION_POSTED,
          entityType: "AssociationDeduction",
          entityId: deduction.id,
          associationId: input.associationId,
          newValue: {
            reference: deduction.reference,
            purpose: input.purpose,
            title: input.title,
            totalAmount: plan.totalAmount,
            allocation: input.allocation,
            membersAffected: plan.lines.length,
            beneficiaryMemberId: input.beneficiaryMemberId ?? null,
          },
          reason: input.reason,
        },
        { id: input.actorId },
        tx
      );

      return { deduction, plan, posted };
    },
    { timeoutMs: POSTING_TIMEOUT_MS }
  );

  await notifyMembersOfDeduction({
    deductionId: deduction.id,
    reference: deduction.reference,
    title: input.title,
    reason: input.reason,
    totalAmount: plan.totalAmount,
    posted,
  });

  return { id: deduction.id, reference: deduction.reference, membersAffected: posted.length };
}

/**
 * Tells every affected member what was taken, why, and where they now stand.
 *
 * After the commit, and never able to undo it: `notify` swallows its own
 * failures, and the deduction is on every member's statement and status page
 * regardless.
 */
async function notifyMembersOfDeduction(params: {
  deductionId: string;
  reference: string;
  title: string;
  reason: string;
  totalAmount: string;
  posted: { line: PoolDeductionLine; balanceAfter: string }[];
}): Promise<void> {
  for (const { line, balanceAfter } of params.posted) {
    try {
      await notify({
        userId: line.userId,
        event: NOTIFICATION_EVENTS.POOL_DEDUCTION,
        context: {
          deductionTitle: params.title,
          reason: params.reason,
          totalAmount: params.totalAmount,
          amount: line.amount,
          balance: balanceAfter,
          reference: params.reference,
        },
        entityType: "AssociationDeduction",
        entityId: params.deductionId,
      });
    } catch (error) {
      logger.error(
        { err: error, deductionId: params.deductionId, memberId: line.memberId },
        "failed to notify member of pool deduction"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface PoolDeductionSummary {
  id: string;
  reference: string;
  purpose: PoolDeductionPurpose;
  title: string;
  reason: string;
  totalAmount: string;
  allocation: PoolDeductionAllocation;
  membersAffected: number;
  beneficiaryName: string | null;
  recordedByName: string;
  createdAt: Date;
  /// The viewing member's own part, when listed for a member.
  yourShare: string | null;
}

/**
 * Every deduction from an association's pool, newest first. The same list
 * is shown to members and officers: what was taken out of everybody's
 * savings is not something any member can be kept from seeing.
 */
export async function listPoolDeductions(
  associationId: string | null,
  options: { memberId?: string; onlyAffecting?: boolean; take?: number } = {}
): Promise<PoolDeductionSummary[]> {
  const rows = await prisma.associationDeduction.findMany({
    where: {
      ...(associationId ? { associationId } : {}),
      ...(options.memberId && options.onlyAffecting
        ? { transactions: { some: { memberId: options.memberId } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 100,
    select: {
      id: true,
      reference: true,
      purpose: true,
      title: true,
      reason: true,
      totalAmount: true,
      allocation: true,
      membersAffected: true,
      createdAt: true,
      beneficiary: { select: { user: { select: { firstName: true, lastName: true } } } },
      recordedBy: { select: { firstName: true, lastName: true } },
      transactions: options.memberId
        ? { where: { memberId: options.memberId }, select: { amount: true } }
        : false,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    purpose: row.purpose,
    title: row.title,
    reason: row.reason,
    totalAmount: toMoneyString(row.totalAmount),
    allocation: row.allocation,
    membersAffected: row.membersAffected,
    beneficiaryName: row.beneficiary
      ? `${row.beneficiary.user.firstName} ${row.beneficiary.user.lastName}`.trim()
      : null,
    recordedByName: `${row.recordedBy.firstName} ${row.recordedBy.lastName}`.trim(),
    createdAt: row.createdAt,
    yourShare: options.memberId
      ? toMoneyString(
          (row.transactions ?? []).reduce((sum, t) => add(sum, t.amount), toMoney(0))
        )
      : null,
  }));
}

/** The deductions that actually reached one member's savings. */
export async function listMemberPoolDeductions(
  memberId: string,
  take = 5
): Promise<PoolDeductionSummary[]> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { associationId: true },
  });
  if (!member) return [];

  return listPoolDeductions(member.associationId, { memberId, onlyAffecting: true, take });
}
