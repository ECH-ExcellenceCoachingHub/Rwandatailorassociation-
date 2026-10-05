import "server-only";
import { customAlphabet } from "nanoid";
import { Prisma, withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { ledgerLogger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, gt, isPositive, subtract, toMoney, toMoneyString } from "@/lib/money";
import type {
  PaymentChannel,
  TransactionDirection,
  TransactionType,
} from "@/lib/generated/prisma/enums";

/**
 * THE SAVINGS LEDGER.
 *
 * Every franc that enters or leaves a member's savings passes through
 * `postSavingsTransaction`. There is no other write path to a balance, and
 * that is the point — `member.balance += amount` is exactly the pattern this
 * module exists to make impossible.
 *
 * The guarantees, and how each is obtained:
 *
 *  1. ATOMIC. The ledger row, the account balance, the running totals and the
 *     audit entry are written in ONE database transaction. A crash halfway
 *     leaves nothing behind rather than a balance that disagrees with history.
 *
 *  2. SERIALISED PER ACCOUNT. The balance is moved by a single UPDATE that
 *     computes the new value from the stored one (`balance = balance + delta`)
 *     while holding the row-exclusive lock that UPDATE itself takes. The
 *     application never reads a balance, decides, and writes it back — which
 *     is the read-modify-write window through which two concurrent deposits
 *     both see the same starting figure and the second erases the first. That
 *     lost update is the most common way savings systems quietly lose money,
 *     and it is proven absent by the concurrency tests.
 *
 *  3. GAPLESS AND ORDERED. Each row takes `lastSequence + 1`, protected by a
 *     unique index on (savingsAccountId, sequence). Two writers cannot claim
 *     the same slot, and a missing number is visible evidence of tampering.
 *
 *  4. RECONSTRUCTABLE. Every row stores balanceBefore and balanceAfter, so the
 *     cached balance can be re-derived and verified against history at any
 *     time. `verifyAccountIntegrity` does exactly that.
 *
 *  5. APPEND-ONLY. Nothing here updates or deletes a posted row. A mistake is
 *     corrected by posting a reversal that points back at the original, and
 *     both survive.
 */

// Ambiguous characters (0/O, 1/I) removed: these references get read aloud
// over the phone and copied off printed statements.
const referenceId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);

export interface PostTransactionInput {
  savingsAccountId: string;
  type: TransactionType;
  direction: TransactionDirection;
  /// Always positive. `direction` carries the sign.
  amount: string | Prisma.Decimal;
  channel?: PaymentChannel;
  description?: string | null;
  externalReference?: string | null;

  // Source linkage — what caused this movement.
  paymentId?: string | null;
  withdrawalId?: string | null;
  loanId?: string | null;
  loanTransactionId?: string | null;

  /// Null for system-posted rows (reconciliation, cron, interest accrual).
  postedById?: string | null;
  /// Mandatory for ADJUSTMENT. Enforced below, not merely documented.
  adjustmentReason?: string | null;

  valueDate?: Date;
  /// Permit the balance to go negative. Only fee/penalty postings should.
  allowOverdraft?: boolean;
}

export interface PostedTransaction {
  id: string;
  reference: string;
  sequence: number;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  type: TransactionType;
  direction: TransactionDirection;
  createdAt: Date;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ACCOUNT_NOT_FOUND"
      | "ACCOUNT_CLOSED"
      | "INSUFFICIENT_FUNDS"
      | "INVALID_AMOUNT"
      | "REASON_REQUIRED"
      | "DUPLICATE_SOURCE"
      | "ALREADY_REMITTED"
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

/**
 * Posts one movement to a member's savings ledger.
 *
 * MUST run inside a transaction. Pass `tx` when composing with other writes —
 * a loan disbursement, for instance, posts a loan ledger row and a savings
 * credit that must both succeed or both fail. When `tx` is omitted, one is
 * opened for this posting alone.
 */
export async function postSavingsTransaction(
  input: PostTransactionInput,
  tx?: TxClient
): Promise<PostedTransaction> {
  if (tx) return postWithin(tx, input);
  return withFinancialTransaction((client) => postWithin(client, input));
}

async function postWithin(
  tx: TxClient,
  input: PostTransactionInput
): Promise<PostedTransaction> {
  const amount = toMoney(input.amount);

  // Amounts are unsigned; direction decides which way the balance moves.
  // Accepting a negative here would let a "deposit" silently debit an account.
  if (!isPositive(amount)) {
    throw new LedgerError(
      `Transaction amount must be greater than zero (received ${toMoneyString(amount)})`,
      "INVALID_AMOUNT"
    );
  }

  if (input.type === "ADJUSTMENT" && !input.adjustmentReason?.trim()) {
    throw new LedgerError(
      "A manual adjustment requires a written reason",
      "REASON_REQUIRED"
    );
  }

  // A payment may only ever produce one ledger row. The unique index on
  // savings_transactions.paymentId is the real guarantee; this check turns the
  // race we lose into a clear error instead of a constraint violation.
  if (input.paymentId) {
    const existing = await tx.savingsTransaction.findUnique({
      where: { paymentId: input.paymentId },
      select: { id: true, reference: true },
    });
    if (existing) {
      throw new LedgerError(
        `Payment ${input.paymentId} has already been posted as ${existing.reference}`,
        "DUPLICATE_SOURCE"
      );
    }
  }

  // ---------------------------------------------------------------------
  // THE CRITICAL SECTION — one statement.
  //
  // This single UPDATE takes the row-exclusive lock, enforces the overdraft
  // guard, claims the next sequence number, moves the balance and bumps the
  // relevant running total, then returns the before and after values.
  //
  // It was four separate round trips (lock, read, insert, update). Under
  // contention every writer queues on the same row lock while holding a pool
  // connection, so each extra round trip multiplies across the whole queue —
  // twenty simultaneous deposits blew past the transaction timeout purely on
  // network latency. Collapsing the balance work into one statement keeps the
  // lock held for a single round trip instead of three.
  //
  // The guard lives in the WHERE clause rather than in application code, so
  // the check and the write are indivisible: there is no window between
  // "balance is sufficient" and "balance has been debited".
  // ---------------------------------------------------------------------
  const delta = input.direction === "CREDIT" ? amount : amount.negated();
  const totalsColumn = rollingTotalColumn(input.type);

  const totalsUpdate = totalsColumn
    ? Prisma.sql`, ${Prisma.raw(`"${totalsColumn}"`)} = ${Prisma.raw(`"${totalsColumn}"`)} + ${toMoneyString(amount)}::numeric`
    : Prisma.empty;

  const overdraftGuard = input.allowOverdraft
    ? Prisma.empty
    : Prisma.sql`AND balance + ${toMoneyString(delta)}::numeric >= 0`;

  const updated = await tx.$queryRaw<
    {
      id: string;
      associationId: string;
      memberId: string;
      currency: string;
      balanceBefore: string;
      balanceAfter: string;
      sequence: number;
    }[]
  >`
    UPDATE savings_accounts
    SET balance = balance + ${toMoneyString(delta)}::numeric,
        "lastSequence" = "lastSequence" + 1,
        "lastTransactionAt" = now(),
        "updatedAt" = now()
        ${totalsUpdate}
    WHERE id = ${input.savingsAccountId}
      AND "isActive" = true
      ${overdraftGuard}
    RETURNING
      id,
      "associationId",
      "memberId",
      currency,
      (balance - ${toMoneyString(delta)}::numeric)::text AS "balanceBefore",
      balance::text                                      AS "balanceAfter",
      "lastSequence"                                     AS sequence
  `;

  const account = updated[0];

  // Zero rows means the WHERE clause rejected it. Work out which condition
  // failed so the caller gets a precise error rather than "nothing happened".
  if (!account) {
    await explainFailedUpdate(tx, input.savingsAccountId, amount);
  }

  const balanceBefore = toMoney(account.balanceBefore);
  const balanceAfter = toMoney(account.balanceAfter);
  const sequence = account.sequence;
  const reference = buildReference(input.type);

  const transaction = await tx.savingsTransaction.create({
    data: {
      associationId: account.associationId,
      savingsAccountId: account.id,
      memberId: account.memberId,
      sequence,
      reference,
      type: input.type,
      direction: input.direction,
      status: "COMPLETED",
      channel: input.channel ?? "INTERNAL_TRANSFER",
      amount: toMoneyString(amount),
      balanceBefore: toMoneyString(balanceBefore),
      balanceAfter: toMoneyString(balanceAfter),
      currency: account.currency,
      description: input.description ?? null,
      externalReference: input.externalReference ?? null,
      paymentId: input.paymentId ?? null,
      withdrawalId: input.withdrawalId ?? null,
      loanId: input.loanId ?? null,
      loanTransactionId: input.loanTransactionId ?? null,
      postedById: input.postedById ?? null,
      adjustmentReason: input.adjustmentReason ?? null,
      valueDate: input.valueDate ?? new Date(),
    },
    select: {
      id: true,
      reference: true,
      sequence: true,
      createdAt: true,
    },
  });

  ledgerLogger.info(
    {
      reference,
      accountId: account.id,
      memberId: account.memberId,
      type: input.type,
      direction: input.direction,
      amount: toMoneyString(amount),
      balanceAfter: toMoneyString(balanceAfter),
      sequence,
    },
    "ledger entry posted"
  );

  // Audited inside the same transaction: if the posting rolls back, so does
  // its audit trail, and the two can never disagree.
  await recordAudit(
    {
      action: auditActionFor(input.type),
      entityType: "SavingsTransaction",
      entityId: transaction.id,
      associationId: account.associationId,
      newValue: {
        reference,
        type: input.type,
        direction: input.direction,
        amount: toMoneyString(amount),
        balanceBefore: toMoneyString(balanceBefore),
        balanceAfter: toMoneyString(balanceAfter),
      },
      reason: input.adjustmentReason ?? null,
      metadata: {
        memberId: account.memberId,
        savingsAccountId: account.id,
        paymentId: input.paymentId ?? undefined,
        channel: input.channel ?? "INTERNAL_TRANSFER",
      },
      severity: input.type === "ADJUSTMENT" ? "CRITICAL" : "INFO",
    },
    input.postedById ? { id: input.postedById } : null,
    tx
  );

  return {
    id: transaction.id,
    reference: transaction.reference,
    sequence: transaction.sequence,
    amount: toMoneyString(amount),
    balanceBefore: toMoneyString(balanceBefore),
    balanceAfter: toMoneyString(balanceAfter),
    type: input.type,
    direction: input.direction,
    createdAt: transaction.createdAt,
  };
}

/**
 * Reverses a posted transaction by contra entry.
 *
 * The original row is never touched beyond being marked REVERSED — it stays
 * readable on the statement, alongside the reversal that cancels it. Deleting
 * or editing it would destroy the record of what the member was originally
 * told, which is the whole reason an auditor trusts a ledger.
 */
export async function reverseSavingsTransaction(
  transactionId: string,
  reason: string,
  reversedById: string
): Promise<PostedTransaction> {
  return withFinancialTransaction((tx) =>
    reverseSavingsTransactionWithin(tx, { transactionId, reason, reversedById })
  );
}

/**
 * `reverseSavingsTransaction` inside a transaction the caller already holds,
 * for a reversal that must land together with other writes.
 *
 * The contra entry itself touches no running total (see `rollingTotalColumn`),
 * so the total the ORIGINAL row added to is taken back down here, where its
 * type is known. Without that, a reversed deposit would still count as
 * contributed and a refunded fine would still count as a fee taken.
 *
 * A reversed service fee also cancels its PlatformFeeCharge, so the money stops
 * being owed to the operator. One already paid over cannot be reversed here.
 *
 * Reversing a DEPOSIT lowers `totalDeposits` but does not void the service fee
 * charged on the days it paid for; that needs the association's rulebook and
 * is done by the balance correction in balance-corrections.ts.
 */
export async function reverseSavingsTransactionWithin(
  tx: TxClient,
  params: {
    transactionId: string;
    reason: string;
    reversedById: string;
    description?: string;
  }
): Promise<PostedTransaction> {
  const { transactionId, reason, reversedById } = params;
  if (!reason?.trim()) {
    throw new LedgerError("A reversal requires a written reason", "REASON_REQUIRED");
  }

  const original = await tx.savingsTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      savingsAccountId: true,
      associationId: true,
      reference: true,
      type: true,
      direction: true,
      amount: true,
      status: true,
      reversedBy: { select: { id: true } },
      platformFeeCharge: { select: { id: true, status: true, remittedAt: true } },
    },
  });

  if (!original) {
    throw new LedgerError("Transaction not found", "ACCOUNT_NOT_FOUND");
  }
  if (original.status === "REVERSED" || original.reversedBy) {
    throw new LedgerError(
      `Transaction ${original.reference} has already been reversed`,
      "DUPLICATE_SOURCE"
    );
  }
  const feeCharge =
    original.platformFeeCharge?.status === "CHARGED" ? original.platformFeeCharge : null;
  if (feeCharge?.remittedAt) {
    throw new LedgerError(
      `The service fee ${original.reference} has already been paid over to the platform operator`,
      "ALREADY_REMITTED"
    );
  }

  const reversal = await postWithin(tx, {
    savingsAccountId: original.savingsAccountId,
    type: "REVERSAL",
    // Opposite direction, same amount — that is what makes it a contra entry.
    direction: original.direction === "CREDIT" ? "DEBIT" : "CREDIT",
    amount: original.amount,
    description: params.description ?? `Reversal of ${original.reference}: ${reason}`,
    postedById: reversedById,
    adjustmentReason: reason,
    // A reversal must always be postable, even if it takes the balance
    // negative — refusing to undo an erroneous credit because the member has
    // since spent it would leave the books wrong permanently.
    allowOverdraft: true,
  });

  // Whitelisted column, as in postWithin. Floored at zero so a total that was
  // already understated (rows posted before totals existed) cannot go negative.
  const totalsColumn = rollingTotalColumn(original.type);
  if (totalsColumn) {
    const column = Prisma.raw(`"${totalsColumn}"`);
    await tx.$executeRaw`
      UPDATE savings_accounts
      SET ${column} = GREATEST(0, ${column} - ${toMoneyString(original.amount)}::numeric)
      WHERE id = ${original.savingsAccountId}
    `;
  }

  await tx.savingsTransaction.update({
    where: { id: reversal.id },
    data: { reversalOfId: original.id, reversalReason: reason },
  });

  await tx.savingsTransaction.update({
    where: { id: original.id },
    data: {
      status: "REVERSED",
      reversedById,
      reversalReason: reason,
    },
  });

  if (feeCharge) {
    await voidPlatformFeeCharge(tx, feeCharge.id, `Fee ${original.reference} reversed: ${reason}`);
  }

  await recordAudit(
    {
      action: AUDIT_ACTIONS.SAVINGS_TRANSACTION_REVERSED,
      entityType: "SavingsTransaction",
      entityId: original.id,
      associationId: original.associationId,
      oldValue: { status: original.status },
      newValue: { status: "REVERSED", reversalReference: reversal.reference },
      reason,
      severity: "CRITICAL",
    },
    { id: reversedById },
    tx
  );

  return reversal;
}

/**
 * Marks a service-fee charge REVERSED, so it is no longer owed to the operator.
 *
 * `coveredThroughDay` is unique per member whatever the status, so a voided
 * charge keeping its day would block the fee run from charging that day again
 * once the member really pays it — the collision is swallowed as "already
 * charged", forever. Voided charges therefore move to negative days, which the
 * fee run never reaches; the original range is kept in the waiver reason.
 */
export async function voidPlatformFeeCharge(tx: TxClient, chargeId: string, reason: string) {
  const charge = await tx.platformFeeCharge.findUniqueOrThrow({
    where: { id: chargeId },
    select: { memberId: true, coveredThroughDay: true, daysCovered: true },
  });
  const lowest = await tx.platformFeeCharge.aggregate({
    where: { memberId: charge.memberId },
    _min: { coveredThroughDay: true },
  });
  const parkedDay = Math.min(0, lowest._min.coveredThroughDay ?? 0) - 1;
  const firstDay = charge.coveredThroughDay - charge.daysCovered + 1;

  await tx.platformFeeCharge.update({
    where: { id: chargeId },
    data: {
      status: "REVERSED",
      coveredThroughDay: parkedDay,
      waiverReason: `${reason} (covered days ${firstDay}–${charge.coveredThroughDay})`,
    },
  });
}

/**
 * Re-derives an account's balance from its ledger and compares it with the
 * cached value.
 *
 * This is the check that proves the invariant rather than assuming it. Run by
 * the nightly job and available to a super admin on demand; a discrepancy is a
 * serious incident, not a rounding artefact.
 */
export async function verifyAccountIntegrity(savingsAccountId: string): Promise<{
  ok: boolean;
  cachedBalance: string;
  derivedBalance: string;
  difference: string;
  transactionCount: number;
  sequenceGaps: number[];
  brokenChainAt: number | null;
}> {
  const account = await prisma_findAccount(savingsAccountId);

  const transactions = await prisma_findTransactions(savingsAccountId);

  let derived = toMoney(0);
  const seenSequences: number[] = [];
  let brokenChainAt: number | null = null;

  for (const entry of transactions) {
    seenSequences.push(entry.sequence);

    // A reversed row and its contra entry both remain in the ledger and both
    // still moved the balance at the time. Replaying every row in order is
    // therefore correct — skipping reversed rows would double-count.
    derived =
      entry.direction === "CREDIT"
        ? add(derived, entry.amount)
        : subtract(derived, entry.amount);

    // Each row's balanceAfter must equal the running total. A mismatch means
    // a row was edited after the fact.
    if (brokenChainAt === null && !toMoney(entry.balanceAfter).equals(derived)) {
      brokenChainAt = entry.sequence;
    }
  }

  const gaps: number[] = [];
  for (let expected = 1; expected <= (account?.lastSequence ?? 0); expected++) {
    if (!seenSequences.includes(expected)) gaps.push(expected);
  }

  const cached = toMoney(account?.balance ?? 0);
  const difference = subtract(cached, derived);

  return {
    ok: difference.isZero() && gaps.length === 0 && brokenChainAt === null,
    cachedBalance: toMoneyString(cached),
    derivedBalance: toMoneyString(derived),
    difference: toMoneyString(difference),
    transactionCount: transactions.length,
    sequenceGaps: gaps,
    brokenChainAt,
  };
}

// Helpers -------------------------------------------------------------------

async function prisma_findAccount(id: string) {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.savingsAccount.findUnique({
    where: { id },
    select: { balance: true, lastSequence: true },
  });
}

async function prisma_findTransactions(savingsAccountId: string) {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.savingsTransaction.findMany({
    where: { savingsAccountId },
    orderBy: { sequence: "asc" },
    select: {
      sequence: true,
      direction: true,
      amount: true,
      balanceAfter: true,
      status: true,
    },
  });
}

/**
 * Which running total this movement contributes to.
 *
 * These are convenience aggregates for dashboards — derived data. If one ever
 * disagrees with the ledger, the ledger is right.
 *
 * Returns a column name that is interpolated into SQL, so the return values
 * are a fixed whitelist and never derived from input. A reversal deliberately
 * touches no total: which one the original contributed to is not knowable from
 * the reversal alone, and guessing would corrupt the figure. The original's
 * total is taken back down by `reverseSavingsTransactionWithin`, which knows.
 */
function rollingTotalColumn(type: TransactionType): string | null {
  switch (type) {
    case "DEPOSIT":
      return "totalDeposits";
    case "WITHDRAWAL":
      return "totalWithdrawals";
    case "INTEREST":
      return "totalInterest";
    case "FEE":
    case "PENALTY":
      return "totalFees";
    default:
      return null;
  }
}

/**
 * Called when the balance UPDATE matched no rows. Reads the account back to
 * report precisely which precondition failed, rather than leaving the caller
 * with an unexplained no-op.
 *
 * Always throws.
 */
async function explainFailedUpdate(
  tx: TxClient,
  savingsAccountId: string,
  amount: Prisma.Decimal
): Promise<never> {
  const account = await tx.savingsAccount.findUnique({
    where: { id: savingsAccountId },
    select: { isActive: true, balance: true },
  });

  if (!account) {
    throw new LedgerError(
      `Savings account ${savingsAccountId} does not exist`,
      "ACCOUNT_NOT_FOUND"
    );
  }

  if (!account.isActive) {
    throw new LedgerError("This savings account is closed", "ACCOUNT_CLOSED");
  }

  throw new LedgerError(
    `Insufficient funds: balance ${toMoneyString(account.balance)} cannot cover ${toMoneyString(amount)}`,
    "INSUFFICIENT_FUNDS"
  );
}

function auditActionFor(type: TransactionType): typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS] {
  switch (type) {
    case "DEPOSIT":
      return AUDIT_ACTIONS.SAVINGS_DEPOSIT_POSTED;
    case "WITHDRAWAL":
      return AUDIT_ACTIONS.SAVINGS_WITHDRAWAL_POSTED;
    case "ADJUSTMENT":
      return AUDIT_ACTIONS.BALANCE_ADJUSTED;
    case "REVERSAL":
      return AUDIT_ACTIONS.SAVINGS_TRANSACTION_REVERSED;
    default:
      return AUDIT_ACTIONS.SAVINGS_DEPOSIT_POSTED;
  }
}

/** e.g. TXN-2608-K7M2QRXT4W — sortable by period, unique by suffix. */
function buildReference(type: TransactionType): string {
  const now = new Date();
  const period = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = REFERENCE_PREFIX[type] ?? "TXN";
  return `${prefix}-${period}-${referenceId()}`;
}

const REFERENCE_PREFIX: Partial<Record<TransactionType, string>> = {
  DEPOSIT: "DEP",
  WITHDRAWAL: "WDR",
  LOAN_DISBURSEMENT: "DSB",
  LOAN_REPAYMENT: "RPY",
  PENALTY: "PEN",
  INTEREST: "INT",
  FEE: "FEE",
  ADJUSTMENT: "ADJ",
  REVERSAL: "REV",
};

/** Exported for the loan module, which mints its own references. */
export function buildTransactionReference(prefix: string): string {
  const now = new Date();
  const period = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${period}-${referenceId()}`;
}

/** Available balance = balance − funds pledged against loans or pending payouts. */
export function availableBalance(
  balance: string | Prisma.Decimal,
  lockedBalance: string | Prisma.Decimal
): string {
  const available = subtract(balance, lockedBalance);
  return toMoneyString(gt(available, 0) ? available : 0);
}
