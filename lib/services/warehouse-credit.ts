import "server-only";
import { customAlphabet } from "nanoid";
import { Prisma, prisma, withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  add,
  allocate,
  gt,
  isPositive,
  min,
  multiply,
  subtract,
  toMoney,
  toMoneyString,
  ZERO,
} from "@/lib/money";
import { postSavingsTransaction } from "@/lib/services/ledger";
import { getPolicy, type AssociationPolicy } from "@/lib/services/rulebook";
import type {
  InstallmentStatus,
  PaymentChannel,
  WarehouseCreditStatus,
} from "@/lib/generated/prisma/enums";

/**
 * GOODS TAKEN TODAY, PAID FOR OVER THREE MONTHS.
 *
 * The association buys fabric by the roll and machines by the crate, and a
 * member who needs one rarely has its price on the day. What happened before
 * this module was an arrangement: the storekeeper let the machine go, someone
 * wrote a date in a notebook, and the association discovered months later that
 * it had financed a workshop for nothing and had no record of agreeing to.
 *
 * THIS FILE IS THE ARRANGEMENT, WRITTEN DOWN. Its shape follows
 * lib/services/warehouse.ts and lib/services/ledger.ts, because the failure
 * modes are the same ones and the answers therefore should be too:
 *
 *  1. TERMS ARE FROZEN WHEN THE CREDIT OPENS. The rate, the term, the fine
 *     percentage and where the interest goes are all copied onto the credit
 *     row from the rulebook at that moment. A committee that raises the fine
 *     in June has not thereby raised it on a member who took a machine in
 *     March, and the record can still explain what it charged and why.
 *
 *  2. THE PAYMENT LOG IS APPEND-ONLY, with a monotonic per-credit sequence
 *     claimed in the same statement that moves the balances. Two officers
 *     recording the same member's payment at once cannot both take slot 4.
 *
 *  3. ALLOCATION ORDER IS FIXED AND VISIBLE: fines first, then interest, then
 *     the goods. Stored on every payment rather than recomputed, so a member
 *     can be shown the arithmetic of a payment made a year ago.
 *
 *  4. A FINE IS ASSESSED AT MOST ONCE PER MISSED MONTH. The unique constraint
 *     on WarehouseCreditFine.installmentId is what guarantees it — the job may
 *     run twice, or run again after a crash, and a member is not fined twice
 *     for one month.
 *
 * WHAT THE INTEREST IS, AND IS NOT. The association's cash-lending rule
 * charges 2% a MONTH and splits it, half back into the borrower's own savings.
 * This is 2% ONCE, on the value of the goods, for the whole term, and none of
 * it comes back to the member: it is what the association earns for having
 * paid a supplier for stock the member is using before paying for it. The two
 * must not be confused, which is why they live in different files and read
 * from different rules.
 */

// Same alphabet as the savings and stock ledgers: these references get read
// aloud over the phone and copied off printed receipts.
const referenceId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);

function buildCreditReference(prefix: "WHC" | "WCP" | "WCF"): string {
  const now = new Date();
  const period = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${period}-${referenceId()}`;
}

export class WarehouseCreditError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "INVALID_AMOUNT"
      | "REASON_REQUIRED"
      | "NO_SAVINGS_ACCOUNT"
      | "ALREADY_EXISTS"
  ) {
    super(message);
    this.name = "WarehouseCreditError";
  }
}

/** Midnight, so a due date compares by day rather than by the hour it was made. */
function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * The same day-of-month, `months` later.
 *
 * Clamped to the end of the target month, so goods taken on 31 January fall
 * due on 28 February rather than silently rolling into March — which would
 * hand the member an extra day of credit and put the fine on the wrong month.
 */
export function addMonthsClamped(from: Date, months: number): Date {
  const date = startOfDay(from);
  const day = date.getDate();
  const shifted = new Date(date);
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + months);

  const lastDayOfMonth = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0
  ).getDate();

  shifted.setDate(Math.min(day, lastDayOfMonth));
  return startOfDay(shifted);
}

/** Whole days from `from` to `to`, floored at zero. */
function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// ---------------------------------------------------------------------------
// The quote: what a credit would cost, before anyone commits to it
// ---------------------------------------------------------------------------

export interface CreditScheduleRow {
  installmentNumber: number;
  dueDate: Date;
  principalDue: string;
  interestDue: string;
  totalDue: string;
  balanceAfter: string;
}

export interface CreditQuote {
  goodsValue: string;
  interestRate: string;
  interestAmount: string;
  totalPayable: string;
  termMonths: number;
  fineRate: string;
  fineGraceDays: number;
  firstDueDate: Date;
  maturityDate: Date;
  schedule: CreditScheduleRow[];
}

/**
 * Prices a credit without writing anything.
 *
 * Pure, and exported, because three different callers need the same numbers:
 * the officer's form previews them before issuing, the member's page explains
 * them afterwards, and `openCredit` uses them to write the schedule. Three
 * implementations of one sum would eventually disagree, and the member would
 * be the one to find out.
 */
export function quoteCredit(
  policy: AssociationPolicy,
  goodsValue: string,
  startedAt: Date = new Date()
): CreditQuote {
  const principal = toMoney(goodsValue);
  const termMonths = Math.max(1, policy.warehouseCreditTermMonths);

  // FLAT, AND ONCE. Not compounded and not per month — see the file header.
  const interestAmount = toMoney(
    multiply(principal, toMoney(policy.warehouseCreditInterest).dividedBy(100))
  );

  const principalParts = allocate(principal, termMonths);
  const interestParts = allocate(interestAmount, termMonths);

  const schedule: CreditScheduleRow[] = [];
  let balance = principal;

  for (let i = 0; i < termMonths; i++) {
    const principalDue = principalParts[i];
    const interestDue = interestParts[i];
    balance = subtract(balance, principalDue);

    schedule.push({
      installmentNumber: i + 1,
      dueDate: addMonthsClamped(startedAt, i + 1),
      principalDue: toMoneyString(principalDue),
      interestDue: toMoneyString(interestDue),
      totalDue: toMoneyString(add(principalDue, interestDue)),
      // Floored at zero: the last row must read zero, not a rounding tail.
      balanceAfter: toMoneyString(balance.isNegative() ? ZERO : balance),
    });
  }

  return {
    goodsValue: toMoneyString(principal),
    interestRate: policy.warehouseCreditInterest,
    interestAmount: toMoneyString(interestAmount),
    totalPayable: toMoneyString(add(principal, interestAmount)),
    termMonths,
    fineRate: policy.warehouseCreditFineRate,
    fineGraceDays: policy.warehouseCreditFineGraceDays,
    firstDueDate: schedule[0].dueDate,
    maturityDate: schedule[schedule.length - 1].dueDate,
    schedule,
  };
}

/** Prices a credit for one association, reading its live rulebook. */
export async function quoteCreditForAssociation(
  associationId: string,
  goodsValue: string,
  startedAt?: Date
): Promise<CreditQuote> {
  const policy = await getPolicy(associationId);
  return quoteCredit(policy, goodsValue, startedAt);
}

// ---------------------------------------------------------------------------
// Opening a credit
// ---------------------------------------------------------------------------

/**
 * Opens the instalment arrangement for one issuance of goods.
 *
 * MUST BE CALLED INSIDE THE SAME TRANSACTION THAT CREATED THE ISSUANCE.
 * Goods that have left the store with no credit against them are goods nobody
 * owes for, and a second transaction that fails leaves exactly that. The
 * caller in lib/services/warehouse.ts passes its own `tx` for this reason.
 */
export async function openCreditWithin(
  tx: TxClient,
  params: {
    policy: AssociationPolicy;
    associationId: string;
    memberId: string;
    issuanceId: string;
    goodsValue: string;
    currency: string;
    actorId: string | null;
    startedAt?: Date;
    note?: string | null;
  }
): Promise<{ id: string; reference: string; quote: CreditQuote }> {
  const startedAt = params.startedAt ?? new Date();
  const quote = quoteCredit(params.policy, params.goodsValue, startedAt);

  if (!isPositive(quote.goodsValue)) {
    throw new WarehouseCreditError(
      "Goods with no value cannot be sold on credit",
      "INVALID_AMOUNT"
    );
  }

  const credit = await tx.warehouseCredit.create({
    data: {
      associationId: params.associationId,
      memberId: params.memberId,
      issuanceId: params.issuanceId,
      reference: buildCreditReference("WHC"),
      status: "ACTIVE",

      goodsValue: quote.goodsValue,
      interestRate: quote.interestRate,
      interestAmount: quote.interestAmount,
      fineRate: quote.fineRate,
      fineGraceDays: quote.fineGraceDays,
      termMonths: quote.termMonths,
      // The standing rule. Stored per row so it stays true of THIS credit even
      // if the association later resolves to share warehouse interest.
      interestToAssociation: true,
      totalPayable: quote.totalPayable,
      currency: params.currency,

      principalOutstanding: quote.goodsValue,
      interestOutstanding: quote.interestAmount,
      penaltyOutstanding: "0.00",

      startedAt,
      firstDueDate: quote.firstDueDate,
      maturityDate: quote.maturityDate,

      note: params.note?.trim() || null,
      openedById: params.actorId,
    },
    select: { id: true, reference: true },
  });

  await tx.warehouseCreditInstallment.createMany({
    data: quote.schedule.map((row) => ({
      creditId: credit.id,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      status: "UPCOMING" as InstallmentStatus,
      principalDue: row.principalDue,
      interestDue: row.interestDue,
      totalDue: row.totalDue,
      balanceAfter: row.balanceAfter,
    })),
  });

  return { id: credit.id, reference: credit.reference, quote };
}

// ---------------------------------------------------------------------------
// Taking a payment
// ---------------------------------------------------------------------------

interface InstallmentRow {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  status: InstallmentStatus;
  principalDue: unknown;
  interestDue: unknown;
  penaltyDue: unknown;
  principalPaid: unknown;
  interestPaid: unknown;
  penaltyPaid: unknown;
}

export interface RecordCreditPaymentResult {
  paymentId: string;
  reference: string;
  amount: string;
  penaltyPortion: string;
  interestPortion: string;
  principalPortion: string;
  balanceAfter: string;
  completed: boolean;
}

/**
 * Records money against a credit, oldest instalment first.
 *
 * WITHIN each instalment the order is fine, then interest, then goods. That
 * order is a policy choice and not an accident: settling the fine first means
 * a member who pays something stops the arrears growing, and leaving the goods
 * until last means the association's own cost is recovered last, which is the
 * risk it agreed to carry when it let the machine go.
 *
 * A payment larger than everything owed is refused rather than trimmed. An
 * officer typing one digit too many should be told, not silently credited with
 * a figure the member never handed over.
 */
export async function recordCreditPayment(params: {
  associationId: string;
  actorId: string;
  creditId: string;
  amount: string;
  fromSavings: boolean;
  channel?: PaymentChannel | null;
  note?: string | null;
  occurredAt?: Date;
}): Promise<RecordCreditPaymentResult> {
  const amount = toMoney(params.amount);

  if (!isPositive(amount)) {
    throw new WarehouseCreditError(
      "Enter an amount greater than zero",
      "INVALID_AMOUNT"
    );
  }

  const result = await withFinancialTransaction(async (tx) => {
    // Locked for the duration: the sequence claim, the balance moves and the
    // instalment updates below must all see one consistent position.
    const [credit] = await tx.$queryRaw<
      {
        id: string;
        memberId: string;
        reference: string;
        status: WarehouseCreditStatus;
        currency: string;
        lastSequence: number;
        principalOutstanding: string;
        interestOutstanding: string;
        penaltyOutstanding: string;
        interestToAssociation: boolean;
      }[]
    >`
      SELECT id, "memberId", reference, status, currency, "lastSequence",
             "principalOutstanding"::text, "interestOutstanding"::text,
             "penaltyOutstanding"::text, "interestToAssociation"
      FROM warehouse_credits
      WHERE id = ${params.creditId} AND "associationId" = ${params.associationId}
      FOR UPDATE
    `;

    if (!credit) {
      throw new WarehouseCreditError("That credit was not found", "NOT_FOUND");
    }

    if (
      credit.status === "COMPLETED" ||
      credit.status === "CANCELLED" ||
      credit.status === "WRITTEN_OFF"
    ) {
      throw new WarehouseCreditError(
        "That credit is closed, so no more can be paid against it",
        "INVALID_STATE"
      );
    }

    const totalOwed = add(
      credit.principalOutstanding,
      credit.interestOutstanding,
      credit.penaltyOutstanding
    );

    if (!isPositive(totalOwed)) {
      throw new WarehouseCreditError(
        "Nothing is owed on this credit",
        "INVALID_STATE"
      );
    }

    if (gt(amount, totalOwed)) {
      throw new WarehouseCreditError(
        `Only ${toMoneyString(totalOwed)} is still owed on this credit`,
        "INVALID_AMOUNT"
      );
    }

    const installments = (await tx.warehouseCreditInstallment.findMany({
      where: { creditId: credit.id, status: { not: "WAIVED" } },
      orderBy: { installmentNumber: "asc" },
      select: {
        id: true,
        installmentNumber: true,
        dueDate: true,
        status: true,
        principalDue: true,
        interestDue: true,
        penaltyDue: true,
        principalPaid: true,
        interestPaid: true,
        penaltyPaid: true,
      },
    })) as unknown as InstallmentRow[];

    // --- Allocate ---------------------------------------------------------

    let remaining = amount;
    let penaltyTotal = ZERO;
    let interestTotal = ZERO;
    let principalTotal = ZERO;

    const touched: {
      row: InstallmentRow;
      penalty: ReturnType<typeof toMoney>;
      interest: ReturnType<typeof toMoney>;
      principal: ReturnType<typeof toMoney>;
    }[] = [];

    for (const row of installments) {
      if (!isPositive(remaining)) break;

      const penaltyOwed = subtract(row.penaltyDue as string, row.penaltyPaid as string);
      const interestOwed = subtract(row.interestDue as string, row.interestPaid as string);
      const principalOwed = subtract(
        row.principalDue as string,
        row.principalPaid as string
      );

      const penalty = min(remaining, penaltyOwed.isNegative() ? ZERO : penaltyOwed);
      remaining = subtract(remaining, penalty);

      const interest = min(remaining, interestOwed.isNegative() ? ZERO : interestOwed);
      remaining = subtract(remaining, interest);

      const principal = min(
        remaining,
        principalOwed.isNegative() ? ZERO : principalOwed
      );
      remaining = subtract(remaining, principal);

      const rowTotal = add(penalty, interest, principal);
      if (!isPositive(rowTotal)) continue;

      penaltyTotal = add(penaltyTotal, penalty);
      interestTotal = add(interestTotal, interest);
      principalTotal = add(principalTotal, principal);

      touched.push({ row, penalty, interest, principal });
    }

    // Everything owed lives on an instalment, so a leftover means the header
    // and its instalments disagree. Refusing is the only safe answer: the
    // alternative is a payment that lands nowhere and a member credited for
    // money the schedule cannot account for.
    if (isPositive(remaining)) {
      throw new WarehouseCreditError(
        "This payment could not be matched to the instalment schedule. Ask an administrator to check this credit.",
        "INVALID_STATE"
      );
    }

    // --- Take the money ---------------------------------------------------

    let savingsTransactionId: string | null = null;

    if (params.fromSavings) {
      const account = await tx.savingsAccount.findFirst({
        where: { memberId: credit.memberId, isActive: true },
        orderBy: { openedAt: "asc" },
        select: { id: true },
      });

      if (!account) {
        throw new WarehouseCreditError(
          "This member has no active savings account to take the payment from",
          "NO_SAVINGS_ACCOUNT"
        );
      }

      const posted = await postSavingsTransaction(
        {
          savingsAccountId: account.id,
          type: "FEE",
          direction: "DEBIT",
          amount: toMoneyString(amount),
          description: `Warehouse credit ${credit.reference}`,
          externalReference: credit.reference,
          postedById: params.actorId,
          // A member must never be driven into a negative balance to pay an
          // instalment. If the money is not there the payment fails and an
          // officer collects it in cash instead — same rule as settling an
          // outright purchase in lib/services/warehouse.ts.
          allowOverdraft: false,
        },
        tx
      );

      savingsTransactionId = posted.id;
    }

    // --- Move the position ------------------------------------------------

    const principalAfter = subtract(credit.principalOutstanding, principalTotal);
    const interestAfter = subtract(credit.interestOutstanding, interestTotal);
    const penaltyAfter = subtract(credit.penaltyOutstanding, penaltyTotal);
    const balanceAfter = add(principalAfter, interestAfter, penaltyAfter);

    const occurredAt = params.occurredAt ?? new Date();
    const completed = !isPositive(balanceAfter);
    const sequence = credit.lastSequence + 1;

    const payment = await tx.warehouseCreditPayment.create({
      data: {
        associationId: params.associationId,
        creditId: credit.id,
        sequence,
        reference: buildCreditReference("WCP"),
        amount: toMoneyString(amount),
        penaltyPortion: toMoneyString(penaltyTotal),
        interestPortion: toMoneyString(interestTotal),
        principalPortion: toMoneyString(principalTotal),
        // The whole of the interest under the standing rule. Read from the
        // credit's own frozen flag rather than from today's policy.
        associationIncome: credit.interestToAssociation
          ? toMoneyString(interestTotal)
          : "0.00",
        balanceAfter: toMoneyString(balanceAfter),
        currency: credit.currency,
        savingsTransactionId,
        channel: params.fromSavings ? null : (params.channel ?? null),
        note: params.note?.trim() || null,
        recordedById: params.actorId,
        occurredAt,
      },
      select: { id: true, reference: true },
    });

    for (const entry of touched) {
      await tx.warehouseCreditAllocation.create({
        data: {
          paymentId: payment.id,
          installmentId: entry.row.id,
          penaltyAmount: toMoneyString(entry.penalty),
          interestAmount: toMoneyString(entry.interest),
          principalAmount: toMoneyString(entry.principal),
          totalAmount: toMoneyString(
            add(entry.penalty, entry.interest, entry.principal)
          ),
        },
      });

      const penaltyPaid = add(entry.row.penaltyPaid as string, entry.penalty);
      const interestPaid = add(entry.row.interestPaid as string, entry.interest);
      const principalPaid = add(entry.row.principalPaid as string, entry.principal);

      const fullyPaid =
        !isPositive(subtract(entry.row.penaltyDue as string, penaltyPaid)) &&
        !isPositive(subtract(entry.row.interestDue as string, interestPaid)) &&
        !isPositive(subtract(entry.row.principalDue as string, principalPaid));

      const overdue = startOfDay(occurredAt) > startOfDay(entry.row.dueDate);

      await tx.warehouseCreditInstallment.update({
        where: { id: entry.row.id },
        data: {
          penaltyPaid: toMoneyString(penaltyPaid),
          interestPaid: toMoneyString(interestPaid),
          principalPaid: toMoneyString(principalPaid),
          totalPaid: toMoneyString(add(penaltyPaid, interestPaid, principalPaid)),
          status: fullyPaid ? "PAID" : overdue ? "OVERDUE" : "PARTIALLY_PAID",
          paidAt: fullyPaid ? occurredAt : null,
          daysOverdue: fullyPaid ? 0 : daysBetween(entry.row.dueDate, occurredAt),
        },
      });

      // A fine is settled the moment its instalment's penalty is covered.
      if (isPositive(entry.penalty)) {
        const fine = await tx.warehouseCreditFine.findUnique({
          where: { installmentId: entry.row.id },
          select: { id: true, amount: true, status: true },
        });

        if (
          fine &&
          fine.status === "OUTSTANDING" &&
          !isPositive(subtract(fine.amount as unknown as string, penaltyPaid))
        ) {
          await tx.warehouseCreditFine.update({
            where: { id: fine.id },
            data: { status: "SETTLED", settledAt: occurredAt },
          });
        }
      }
    }

    await tx.warehouseCredit.update({
      where: { id: credit.id },
      data: {
        lastSequence: sequence,
        principalOutstanding: toMoneyString(principalAfter),
        interestOutstanding: toMoneyString(interestAfter),
        penaltyOutstanding: toMoneyString(penaltyAfter),
        principalPaid: { increment: principalTotal.toString() },
        interestPaid: { increment: interestTotal.toString() },
        penaltyPaid: { increment: penaltyTotal.toString() },
        totalPaid: { increment: amount.toString() },
        lastPaymentAt: occurredAt,
        status: completed ? "COMPLETED" : credit.status,
        completedAt: completed ? occurredAt : null,
        daysOverdue: completed ? 0 : undefined,
      },
    });

    return {
      paymentId: payment.id,
      reference: payment.reference,
      memberId: credit.memberId,
      creditReference: credit.reference,
      amount: toMoneyString(amount),
      penaltyPortion: toMoneyString(penaltyTotal),
      interestPortion: toMoneyString(interestTotal),
      principalPortion: toMoneyString(principalTotal),
      balanceAfter: toMoneyString(balanceAfter),
      completed,
    };
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.WAREHOUSE_CREDIT_PAID,
      entityType: "WarehouseCredit",
      entityId: params.creditId,
      associationId: params.associationId,
      metadata: {
        credit: result.creditReference,
        payment: result.reference,
        amount: result.amount,
        penalty: result.penaltyPortion,
        interest: result.interestPortion,
        principal: result.principalPortion,
        balanceAfter: result.balanceAfter,
        fromSavings: params.fromSavings,
        completed: result.completed,
      },
    },
    { id: params.actorId }
  );

  return {
    paymentId: result.paymentId,
    reference: result.reference,
    amount: result.amount,
    penaltyPortion: result.penaltyPortion,
    interestPortion: result.interestPortion,
    principalPortion: result.principalPortion,
    balanceAfter: result.balanceAfter,
    completed: result.completed,
  };
}

// ---------------------------------------------------------------------------
// The 7% for a missed month
// ---------------------------------------------------------------------------

export interface FineAssessmentResult {
  assessed: number;
  totalAssessed: string;
  creditsMarkedOverdue: number;
  creditsDefaulted: number;
}

/**
 * Assesses the fine on every instalment that passed its date unpaid.
 *
 * IDEMPOTENT BY CONSTRUCTION. One fine per instalment, enforced by a unique
 * index rather than by this function remembering what it did — so a second run
 * in the same night, or a re-run after a crash, cannot fine a member twice for
 * one month. A duplicate-key error here is the constraint doing its job and is
 * skipped rather than raised.
 *
 * The rate applies to WHAT IS STILL UNPAID on that instalment, not to the
 * whole credit. A member who paid four fifths and was three days late is fined
 * on the fifth — the same principle the daily contribution fine follows.
 */
export async function assessCreditFines(
  associationId: string,
  asOf: Date = new Date()
): Promise<FineAssessmentResult> {
  const today = startOfDay(asOf);

  const credits = await prisma.warehouseCredit.findMany({
    where: { associationId, status: { in: ["ACTIVE", "OVERDUE"] } },
    select: {
      id: true,
      memberId: true,
      reference: true,
      status: true,
      currency: true,
      fineRate: true,
      fineGraceDays: true,
      maturityDate: true,
      installments: {
        where: { status: { notIn: ["PAID", "WAIVED"] } },
        orderBy: { installmentNumber: "asc" },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          principalDue: true,
          interestDue: true,
          principalPaid: true,
          interestPaid: true,
          fine: { select: { id: true } },
        },
      },
    },
  });

  let assessed = 0;
  let totalAssessed = ZERO;
  let creditsMarkedOverdue = 0;
  let creditsDefaulted = 0;

  for (const credit of credits) {
    const rate = toMoney(credit.fineRate);
    let oldestOverdueDays = 0;

    for (const installment of credit.installments) {
      const fineDueFrom = new Date(installment.dueDate);
      fineDueFrom.setDate(fineDueFrom.getDate() + credit.fineGraceDays);

      const daysLate = daysBetween(installment.dueDate, today);
      if (daysLate > 0) oldestOverdueDays = Math.max(oldestOverdueDays, daysLate);

      // Not yet late enough to be fined.
      if (today <= startOfDay(fineDueFrom)) continue;
      // Already fined. See the idempotence note above.
      if (installment.fine) continue;

      const arrears = subtract(
        add(installment.principalDue, installment.interestDue),
        add(installment.principalPaid, installment.interestPaid)
      );

      // Paid in full but not yet marked so, or waived to zero. Nothing to fine.
      if (!isPositive(arrears)) continue;

      const amount = toMoney(multiply(arrears, rate.dividedBy(100)));
      if (!isPositive(amount)) continue;

      try {
        await withFinancialTransaction(async (tx) => {
          await tx.warehouseCreditFine.create({
            data: {
              associationId,
              creditId: credit.id,
              memberId: credit.memberId,
              installmentId: installment.id,
              reference: buildCreditReference("WCF"),
              arrearsAmount: toMoneyString(arrears),
              rate: toMoney(credit.fineRate).toFixed(4),
              amount: toMoneyString(amount),
              currency: credit.currency,
              daysLate,
              status: "OUTSTANDING",
              assessedAt: asOf,
            },
          });

          // The fine is owed against the month it punishes, so a payment
          // clears it in the same pass as that month's instalment.
          await tx.warehouseCreditInstallment.update({
            where: { id: installment.id },
            data: {
              penaltyDue: { increment: amount.toString() },
              status: "OVERDUE",
              daysOverdue: daysLate,
            },
          });

          await tx.warehouseCredit.update({
            where: { id: credit.id },
            data: { penaltyOutstanding: { increment: amount.toString() } },
          });
        });

        assessed += 1;
        totalAssessed = add(totalAssessed, amount);

        // Null actor: the scheduled job assessed this, not a person. The
        // fine row records the same fact in `assessedById`.
        await recordAudit(
          {
            action: AUDIT_ACTIONS.WAREHOUSE_CREDIT_FINE_ASSESSED,
            entityType: "WarehouseCredit",
            entityId: credit.id,
            associationId,
            metadata: {
              credit: credit.reference,
              installment: installment.installmentNumber,
              arrears: toMoneyString(arrears),
              rate: toMoney(credit.fineRate).toFixed(4),
              amount: toMoneyString(amount),
              daysLate,
            },
          },
          null
        );
      } catch (error) {
        // The unique index refusing a second fine for one month is the
        // expected outcome of a re-run, not a failure.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    // The credit's own standing follows its instalments. DEFAULTED only once
    // the term itself has run out with money still owed — being late inside
    // the three months is OVERDUE, which is a different conversation.
    const matured = today > startOfDay(credit.maturityDate);
    const nextStatus: WarehouseCreditStatus =
      oldestOverdueDays > 0 ? (matured ? "DEFAULTED" : "OVERDUE") : credit.status;

    if (nextStatus !== credit.status || credit.installments.length > 0) {
      await prisma.warehouseCredit.update({
        where: { id: credit.id },
        data: {
          status: nextStatus,
          daysOverdue: oldestOverdueDays,
          ...(nextStatus === "DEFAULTED" && credit.status !== "DEFAULTED"
            ? { defaultedAt: asOf }
            : {}),
        },
      });

      if (nextStatus === "OVERDUE" && credit.status !== "OVERDUE") {
        creditsMarkedOverdue += 1;
      }
      if (nextStatus === "DEFAULTED" && credit.status !== "DEFAULTED") {
        creditsDefaulted += 1;
      }
    }
  }

  return {
    assessed,
    totalAssessed: toMoneyString(totalAssessed),
    creditsMarkedOverdue,
    creditsDefaulted,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Forgiving and writing off
// ---------------------------------------------------------------------------

/** Forgives one fine. Requires a written reason — see lib/audit.ts. */
export async function waiveCreditFine(params: {
  associationId: string;
  actorId: string;
  fineId: string;
  reason: string;
}): Promise<void> {
  const reason = params.reason?.trim();
  if (!reason) {
    throw new WarehouseCreditError(
      "Forgiving a fine requires a written reason",
      "REASON_REQUIRED"
    );
  }

  const fine = await prisma.warehouseCreditFine.findFirst({
    where: { id: params.fineId, associationId: params.associationId },
    select: {
      id: true,
      status: true,
      amount: true,
      reference: true,
      creditId: true,
      installmentId: true,
      credit: { select: { reference: true } },
      installment: { select: { penaltyPaid: true } },
    },
  });

  if (!fine) throw new WarehouseCreditError("That fine was not found", "NOT_FOUND");

  if (fine.status !== "OUTSTANDING") {
    throw new WarehouseCreditError(
      "Only a fine that is still owed can be forgiven",
      "INVALID_STATE"
    );
  }

  const amount = toMoney(fine.amount);

  // ONLY THE UNPAID PART COMES OFF. A member who paid some of a fine before it
  // was forgiven has already handed that money over — it is settled, not owed
  // — and decrementing the full amount would drive the credit's penalty
  // position negative and quietly credit them against the goods.
  const alreadyPaid = toMoney(fine.installment.penaltyPaid);
  const unpaid = subtract(amount, alreadyPaid);
  const relief = unpaid.isNegative() ? ZERO : unpaid;

  await withFinancialTransaction(async (tx) => {
    await tx.warehouseCreditFine.update({
      where: { id: fine.id },
      data: {
        status: "WAIVED",
        waivedAt: new Date(),
        waivedById: params.actorId,
        waiverReason: reason,
      },
    });

    // The fine comes off the month it was raised against and off the credit's
    // position, so the member is not asked for it again.
    await tx.warehouseCreditInstallment.update({
      where: { id: fine.installmentId },
      data: { penaltyDue: { decrement: relief.toString() } },
    });

    await tx.warehouseCredit.update({
      where: { id: fine.creditId },
      data: { penaltyOutstanding: { decrement: relief.toString() } },
    });
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.WAREHOUSE_CREDIT_FINE_WAIVED,
      entityType: "WarehouseCreditFine",
      entityId: fine.id,
      associationId: params.associationId,
      metadata: {
        fine: fine.reference,
        credit: fine.credit.reference,
        amount: toMoneyString(amount),
        alreadyPaid: toMoneyString(alreadyPaid),
        forgiven: toMoneyString(relief),
        reason,
      },
    },
    { id: params.actorId }
  );
}

/** Gives up on a credit. The association bears the loss. */
export async function writeOffCredit(params: {
  associationId: string;
  actorId: string;
  creditId: string;
  reason: string;
}): Promise<void> {
  const reason = params.reason?.trim();
  if (!reason) {
    throw new WarehouseCreditError(
      "Writing off a credit requires a written reason",
      "REASON_REQUIRED"
    );
  }

  const credit = await prisma.warehouseCredit.findFirst({
    where: { id: params.creditId, associationId: params.associationId },
    select: {
      id: true,
      reference: true,
      status: true,
      principalOutstanding: true,
      interestOutstanding: true,
      penaltyOutstanding: true,
    },
  });

  if (!credit) throw new WarehouseCreditError("That credit was not found", "NOT_FOUND");

  if (
    credit.status === "COMPLETED" ||
    credit.status === "WRITTEN_OFF" ||
    credit.status === "CANCELLED"
  ) {
    throw new WarehouseCreditError("That credit is already closed", "INVALID_STATE");
  }

  const loss = add(
    credit.principalOutstanding,
    credit.interestOutstanding,
    credit.penaltyOutstanding
  );

  await prisma.warehouseCredit.update({
    where: { id: credit.id },
    data: {
      status: "WRITTEN_OFF",
      writtenOffAt: new Date(),
      writeOffReason: reason,
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.WAREHOUSE_CREDIT_WRITTEN_OFF,
      entityType: "WarehouseCredit",
      entityId: credit.id,
      associationId: params.associationId,
      metadata: {
        credit: credit.reference,
        loss: toMoneyString(loss),
        reason,
      },
    },
    { id: params.actorId }
  );
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface CreditInstallmentDetail {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  status: InstallmentStatus;
  principalDue: string;
  interestDue: string;
  penaltyDue: string;
  totalDue: string;
  totalPaid: string;
  /// Everything still owed on this month, fine included. The one figure a
  /// member can act on, so it is computed once here rather than in each view.
  outstanding: string;
  daysOverdue: number;
  isOverdue: boolean;
  paidAt: Date | null;
  fine: {
    id: string;
    reference: string;
    amount: string;
    arrearsAmount: string;
    rate: string;
    status: string;
    daysLate: number;
    assessedAt: Date;
    waiverReason: string | null;
  } | null;
}

export interface CreditPaymentDetail {
  id: string;
  reference: string;
  amount: string;
  penaltyPortion: string;
  interestPortion: string;
  principalPortion: string;
  balanceAfter: string;
  occurredAt: Date;
  fromSavings: boolean;
  channel: PaymentChannel | null;
  note: string | null;
  recordedByName: string | null;
}

export interface CreditDetail {
  id: string;
  reference: string;
  status: WarehouseCreditStatus;
  memberId: string;
  memberNumber: string;
  memberName: string;
  issuanceId: string;
  issuanceReference: string;
  itemSummary: string;

  goodsValue: string;
  interestRate: string;
  interestAmount: string;
  fineRate: string;
  termMonths: number;
  totalPayable: string;
  currency: string;

  principalOutstanding: string;
  interestOutstanding: string;
  penaltyOutstanding: string;
  /// Everything still owed, fines included.
  totalOutstanding: string;
  totalPaid: string;
  /// 0–100, of `totalPayable`. What a progress bar should show.
  percentPaid: number;

  startedAt: Date;
  firstDueDate: Date;
  maturityDate: Date;
  completedAt: Date | null;
  daysOverdue: number;
  isOverdue: boolean;

  /// The next instalment still owed, or null when nothing is left.
  nextDue: {
    installmentNumber: number;
    dueDate: Date;
    amount: string;
    daysUntil: number;
    isOverdue: boolean;
  } | null;

  finesAssessed: number;
  finesTotal: string;
  note: string | null;
  writeOffReason: string | null;
  openedByName: string | null;

  installments: CreditInstallmentDetail[];
  payments: CreditPaymentDetail[];
}

const CREDIT_SELECT = {
  id: true,
  reference: true,
  status: true,
  memberId: true,
  issuanceId: true,
  goodsValue: true,
  interestRate: true,
  interestAmount: true,
  fineRate: true,
  termMonths: true,
  totalPayable: true,
  currency: true,
  principalOutstanding: true,
  interestOutstanding: true,
  penaltyOutstanding: true,
  totalPaid: true,
  startedAt: true,
  firstDueDate: true,
  maturityDate: true,
  completedAt: true,
  daysOverdue: true,
  note: true,
  writeOffReason: true,
  member: {
    select: {
      memberNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  issuance: {
    select: {
      reference: true,
      lines: {
        orderBy: { createdAt: "asc" as const },
        select: { itemName: true, quantity: true, unit: true },
      },
    },
  },
  openedBy: { select: { firstName: true, lastName: true } },
  installments: {
    orderBy: { installmentNumber: "asc" as const },
    select: {
      id: true,
      installmentNumber: true,
      dueDate: true,
      status: true,
      principalDue: true,
      interestDue: true,
      penaltyDue: true,
      totalDue: true,
      principalPaid: true,
      interestPaid: true,
      penaltyPaid: true,
      totalPaid: true,
      paidAt: true,
      daysOverdue: true,
      fine: {
        select: {
          id: true,
          reference: true,
          amount: true,
          arrearsAmount: true,
          rate: true,
          status: true,
          daysLate: true,
          assessedAt: true,
          waiverReason: true,
        },
      },
    },
  },
  payments: {
    orderBy: { sequence: "desc" as const },
    select: {
      id: true,
      reference: true,
      amount: true,
      penaltyPortion: true,
      interestPortion: true,
      principalPortion: true,
      balanceAfter: true,
      occurredAt: true,
      savingsTransactionId: true,
      channel: true,
      note: true,
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

type CreditRow = Prisma.WarehouseCreditGetPayload<{
  select: typeof CREDIT_SELECT;
}>;

function toCreditDetail(row: CreditRow, asOf: Date): CreditDetail {
  const today = startOfDay(asOf);

  const totalOutstanding = add(
    row.principalOutstanding,
    row.interestOutstanding,
    row.penaltyOutstanding
  );

  const installments: CreditInstallmentDetail[] = row.installments.map((item) => {
    const outstanding = subtract(
      add(item.principalDue, item.interestDue, item.penaltyDue),
      add(item.principalPaid, item.interestPaid, item.penaltyPaid)
    );

    const unpaid = isPositive(outstanding);
    const isOverdue = unpaid && today > startOfDay(item.dueDate);

    return {
      id: item.id,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      status: item.status,
      principalDue: toMoneyString(item.principalDue),
      interestDue: toMoneyString(item.interestDue),
      penaltyDue: toMoneyString(item.penaltyDue),
      // Includes any fine, because that is what the member must actually hand
      // over this month.
      totalDue: toMoneyString(
        add(item.principalDue, item.interestDue, item.penaltyDue)
      ),
      totalPaid: toMoneyString(item.totalPaid),
      outstanding: toMoneyString(outstanding.isNegative() ? ZERO : outstanding),
      daysOverdue: isOverdue ? daysBetween(item.dueDate, today) : 0,
      isOverdue,
      paidAt: item.paidAt,
      fine: item.fine
        ? {
            id: item.fine.id,
            reference: item.fine.reference,
            amount: toMoneyString(item.fine.amount),
            arrearsAmount: toMoneyString(item.fine.arrearsAmount),
            rate: toMoney(item.fine.rate).toFixed(4),
            status: item.fine.status,
            daysLate: item.fine.daysLate,
            assessedAt: item.fine.assessedAt,
            waiverReason: item.fine.waiverReason,
          }
        : null,
    };
  });

  const next = installments.find((item) => isPositive(item.outstanding)) ?? null;

  const finesAssessed = installments.filter(
    (item) => item.fine && item.fine.status !== "CANCELLED"
  ).length;

  const finesTotal = installments.reduce(
    (sum, item) =>
      item.fine && item.fine.status !== "CANCELLED"
        ? add(sum, item.fine.amount)
        : sum,
    ZERO
  );

  const payable = toMoney(row.totalPayable);
  const percentPaid = payable.greaterThan(0)
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(toMoney(row.totalPaid).dividedBy(payable).times(100).toNumber())
        )
      )
    : 0;

  const memberName =
    `${row.member.user?.firstName ?? ""} ${row.member.user?.lastName ?? ""}`.trim();

  const itemSummary = row.issuance.lines
    .map((line) => `${line.itemName} × ${line.quantity}${line.unit ? ` ${line.unit}` : ""}`)
    .join(", ");

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    memberId: row.memberId,
    memberNumber: row.member.memberNumber,
    memberName: memberName || row.member.memberNumber,
    issuanceId: row.issuanceId,
    issuanceReference: row.issuance.reference,
    itemSummary,

    goodsValue: toMoneyString(row.goodsValue),
    interestRate: toMoney(row.interestRate).toFixed(4),
    interestAmount: toMoneyString(row.interestAmount),
    fineRate: toMoney(row.fineRate).toFixed(4),
    termMonths: row.termMonths,
    totalPayable: toMoneyString(row.totalPayable),
    currency: row.currency,

    principalOutstanding: toMoneyString(row.principalOutstanding),
    interestOutstanding: toMoneyString(row.interestOutstanding),
    penaltyOutstanding: toMoneyString(row.penaltyOutstanding),
    totalOutstanding: toMoneyString(totalOutstanding),
    totalPaid: toMoneyString(row.totalPaid),
    percentPaid,

    startedAt: row.startedAt,
    firstDueDate: row.firstDueDate,
    maturityDate: row.maturityDate,
    completedAt: row.completedAt,
    daysOverdue: row.daysOverdue,
    isOverdue: installments.some((item) => item.isOverdue),

    nextDue: next
      ? {
          installmentNumber: next.installmentNumber,
          dueDate: next.dueDate,
          amount: next.outstanding,
          daysUntil: Math.round(
            (startOfDay(next.dueDate).getTime() - today.getTime()) / 86_400_000
          ),
          isOverdue: next.isOverdue,
        }
      : null,

    finesAssessed,
    finesTotal: toMoneyString(finesTotal),
    note: row.note,
    writeOffReason: row.writeOffReason,
    openedByName: row.openedBy
      ? `${row.openedBy.firstName ?? ""} ${row.openedBy.lastName ?? ""}`.trim() || null
      : null,

    installments,
    payments: row.payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      amount: toMoneyString(payment.amount),
      penaltyPortion: toMoneyString(payment.penaltyPortion),
      interestPortion: toMoneyString(payment.interestPortion),
      principalPortion: toMoneyString(payment.principalPortion),
      balanceAfter: toMoneyString(payment.balanceAfter),
      occurredAt: payment.occurredAt,
      fromSavings: payment.savingsTransactionId !== null,
      channel: payment.channel,
      note: payment.note,
      recordedByName: payment.recordedBy
        ? `${payment.recordedBy.firstName ?? ""} ${payment.recordedBy.lastName ?? ""}`.trim() ||
          null
        : null,
    })),
  };
}

export async function getCredit(
  associationId: string,
  creditId: string
): Promise<CreditDetail | null> {
  const row = await prisma.warehouseCredit.findFirst({
    where: { id: creditId, associationId },
    select: CREDIT_SELECT,
  });

  return row ? toCreditDetail(row, new Date()) : null;
}

/** One member's own credit, for their warehouse page. Scoped by memberId. */
export async function getMemberCredit(
  memberId: string,
  creditId: string
): Promise<CreditDetail | null> {
  const row = await prisma.warehouseCredit.findFirst({
    where: { id: creditId, memberId },
    select: CREDIT_SELECT,
  });

  return row ? toCreditDetail(row, new Date()) : null;
}

export interface MemberCreditSummary {
  credits: CreditDetail[];
  /// Everything still owed on goods bought over time, fines included.
  totalOutstanding: string;
  totalPaid: string;
  /// Interest the member has been charged across every credit, ever. Shown
  /// because a member is entitled to know what buying on credit has cost them.
  totalInterestCharged: string;
  totalFines: string;
  currency: string;
  activeCount: number;
  overdueCount: number;
  /// The soonest payment still owed across every running credit.
  nextDue: {
    creditId: string;
    creditReference: string;
    dueDate: Date;
    amount: string;
    isOverdue: boolean;
  } | null;
}

/**
 * What one member owes the store over time — the source for the credit panel
 * on their warehouse page and their account status page.
 */
export async function getMemberCreditSummary(
  memberId: string
): Promise<MemberCreditSummary | null> {
  // Together: the credits are keyed by the member id already in hand, so
  // fetching the member first only added a round trip.
  const [member, rows] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, association: { select: { currency: true } } },
    }),
    prisma.warehouseCredit.findMany({
      where: { memberId, status: { not: "CANCELLED" } },
      orderBy: { startedAt: "desc" },
      select: CREDIT_SELECT,
    }),
  ]);

  if (!member) return null;

  const asOf = new Date();
  const credits = rows.map((row) => toCreditDetail(row, asOf));

  let totalOutstanding = ZERO;
  let totalPaid = ZERO;
  let totalInterestCharged = ZERO;
  let totalFines = ZERO;
  let activeCount = 0;
  let overdueCount = 0;

  let nextDue: MemberCreditSummary["nextDue"] = null;

  for (const credit of credits) {
    // A written-off credit keeps its balances on the record — the association
    // must be able to say what it gave up on — but it is not money this member
    // is still being asked for, and adding it to the figure on their own page
    // would be a bill for a debt nobody intends to collect. DEFAULTED is
    // counted: the term ran out, and it is still owed.
    const collectable =
      credit.status === "ACTIVE" ||
      credit.status === "OVERDUE" ||
      credit.status === "DEFAULTED";

    if (collectable) {
      totalOutstanding = add(totalOutstanding, credit.totalOutstanding);
    }

    totalPaid = add(totalPaid, credit.totalPaid);
    totalInterestCharged = add(totalInterestCharged, credit.interestAmount);
    totalFines = add(totalFines, credit.finesTotal);

    const running = credit.status === "ACTIVE" || credit.status === "OVERDUE";
    if (running) activeCount += 1;
    if (credit.isOverdue) overdueCount += 1;

    if (running && credit.nextDue) {
      if (!nextDue || credit.nextDue.dueDate < nextDue.dueDate) {
        nextDue = {
          creditId: credit.id,
          creditReference: credit.reference,
          dueDate: credit.nextDue.dueDate,
          amount: credit.nextDue.amount,
          isOverdue: credit.nextDue.isOverdue,
        };
      }
    }
  }

  return {
    credits,
    totalOutstanding: toMoneyString(totalOutstanding),
    totalPaid: toMoneyString(totalPaid),
    totalInterestCharged: toMoneyString(totalInterestCharged),
    totalFines: toMoneyString(totalFines),
    currency: member.association.currency,
    activeCount,
    overdueCount,
    nextDue,
  };
}

export interface CreditsPage {
  credits: CreditDetail[];
  total: number;
}

/** The committee's list. Filtered by standing, newest first. */
export async function listCredits(
  associationId: string,
  options: {
    status?: WarehouseCreditStatus | "ALL";
    memberId?: string;
    overdueOnly?: boolean;
    take?: number;
    skip?: number;
  } = {}
): Promise<CreditsPage> {
  // `overdueOnly` wins over an explicit status: a caller asking for both has
  // asked a narrower question, and silently returning every ACTIVE credit
  // because the spread order put `status` last would answer a different one.
  const status: Prisma.WarehouseCreditWhereInput["status"] = options.overdueOnly
    ? { in: ["OVERDUE", "DEFAULTED"] }
    : options.status && options.status !== "ALL"
      ? options.status
      : undefined;

  const where: Prisma.WarehouseCreditWhereInput = {
    associationId,
    ...(status ? { status } : {}),
    ...(options.memberId ? { memberId: options.memberId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.warehouseCredit.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
      select: CREDIT_SELECT,
    }),
    prisma.warehouseCredit.count({ where }),
  ]);

  const asOf = new Date();
  return {
    credits: rows.map((row) => toCreditDetail(row, asOf)),
    total,
  };
}

export interface CreditOverview {
  activeCount: number;
  overdueCount: number;
  /// Value of goods financed and not yet paid for, fines included.
  totalOutstanding: string;
  /// Interest the association has actually COLLECTED on warehouse goods.
  /// Realised, not accrued — the same discipline the association's finance
  /// page applies to lending income.
  interestEarned: string;
  finesOutstanding: string;
  finesCollected: string;
  currency: string;
}

/** The headline figures for the committee's warehouse screen. */
export async function getCreditOverview(
  associationId: string
): Promise<CreditOverview> {
  const [association, active, overdue, positions, income, fines] = await Promise.all([
    prisma.association.findUnique({
      where: { id: associationId },
      select: { currency: true },
    }),
    prisma.warehouseCredit.count({
      where: { associationId, status: { in: ["ACTIVE", "OVERDUE"] } },
    }),
    prisma.warehouseCredit.count({
      where: { associationId, status: { in: ["OVERDUE", "DEFAULTED"] } },
    }),
    prisma.warehouseCredit.aggregate({
      where: { associationId, status: { in: ["ACTIVE", "OVERDUE", "DEFAULTED"] } },
      _sum: {
        principalOutstanding: true,
        interestOutstanding: true,
        penaltyOutstanding: true,
      },
    }),
    prisma.warehouseCreditPayment.aggregate({
      where: { associationId },
      _sum: { associationIncome: true },
    }),
    prisma.warehouseCreditFine.groupBy({
      by: ["status"],
      where: { associationId },
      _sum: { amount: true },
    }),
  ]);

  const finesBy = (status: string) =>
    toMoneyString(
      fines.find((row) => row.status === status)?._sum.amount ?? ZERO
    );

  return {
    activeCount: active,
    overdueCount: overdue,
    totalOutstanding: toMoneyString(
      add(
        positions._sum.principalOutstanding ?? ZERO,
        positions._sum.interestOutstanding ?? ZERO,
        positions._sum.penaltyOutstanding ?? ZERO
      )
    ),
    interestEarned: toMoneyString(income._sum.associationIncome ?? ZERO),
    finesOutstanding: finesBy("OUTSTANDING"),
    finesCollected: finesBy("SETTLED"),
    currency: association?.currency ?? "RWF",
  };
}
