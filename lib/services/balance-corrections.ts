import "server-only";
import { withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  abs,
  add,
  isNegative,
  isPositive,
  isZero,
  lte,
  min,
  subtract,
  toMoney,
  toMoneyString,
  type Money,
  type MoneyInput,
} from "@/lib/money";
import {
  buildTransactionReference,
  postSavingsTransaction,
  type PostedTransaction,
} from "@/lib/services/ledger";
import { notifyReleasedGuarantors, releaseGuarantees } from "@/lib/services/guarantors";
import type { InstallmentStatus, LoanStatus } from "@/lib/generated/prisma/enums";

/**
 * MANUAL CORRECTIONS.
 *
 * The automatic paths — statement matching, the nightly jobs, repayment
 * allocation — occasionally get a member's figures wrong: a deposit that was
 * never matched, a repayment recorded against the wrong loan, interest charged
 * twice. This module is how an officer puts the numbers right by hand.
 *
 * It never edits history. Every correction is a new ledger row — a DEPOSIT or
 * ADJUSTMENT on the savings ledger, an ADJUSTMENT on the loan ledger — with a
 * written reason and a CRITICAL audit entry under the officer's name, so the
 * member's statement still shows what they were told before and what changed.
 */

export class CorrectionError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "INVALID_AMOUNT" | "NO_CHANGE" | "REASON_REQUIRED"
  ) {
    super(message);
    this.name = "CorrectionError";
  }
}

function requireReason(reason: string): string {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new CorrectionError("A correction requires a written reason", "REASON_REQUIRED");
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

async function activeAccountId(memberId: string, tx: TxClient) {
  const account = await tx.savingsAccount.findFirst({
    where: { memberId, isActive: true },
    select: { id: true },
  });
  if (!account) {
    throw new CorrectionError("This member has no active savings account", "NOT_FOUND");
  }
  return account.id;
}

/**
 * Records a deposit the automatic matching missed — cash handed over at the
 * office, or a bank transfer that never reached the statement import.
 *
 * Posted as a DEPOSIT rather than an ADJUSTMENT on purpose: the member's
 * contribution standing is measured in deposits, so only a DEPOSIT clears the
 * arrears (and the fines) the missing payment caused.
 */
export async function recordMissedDeposit(params: {
  memberId: string;
  amount: string;
  channel: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER";
  externalReference?: string | null;
  reason: string;
  actorId: string;
  valueDate?: Date;
}): Promise<PostedTransaction> {
  const reason = requireReason(params.reason);
  const amount = toMoney(params.amount);
  if (!isPositive(amount)) {
    throw new CorrectionError("A deposit must be greater than zero", "INVALID_AMOUNT");
  }

  return withFinancialTransaction(async (tx) => {
    const savingsAccountId = await activeAccountId(params.memberId, tx);
    return postSavingsTransaction(
      {
        savingsAccountId,
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: toMoneyString(amount),
        channel: params.channel,
        externalReference: params.externalReference ?? null,
        description: `Deposit recorded by an officer: ${reason}`,
        postedById: params.actorId,
        // Carried on the row and the audit entry even though a DEPOSIT does not
        // require it, so the ledger shows this one was entered by hand.
        adjustmentReason: reason,
        valueDate: params.valueDate,
      },
      tx
    );
  });
}

/**
 * Sets a member's savings balance to the figure it should be, by posting the
 * difference as one ADJUSTMENT.
 *
 * The officer states the target rather than the difference because that is
 * the number they have in front of them — a passbook, a reconciliation sheet —
 * and the difference is computed here, under a row lock, from the balance as
 * it stands at that instant rather than as it stood when the form was opened.
 */
export async function setSavingsBalance(params: {
  memberId: string;
  targetBalance: string;
  reason: string;
  actorId: string;
}): Promise<PostedTransaction & { previousBalance: string }> {
  const reason = requireReason(params.reason);
  const target = toMoney(params.targetBalance);
  if (isNegative(target)) {
    throw new CorrectionError("A savings balance cannot be negative", "INVALID_AMOUNT");
  }

  return withFinancialTransaction(async (tx) => {
    const savingsAccountId = await activeAccountId(params.memberId, tx);

    // Locked so no deposit lands between reading the balance and posting the
    // difference, which would leave the account short of the stated target.
    const [locked] = await tx.$queryRaw<{ balance: string }[]>`
      SELECT balance::text AS balance FROM savings_accounts
      WHERE id = ${savingsAccountId} FOR UPDATE
    `;
    const current = toMoney(locked.balance);
    const delta = subtract(target, current);

    if (isZero(delta)) {
      throw new CorrectionError(
        `The balance is already ${toMoneyString(current)}`,
        "NO_CHANGE"
      );
    }

    const posted = await postSavingsTransaction(
      {
        savingsAccountId,
        type: "ADJUSTMENT",
        direction: isPositive(delta) ? "CREDIT" : "DEBIT",
        amount: toMoneyString(abs(delta)),
        description: `Balance corrected from ${toMoneyString(current)} to ${toMoneyString(target)}`,
        postedById: params.actorId,
        adjustmentReason: reason,
      },
      tx
    );

    return { ...posted, previousBalance: toMoneyString(current) };
  });
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

const BUCKETS = ["principal", "interest", "fees", "penalty"] as const;
type Bucket = (typeof BUCKETS)[number];
export type LoanBuckets = Record<Bucket, string>;

/** Loans whose figures can be corrected: ones with a live schedule, or one wrongly closed. */
const CORRECTABLE: readonly LoanStatus[] = ["DISBURSED", "ACTIVE", "OVERDUE", "DEFAULTED", "COMPLETED"];

export interface ScheduleRow {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  status: InstallmentStatus;
  principalDue: MoneyInput;
  interestDue: MoneyInput;
  feesDue: MoneyInput;
  penaltyDue: MoneyInput;
  principalPaid: MoneyInput;
  interestPaid: MoneyInput;
  feesPaid: MoneyInput;
  penaltyPaid: MoneyInput;
  totalPaid: MoneyInput;
  paidAt: Date | null;
}

export interface ScheduleChange {
  id: string;
  principalDue: string;
  interestDue: string;
  feesDue: string;
  penaltyDue: string;
  totalDue: string;
  status: InstallmentStatus;
  paidAt: Date | null;
}

/**
 * Spreads a correction across the repayment schedule so the instalments keep
 * agreeing with the loan's totals.
 *
 *  - A REDUCTION comes off the oldest unpaid instalments first — the same order
 *    a repayment settles them — so a correction clears arrears before it
 *    shortens the tail of the loan.
 *  - An INCREASE of principal or interest goes on the last instalment, so the
 *    loan runs longer rather than today's instalment jumping. An increase of
 *    fees or penalty goes on the oldest unpaid instalment, because those are
 *    charges owed now.
 *
 * Pure, and exported for the tests. Waived instalments are left alone. Any
 * part of a reduction the schedule has no room for (the instalments were
 * already paid) is dropped here: the loan's own totals still move.
 */
export function redistributeSchedule(
  rows: ScheduleRow[],
  deltas: Record<Bucket, Money>,
  now: Date = new Date()
): ScheduleChange[] {
  const schedule = rows
    .filter((row) => row.status !== "WAIVED")
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((row) => ({
      row,
      due: {
        principal: toMoney(row.principalDue),
        interest: toMoney(row.interestDue),
        fees: toMoney(row.feesDue),
        penalty: toMoney(row.penaltyDue),
      } as Record<Bucket, Money>,
      paid: {
        principal: toMoney(row.principalPaid),
        interest: toMoney(row.interestPaid),
        fees: toMoney(row.feesPaid),
        penalty: toMoney(row.penaltyPaid),
      } as Record<Bucket, Money>,
      touched: false,
    }));

  if (schedule.length === 0) return [];

  for (const bucket of BUCKETS) {
    const delta = deltas[bucket];
    if (isZero(delta)) continue;

    if (isNegative(delta)) {
      let remaining = abs(delta);
      for (const entry of schedule) {
        if (!isPositive(remaining)) break;
        const room = subtract(entry.due[bucket], entry.paid[bucket]);
        if (!isPositive(room)) continue;
        const taken = min(room, remaining);
        entry.due[bucket] = subtract(entry.due[bucket], taken);
        remaining = subtract(remaining, taken);
        entry.touched = true;
      }
    } else {
      const unpaid = schedule.find((entry) =>
        isPositive(subtract(sumOf(entry.due), entry.row.totalPaid))
      );
      const target =
        bucket === "principal" || bucket === "interest"
          ? schedule[schedule.length - 1]
          : (unpaid ?? schedule[schedule.length - 1]);
      target.due[bucket] = add(target.due[bucket], delta);
      target.touched = true;
    }
  }

  return schedule
    .filter((entry) => entry.touched)
    .map(({ row, due }) => {
      const totalDue = sumOf(due);
      const settled = lte(subtract(totalDue, row.totalPaid), 0);
      let status: InstallmentStatus;
      if (settled) status = "PAID";
      else if (row.dueDate < now) status = "OVERDUE";
      else if (isPositive(row.totalPaid)) status = "PARTIALLY_PAID";
      else status = row.status === "PAID" ? "UPCOMING" : row.status;

      return {
        id: row.id,
        principalDue: toMoneyString(due.principal),
        interestDue: toMoneyString(due.interest),
        feesDue: toMoneyString(due.fees),
        penaltyDue: toMoneyString(due.penalty),
        totalDue: toMoneyString(totalDue),
        status,
        paidAt: settled ? (row.paidAt ?? now) : null,
      };
    });
}

function sumOf(due: Record<Bucket, Money>): Money {
  return add(due.principal, due.interest, due.fees, due.penalty);
}

/**
 * Sets a loan's outstanding principal, interest, fees and penalty to the
 * figures they should be.
 *
 * The difference is posted as one ADJUSTMENT on the loan ledger with a signed
 * portion per bucket, the schedule is reshaped to match (see
 * `redistributeSchedule`), and the loan's status follows the new figures: a
 * loan corrected to zero closes and frees its guarantors, a wrongly closed
 * loan corrected upwards reopens.
 */
export async function correctLoanBalance(params: {
  loanId: string;
  outstanding: LoanBuckets;
  reason: string;
  actorId: string;
}) {
  const reason = requireReason(params.reason);

  const target = {} as Record<Bucket, Money>;
  for (const bucket of BUCKETS) {
    target[bucket] = toMoney(params.outstanding[bucket]);
    if (isNegative(target[bucket])) {
      throw new CorrectionError(`Outstanding ${bucket} cannot be negative`, "INVALID_AMOUNT");
    }
  }

  const result = await withFinancialTransaction(async (tx) => {
    // Locked so a repayment cannot interleave with the correction and have its
    // allocation computed against figures that are about to change.
    await tx.$queryRaw`SELECT id FROM loans WHERE id = ${params.loanId} FOR UPDATE`;

    const loan = await tx.loan.findUnique({
      where: { id: params.loanId },
      include: { installments: true },
    });
    if (!loan) throw new CorrectionError("Loan not found", "NOT_FOUND");

    if (!CORRECTABLE.includes(loan.status)) {
      throw new CorrectionError(
        `A loan with status ${loan.status} cannot be corrected`,
        "INVALID_STATE"
      );
    }

    const before: Record<Bucket, Money> = {
      principal: toMoney(loan.principalOutstanding),
      interest: toMoney(loan.interestOutstanding),
      fees: toMoney(loan.feesOutstanding),
      penalty: toMoney(loan.penaltyOutstanding),
    };
    const deltas = {} as Record<Bucket, Money>;
    for (const bucket of BUCKETS) deltas[bucket] = subtract(target[bucket], before[bucket]);

    const totalDelta = sumOf(deltas);
    if (BUCKETS.every((bucket) => isZero(deltas[bucket]))) {
      throw new CorrectionError("These are already the loan's figures", "NO_CHANGE");
    }

    const now = new Date();
    const changes = redistributeSchedule(loan.installments, deltas, now);
    for (const change of changes) {
      const { id, ...data } = change;
      await tx.loanInstallment.update({
        where: { id },
        data: { ...data, daysOverdue: data.status === "OVERDUE" ? undefined : 0 },
      });
    }

    // Arrears re-read from the corrected schedule rather than patched, so they
    // are exactly what the nightly overdue job would compute.
    const overdue = await tx.loanInstallment.findMany({
      where: { loanId: loan.id, status: "OVERDUE" },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true, totalDue: true, totalPaid: true },
    });
    const overdueAmount = overdue.reduce(
      (total, i) => add(total, subtract(i.totalDue, i.totalPaid)),
      toMoney(0)
    );
    const daysOverdue = overdue[0]
      ? Math.max(0, Math.floor((now.getTime() - overdue[0].dueDate.getTime()) / 86_400_000))
      : 0;

    const newTotal = sumOf(target);
    const closes = lte(newTotal, 0);
    let status: LoanStatus = loan.status;
    if (closes) status = "COMPLETED";
    else if (loan.status === "DEFAULTED") status = "DEFAULTED";
    else if (overdue.length > 0) status = "OVERDUE";
    else if (loan.status === "OVERDUE" || loan.status === "COMPLETED") status = "ACTIVE";

    const sequence = (await tx.loanTransaction.count({ where: { loanId: loan.id } })) + 1;
    const loanTransaction = await tx.loanTransaction.create({
      data: {
        associationId: loan.associationId,
        loanId: loan.id,
        sequence,
        reference: buildTransactionReference("LAD"),
        type: "ADJUSTMENT",
        // Unsigned like every ledger amount; the portions carry the direction
        // of each bucket's change, and balanceAfter the result.
        amount: toMoneyString(abs(totalDelta)),
        principalPortion: toMoneyString(deltas.principal),
        interestPortion: toMoneyString(deltas.interest),
        feesPortion: toMoneyString(deltas.fees),
        penaltyPortion: toMoneyString(deltas.penalty),
        balanceAfter: toMoneyString(newTotal),
        description: `Balance corrected by an officer on loan ${loan.reference}`,
        postedById: params.actorId,
        adjustmentReason: reason,
      },
      select: { id: true, reference: true },
    });

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        principalOutstanding: toMoneyString(target.principal),
        interestOutstanding: toMoneyString(target.interest),
        feesOutstanding: toMoneyString(target.fees),
        penaltyOutstanding: toMoneyString(target.penalty),
        // What the loan costs in total moves with what is owed, so
        // "payable − paid" on every screen keeps equalling the outstanding.
        totalPayable: toMoneyString(add(loan.totalPayable, totalDelta)),
        totalInterest: toMoneyString(add(loan.totalInterest, deltas.interest)),
        totalFees: toMoneyString(add(loan.totalFees, deltas.fees)),
        status,
        daysOverdue,
        overdueAmount: toMoneyString(overdueAmount),
        completedAt: closes ? (loan.completedAt ?? now) : null,
      },
    });

    const released =
      closes && loan.status !== "COMPLETED"
        ? await releaseGuarantees(tx, {
            loanId: loan.id,
            applicationId: loan.applicationId,
            actorId: params.actorId,
            reason: `Loan ${loan.reference} corrected to nothing outstanding`,
          })
        : [];

    await recordAudit(
      {
        action: AUDIT_ACTIONS.LOAN_BALANCE_ADJUSTED,
        entityType: "Loan",
        entityId: loan.id,
        associationId: loan.associationId,
        oldValue: {
          principalOutstanding: toMoneyString(before.principal),
          interestOutstanding: toMoneyString(before.interest),
          feesOutstanding: toMoneyString(before.fees),
          penaltyOutstanding: toMoneyString(before.penalty),
          status: loan.status,
        },
        newValue: {
          reference: loanTransaction.reference,
          principalOutstanding: toMoneyString(target.principal),
          interestOutstanding: toMoneyString(target.interest),
          feesOutstanding: toMoneyString(target.fees),
          penaltyOutstanding: toMoneyString(target.penalty),
          status,
        },
        reason,
        metadata: { memberId: loan.memberId, instalmentsChanged: changes.length },
        severity: "CRITICAL",
      },
      { id: params.actorId },
      tx
    );

    return {
      reference: loanTransaction.reference,
      totalOutstanding: toMoneyString(newTotal),
      status,
      instalmentsChanged: changes.length,
      released,
    };
  });

  await notifyReleasedGuarantors(result.released);

  const { released, ...correction } = result;
  void released;
  return correction;
}
