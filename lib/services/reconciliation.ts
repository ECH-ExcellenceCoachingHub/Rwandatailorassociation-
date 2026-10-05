import "server-only";
import { prisma, isUniqueConstraintError, withFinancialTransaction } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { paymentLogger, serialiseError } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { equals, subtract, toMoneyString } from "@/lib/money";
import { postSavingsTransaction } from "@/lib/services/ledger";
import { chargeMemberFeeWithin } from "@/lib/services/contributions";
import { matchPaymentToMember } from "@/lib/services/payment-matching";
import { getPaymentProvider } from "@/lib/jenga";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import { ProviderError, type ProviderTransaction } from "@/lib/jenga/types";
import type { PaymentStatus, ReconciliationOutcome } from "@/lib/generated/prisma/enums";

/**
 * PAYMENT RECONCILIATION ENGINE.
 *
 * The pipeline, and the guard at each step:
 *
 *   fetch from provider
 *     → capture raw            (unique index: same transaction never stored twice)
 *     → verify with provider   (SUCCESS only — presence in a listing proves nothing)
 *     → identify member        (evidence-based; ambiguity goes to a human)
 *     → post to ledger         (atomic, idempotent on paymentId)
 *     → notify
 *
 * Three principles it refuses to break:
 *
 *   1. A transaction is not credited because it exists. It is credited because
 *      the provider confirmed, on a second and separate call, that it
 *      succeeded. PENDING and FAILED are recorded and left alone.
 *
 *   2. A transaction is never credited to a member the system merely suspects.
 *      Below the confidence threshold it becomes UNMATCHED and waits.
 *
 *   3. A transaction is never processed twice. The unique constraint on
 *      (provider, externalTransactionId) and the one on
 *      savingsTransaction.paymentId make it a database guarantee rather than
 *      a matter of getting the code right.
 */

export interface ReconciliationSummary {
  fetched: number;
  created: number;
  duplicates: number;
  processed: number;
  unmatched: number;
  pending: number;
  failed: number;
  errors: number;
  jobRunId: string;
}

/**
 * Polls the provider for recent transactions and runs the full pipeline.
 * Invoked by the background worker on a schedule, and on demand by an admin.
 */
export async function runReconciliation(options: {
  associationId: string;
  lookbackHours?: number;
  triggeredById?: string | null;
}): Promise<ReconciliationSummary> {
  const env = getEnv();
  const provider = getPaymentProvider();
  const lookbackHours = options.lookbackHours ?? env.RECONCILIATION_LOOKBACK_HOURS;

  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: "payment-reconciliation",
      status: "RUNNING",
      details: {
        associationId: options.associationId,
        lookbackHours,
        provider: provider.name,
        sandbox: provider.isSandbox,
      },
    },
    select: { id: true },
  });

  const summary: ReconciliationSummary = {
    fetched: 0,
    created: 0,
    duplicates: 0,
    processed: 0,
    unmatched: 0,
    pending: 0,
    failed: 0,
    errors: 0,
    jobRunId: jobRun.id,
  };

  try {
    const association = await prisma.association.findUniqueOrThrow({
      where: { id: options.associationId },
      select: { id: true, code: true, bankAccountNumber: true, currency: true },
    });

    const accountNumber = association.bankAccountNumber ?? env.JENGA_ACCOUNT_NUMBER;
    if (!accountNumber) {
      throw new Error(
        "No collection account configured for this association or in JENGA_ACCOUNT_NUMBER"
      );
    }

    // The window deliberately overlaps previous runs. Re-fetching transactions
    // already seen is harmless — the unique constraint rejects them — whereas
    // a gap loses a member's money until someone notices.
    const toDate = new Date();
    const fromDate = new Date(Date.now() - lookbackHours * 3_600_000);

    const transactions = await provider.fetchTransactions({
      accountNumber,
      fromDate,
      toDate,
    });

    summary.fetched = transactions.length;

    for (const transaction of transactions) {
      try {
        const outcome = await ingestAndProcess(transaction, association, provider.name);

        switch (outcome) {
          case "PROCESSED": summary.processed++; summary.created++; break;
          case "DUPLICATE": summary.duplicates++; break;
          case "UNMATCHED": summary.unmatched++; summary.created++; break;
          case "PENDING": summary.pending++; summary.created++; break;
          case "FAILED": summary.failed++; summary.created++; break;
        }
      } catch (error) {
        summary.errors++;
        paymentLogger.error(
          {
            externalTransactionId: transaction.externalTransactionId,
            ...serialiseError(error),
          },
          "failed to process transaction"
        );
      }
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: summary.errors > 0 ? "PARTIAL" : "SUCCESS",
        finishedAt: new Date(),
        itemsProcessed: summary.fetched,
        itemsSucceeded: summary.processed,
        itemsFailed: summary.errors,
        details: { ...summary },
      },
    });

    paymentLogger.info({ ...summary }, "reconciliation run complete");
    return summary;
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
        details: { ...summary },
      },
    });

    paymentLogger.error({ ...serialiseError(error) }, "reconciliation run failed");
    throw error;
  }
}

type IngestOutcome = "PROCESSED" | "DUPLICATE" | "UNMATCHED" | "PENDING" | "FAILED";

/**
 * Captures one provider transaction and drives it through the pipeline.
 * Safe to call repeatedly with the same transaction.
 */
export async function ingestAndProcess(
  transaction: ProviderTransaction,
  association: { id: string; code: string; currency: string },
  providerName: string,
  source: "POLL" | "WEBHOOK" | "MANUAL" = "POLL"
): Promise<IngestOutcome> {
  // ---- 1. Capture -------------------------------------------------------
  // Stored verbatim before any interpretation, so the provider's own record
  // survives whatever the matching engine later decides.
  let payment;

  try {
    payment = await prisma.payment.create({
      data: {
        associationId: association.id,
        provider: providerName,
        channel: "JENGA_EQUITY",
        externalTransactionId: transaction.externalTransactionId,
        transactionReference: transaction.transactionReference,
        amount: transaction.amount,
        currency: transaction.currency,
        providerStatus: transaction.providerStatus,
        status: "RECEIVED",
        payerName: transaction.payerName,
        payerPhone: transaction.payerPhone,
        payerAccount: transaction.payerAccount,
        payerBank: transaction.payerBank,
        narration: transaction.narration,
        debitAccount: transaction.debitAccount,
        creditAccount: transaction.creditAccount,
        transactionDate: transaction.transactionDate,
        valueDate: transaction.valueDate,
        rawPayload: transaction.raw as object,
        ingestSource: source,
      },
      select: { id: true, amount: true, currency: true },
    });
  } catch (error) {
    // THE DUPLICATE GUARD. A replayed webhook or an overlapping poll window
    // lands here, and lands here silently — this is the expected path, not an
    // error condition.
    if (
      isUniqueConstraintError(error, "externalTransactionId") ||
      isUniqueConstraintError(error, "transactionReference")
    ) {
      paymentLogger.debug(
        { externalTransactionId: transaction.externalTransactionId },
        "transaction already captured — skipped"
      );
      return "DUPLICATE";
    }
    throw error;
  }

  await recordAudit(
    {
      action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
      entityType: "Payment",
      entityId: payment.id,
      associationId: association.id,
      newValue: {
        externalTransactionId: transaction.externalTransactionId,
        amount: transaction.amount,
        providerStatus: transaction.providerStatus,
      },
      metadata: { source, provider: providerName },
    },
    null
  );

  return processPayment(payment.id, association);
}

/**
 * Verifies, matches and posts a captured payment.
 * Also the entry point for retrying a payment that previously failed.
 */
export async function processPayment(
  paymentId: string,
  association?: { id: string; code: string; currency: string }
): Promise<IngestOutcome> {
  const env = getEnv();
  const provider = getPaymentProvider();

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      associationId: true,
      externalTransactionId: true,
      transactionReference: true,
      amount: true,
      currency: true,
      status: true,
      narration: true,
      payerName: true,
      payerPhone: true,
      payerAccount: true,
      payerBank: true,
      transactionDate: true,
      valueDate: true,
      retryCount: true,
      savingsTransaction: { select: { id: true } },
    },
  });

  // Already posted. Returning early here is the last line of defence against
  // double-crediting if a retry is triggered for a completed payment.
  if (payment.savingsTransaction) {
    paymentLogger.warn(
      { paymentId, savingsTransactionId: payment.savingsTransaction.id },
      "payment already posted to the ledger — retry ignored"
    );
    return "PROCESSED";
  }

  const tenant =
    association ??
    (await prisma.association.findUniqueOrThrow({
      where: { id: payment.associationId! },
      select: { id: true, code: true, currency: true },
    }));

  // ---- 2. Verify --------------------------------------------------------
  // A separate call to the provider. Appearing in a statement listing is not
  // evidence of success — the transaction may be pending, or already reversed.
  let verification;
  try {
    verification = await provider.verifyTransaction(payment.externalTransactionId);
  } catch (error) {
    const retryable = error instanceof ProviderError ? error.retryable : true;

    await markForRetry(
      payment.id,
      error instanceof Error ? error.message : "Verification failed",
      retryable,
      env.PAYMENT_MAX_RETRIES,
      payment.retryCount
    );

    await logReconciliation(payment.id, "PROVIDER_ERROR", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return "FAILED";
  }

  if (!verification.found) {
    await setStatus(payment.id, "FAILED", "Provider has no record of this transaction");
    await logReconciliation(payment.id, "VERIFICATION_FAILED", {
      notes: "Provider returned no matching transaction",
    });
    return "FAILED";
  }

  if (verification.status === "PENDING") {
    await setStatus(payment.id, "PENDING", null);
    await logReconciliation(payment.id, "VERIFICATION_FAILED", {
      notes: "Transaction is still pending at the provider — will be retried",
    });
    return "PENDING";
  }

  if (verification.status !== "SUCCESS") {
    // FAILED, REVERSED or UNKNOWN. Recorded, never credited.
    await setStatus(
      payment.id,
      "FAILED",
      `Provider reported status ${verification.status}`
    );
    await logReconciliation(payment.id, "VERIFICATION_FAILED", {
      notes: `Provider status: ${verification.status}`,
    });
    return "FAILED";
  }

  // Guard against the provider reporting a different amount than the listing
  // did. Crediting the larger of two disagreeing figures is how a
  // reconciliation bug becomes a loss.
  if (verification.amount && !equals(verification.amount, payment.amount)) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        isSuspicious: true,
        suspicionReason: `Amount mismatch: captured ${toMoneyString(payment.amount)}, provider confirmed ${toMoneyString(verification.amount)}`,
        failureReason: "Amount mismatch between capture and verification",
      },
    });

    await logReconciliation(payment.id, "VERIFICATION_FAILED", {
      notes: `Amount mismatch — captured ${toMoneyString(payment.amount)}, verified ${toMoneyString(verification.amount)}`,
    });

    paymentLogger.error(
      {
        paymentId: payment.id,
        captured: toMoneyString(payment.amount),
        verified: toMoneyString(verification.amount),
      },
      "AMOUNT MISMATCH — payment flagged, not credited"
    );

    return "FAILED";
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
      verificationResponse: verification.raw as object,
    },
  });

  return matchAndCredit(payment.id, tenant);
}

/**
 * Matches a VERIFIED payment to a member and posts it, or parks it.
 *
 * Split out of `processPayment` so the statement-import path can reuse it.
 * Both routes must behave identically once a payment is known to be genuine —
 * same matching rules, same confidence threshold, same ledger, same audit.
 * The only difference between them is HOW the payment was verified: the API
 * path re-queries the bank, the import path relies on an administrator's
 * attestation that the PDF is their real statement.
 */
export async function matchAndCredit(
  paymentId: string,
  tenant: { id: string; code: string; currency: string }
): Promise<IngestOutcome> {
  const env = getEnv();

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      externalTransactionId: true,
      transactionReference: true,
      amount: true,
      currency: true,
      narration: true,
      payerName: true,
      payerPhone: true,
      payerAccount: true,
      payerBank: true,
      transactionDate: true,
      valueDate: true,
      savingsTransaction: { select: { id: true } },
    },
  });

  if (payment.savingsTransaction) return "PROCESSED";

  const match = await matchPaymentToMember(
    {
      externalTransactionId: payment.externalTransactionId,
      transactionReference: payment.transactionReference,
      amount: toMoneyString(payment.amount),
      currency: payment.currency,
      providerStatus: "SUCCESS",
      status: "SUCCESS",
      payerName: payment.payerName,
      payerPhone: payment.payerPhone,
      payerAccount: payment.payerAccount,
      payerBank: payment.payerBank,
      narration: payment.narration,
      debitAccount: null,
      creditAccount: null,
      transactionDate: payment.transactionDate,
      valueDate: payment.valueDate,
      raw: null,
    },
    tenant.id,
    tenant.code
  );

  const threshold = env.PAYMENT_AUTO_MATCH_MIN_CONFIDENCE;

  if (!match.member || match.confidence < threshold || !match.member.savingsAccountId) {
    // Below the bar. The payment is parked, with its candidates and the reason
    // recorded so an administrator can resolve it quickly rather than starting
    // the investigation from nothing.
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "UNMATCHED",
        matchStrategy: match.strategy,
        matchConfidence: match.confidence,
        matchedMemberId: null,
      },
    });

    await logReconciliation(
      payment.id,
      match.candidates.length > 1 ? "AMBIGUOUS" : "UNMATCHED",
      {
        strategy: match.strategy,
        confidence: match.confidence,
        candidateIds: match.candidates.map((c) => c.memberId),
        notes: !match.member
          ? match.evidence
          : `${match.evidence} — confidence ${match.confidence} is below the ${threshold} required to credit automatically`,
      }
    );

    paymentLogger.info(
      { paymentId: payment.id, strategy: match.strategy, confidence: match.confidence },
      "payment routed to the unmatched queue"
    );

    return "UNMATCHED";
  }

  // ---- 4. Post to the ledger --------------------------------------------
  await creditMember({
    paymentId: payment.id,
    savingsAccountId: match.member.savingsAccountId,
    amount: toMoneyString(payment.amount),
    externalReference: payment.externalTransactionId,
    description: buildDescription(payment.narration, match.evidence),
    memberId: match.member.memberId,
    associationId: tenant.id,
    strategy: match.strategy,
    confidence: match.confidence,
    evidence: match.evidence,
  });

  return "PROCESSED";
}

/**
 * Posts the credit and marks the payment processed, atomically.
 *
 * If the ledger write succeeded but the status update did not, the next run
 * would see a payment still marked VERIFIED and try again — the
 * `savingsTransaction` check would stop it, but the two would disagree. One
 * transaction removes the possibility.
 */
async function creditMember(params: {
  paymentId: string;
  savingsAccountId: string;
  amount: string;
  externalReference: string;
  description: string;
  memberId: string;
  associationId: string;
  strategy: string;
  confidence: number;
  evidence: string;
}): Promise<void> {
  let creditedReference = "";
  let balanceAfter = "0.00";
  let feeDeducted = "0.00";

  await withFinancialTransaction(async (tx) => {
    const posted = await postSavingsTransaction(
      {
        savingsAccountId: params.savingsAccountId,
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: params.amount,
        channel: "JENGA_EQUITY",
        description: params.description,
        externalReference: params.externalReference,
        paymentId: params.paymentId,
      },
      tx
    );

    // In the same transaction, so the member is never shown a balance with
    // the service fee still in it.
    const fee = await chargeMemberFeeWithin(tx, params.memberId);

    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        status: "PROCESSED",
        matchedMemberId: params.memberId,
        matchStrategy: params.strategy as never,
        matchConfidence: params.confidence,
        matchedAt: new Date(),
        processedAt: new Date(),
        failureReason: null,
        nextRetryAt: null,
      },
    });

    await tx.paymentReconciliation.create({
      data: {
        paymentId: params.paymentId,
        outcome: "POSTED",
        strategy: params.strategy as never,
        confidence: params.confidence,
        candidateIds: [params.memberId],
        resolvedMemberId: params.memberId,
        notes: params.evidence,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.PAYMENT_PROCESSED,
        entityType: "Payment",
        entityId: params.paymentId,
        associationId: params.associationId,
        newValue: {
          savingsTransactionReference: posted.reference,
          amount: params.amount,
          balanceAfter: posted.balanceAfter,
          memberId: params.memberId,
        },
        metadata: { strategy: params.strategy, confidence: params.confidence },
      },
      null,
      tx
    );

    paymentLogger.info(
      {
        paymentId: params.paymentId,
        memberId: params.memberId,
        amount: params.amount,
        reference: posted.reference,
        strategy: params.strategy,
      },
      "payment credited to member"
    );

    creditedReference = posted.reference;
    feeDeducted = fee.status === "CHARGED" ? fee.amount : "0.00";
    balanceAfter = toMoneyString(subtract(posted.balanceAfter, feeDeducted));
  });

  // ---- 5. Tell the member -----------------------------------------------
  // OUTSIDE the transaction, deliberately. An SMS gateway timeout must never
  // roll back a credit that has already been posted — the member's money is
  // theirs whether or not the message got through. `notify` swallows its own
  // failures and the worker retries the delivery.
  //
  // This is the step the pipeline comment always claimed and the code did not
  // actually do: payments were being credited silently.
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { userId: true },
  });

  if (member) {
    void notify({
      userId: member.userId,
      event: NOTIFICATION_EVENTS.PAYMENT_RECEIVED,
      context: {
        amount: params.amount,
        // Named in the message so a balance lower than the payment is
        // explained rather than queried.
        fee: feeDeducted,
        balance: balanceAfter,
        reference: creditedReference,
      },
      // SMS included: a payment confirmation is the single most reassuring
      // message this system sends, and many members will not open the app.
      channels: ["IN_APP", "SMS", "EMAIL"],
      entityType: "Payment",
      entityId: params.paymentId,
    });
  }
}

/**
 * Manual reconciliation by an administrator.
 *
 * The escape hatch for payments the engine would not credit on its own. It
 * demands a reason, records the admin's identity, and is audited as a manual
 * override — so an attribution made by judgement is always distinguishable
 * from one made on evidence.
 */
/**
 * Discards a payment that will never be attributable to a member.
 *
 * WHY THIS EXISTS. The unmatched queue is a work list, and a work list nobody
 * can clear stops being read. Some rows genuinely do not belong to any member:
 * the association's own transfers, bank charges appearing as credits, a
 * misparsed line from a PDF import, a test transaction. Leaving them to
 * accumulate buries the payments that DO need action.
 *
 * WHAT IS REFUSED, AND WHY IT IS NOT NEGOTIABLE. A payment that has been
 * posted to the ledger is never deletable here. `SavingsTransaction.paymentId`
 * is `onDelete: SetNull`, so deleting a posted payment would quietly sever a
 * member's ledger entry from the payment that justifies it — leaving a credit
 * on a balance that nothing explains. Money that has moved is corrected by
 * reversal, which posts a contra entry and keeps both sides of the story.
 *
 * WHAT SURVIVES. The whole record is copied into the audit entry before the
 * row is removed, because afterwards the audit log is the only place it
 * exists. A written reason is mandatory.
 *
 * NOTE ON RE-APPEARANCE: deleting frees the (provider, externalTransactionId)
 * uniqueness, so a later poll or re-import of the same statement will create
 * the row again. That is the correct behaviour for "I deleted it because the
 * import was wrong" and surprising for "I deleted it because it is not ours" —
 * hence the returned message says so.
 */
export async function deletePayment(params: {
  paymentId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (!params.reason?.trim()) {
    return { ok: false, message: "A reason is required to delete a payment" };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    include: {
      savingsTransaction: { select: { id: true, reference: true } },
      reconciliations: {
        select: { outcome: true, strategy: true, notes: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!payment) {
    return { ok: false, message: "Payment not found" };
  }

  if (payment.savingsTransaction) {
    return {
      ok: false,
      message:
        `This payment was posted to the ledger as ${payment.savingsTransaction.reference}. ` +
        `Reverse that transaction instead — deleting it would leave the member's ` +
        `balance carrying a credit with nothing to explain it.`,
    };
  }

  if (payment.status === "PROCESSED") {
    return {
      ok: false,
      message: "This payment is marked as processed and cannot be deleted",
    };
  }

  // Snapshot first: after the delete this audit row is the only surviving
  // record that the payment ever existed.
  await recordAudit(
    {
      action: AUDIT_ACTIONS.PAYMENT_DELETED,
      entityType: "Payment",
      entityId: payment.id,
      associationId: payment.associationId,
      oldValue: {
        externalTransactionId: payment.externalTransactionId,
        transactionReference: payment.transactionReference,
        provider: payment.provider,
        channel: payment.channel,
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        status: payment.status,
        providerStatus: payment.providerStatus,
        payerName: payment.payerName,
        payerPhone: payment.payerPhone,
        payerAccount: payment.payerAccount,
        narration: payment.narration,
        transactionDate: payment.transactionDate.toISOString(),
        ingestSource: payment.ingestSource,
        isSuspicious: payment.isSuspicious,
        matchStrategy: payment.matchStrategy,
        matchConfidence: payment.matchConfidence,
        reconciliationAttempts: payment.reconciliations.map((r) => ({
          outcome: r.outcome,
          strategy: r.strategy,
          notes: r.notes,
          at: r.createdAt.toISOString(),
        })),
      },
      reason: params.reason.trim(),
      severity: "CRITICAL",
    },
    { id: params.adminUserId }
  );

  // Reconciliation attempts cascade with the payment.
  await prisma.payment.delete({ where: { id: payment.id } });

  paymentLogger.warn(
    {
      paymentId: payment.id,
      externalTransactionId: payment.externalTransactionId,
      amount: payment.amount.toFixed(2),
      adminUserId: params.adminUserId,
    },
    "payment deleted by administrator"
  );

  return {
    ok: true,
    message:
      "Payment deleted. If it arrives again from the provider or in another " +
      "statement upload, it will reappear in this queue.",
  };
}

export interface BulkDeleteResult {
  deleted: number;
  refused: { paymentId: string; reference: string; reason: string }[];
}

/**
 * Deletes several unattributable payments in one action.
 *
 * Clearing a queue one row at a time is not realistic when a statement import
 * has gone wrong and left two hundred junk rows, so this exists — but it is
 * built to be partial rather than all-or-nothing. Each payment is judged on
 * its own: a row that has reached the ledger is REFUSED and reported back by
 * name, while the rest are deleted. Failing the whole batch because one row
 * turned out to be posted would leave the administrator with no way forward
 * except deleting them individually anyway.
 *
 * Every deletion writes its own audit entry through `deletePayment`, so a bulk
 * action is indistinguishable in the log from the same deletions made one at a
 * time. There is no such thing as an unaudited bulk delete here.
 */
export async function deletePayments(params: {
  paymentIds: string[];
  associationId: string | null;
  adminUserId: string;
  reason: string;
}): Promise<BulkDeleteResult> {
  const result: BulkDeleteResult = { deleted: 0, refused: [] };

  if (!params.reason?.trim()) {
    throw new Error("A reason is required to delete payments");
  }

  // Re-read within the caller's scope. The ids arrive from a browser, so the
  // tenant filter is applied here rather than trusted from the request — an
  // id belonging to another association simply is not found.
  const payments = await prisma.payment.findMany({
    where: {
      id: { in: params.paymentIds },
      ...(params.associationId ? { associationId: params.associationId } : {}),
    },
    select: { id: true, externalTransactionId: true },
  });

  for (const payment of payments) {
    const outcome = await deletePayment({
      paymentId: payment.id,
      adminUserId: params.adminUserId,
      reason: params.reason,
    });

    if (outcome.ok) {
      result.deleted++;
    } else {
      result.refused.push({
        paymentId: payment.id,
        reference: payment.externalTransactionId,
        reason: outcome.message,
      });
    }
  }

  paymentLogger.warn(
    {
      requested: params.paymentIds.length,
      deleted: result.deleted,
      refused: result.refused.length,
      adminUserId: params.adminUserId,
    },
    "bulk payment deletion completed"
  );

  return result;
}

/**
 * Every payment currently sitting in the unmatched queue for a scope.
 *
 * Backs the "delete everything in the queue" action. The ids are resolved on
 * the server from the same filter the queue screen uses, so "all" means what
 * the administrator was actually looking at — not whatever ids a client chose
 * to send.
 */
export async function findQueuedPaymentIds(
  associationId: string | null
): Promise<string[]> {
  const payments = await prisma.payment.findMany({
    where: {
      ...(associationId ? { associationId } : {}),
      status: { in: ["UNMATCHED", "FAILED"] },
    },
    select: { id: true },
  });

  return payments.map((payment) => payment.id);
}

export async function manuallyMatchPayment(params: {
  paymentId: string;
  memberId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true; reference: string } | { ok: false; message: string }> {
  if (!params.reason?.trim()) {
    return { ok: false, message: "A reason is required to match a payment manually" };
  }

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: params.paymentId },
    select: {
      id: true,
      associationId: true,
      amount: true,
      status: true,
      narration: true,
      externalTransactionId: true,
      savingsTransaction: { select: { id: true, reference: true } },
    },
  });

  if (payment.savingsTransaction) {
    return {
      ok: false,
      message: `This payment has already been posted as ${payment.savingsTransaction.reference}`,
    };
  }

  // Verification is not bypassed by a manual match. An admin may decide WHO a
  // payment belongs to; they may not decide THAT it happened.
  if (payment.status === "FAILED") {
    return {
      ok: false,
      message: "This payment failed verification with the provider and cannot be credited",
    };
  }
  if (payment.status === "PENDING") {
    return {
      ok: false,
      message: "This payment is still pending at the provider and cannot be credited yet",
    };
  }

  const member = await prisma.member.findFirst({
    where: { id: params.memberId, associationId: payment.associationId! },
    select: {
      id: true,
      status: true,
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
  });

  if (!member) {
    // Also the cross-tenant guard: a member of another association is simply
    // not found by this query.
    return { ok: false, message: "Member not found in this association" };
  }
  if (member.status !== "ACTIVE") {
    return { ok: false, message: "This member's account is not active" };
  }
  if (!member.savingsAccounts[0]) {
    return { ok: false, message: "This member has no active savings account" };
  }

  let reference = "";

  await withFinancialTransaction(async (tx) => {
    const posted = await postSavingsTransaction(
      {
        savingsAccountId: member.savingsAccounts[0].id,
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: toMoneyString(payment.amount),
        channel: "JENGA_EQUITY",
        description: `Manually matched payment${payment.narration ? `: ${payment.narration}` : ""}`,
        externalReference: payment.externalTransactionId,
        paymentId: payment.id,
        postedById: params.adminUserId,
      },
      tx
    );
    await chargeMemberFeeWithin(tx, member.id, { actorId: params.adminUserId });

    reference = posted.reference;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PROCESSED",
        matchedMemberId: member.id,
        matchStrategy: "MANUAL_ADMIN",
        matchConfidence: 100,
        matchedById: params.adminUserId,
        matchedAt: new Date(),
        processedAt: new Date(),
      },
    });

    await tx.paymentReconciliation.create({
      data: {
        paymentId: payment.id,
        outcome: "MANUAL_OVERRIDE",
        strategy: "MANUAL_ADMIN",
        confidence: 100,
        candidateIds: [member.id],
        resolvedMemberId: member.id,
        notes: params.reason,
        performedById: params.adminUserId,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.PAYMENT_MATCHED_MANUALLY,
        entityType: "Payment",
        entityId: payment.id,
        associationId: payment.associationId,
        newValue: {
          memberId: member.id,
          amount: toMoneyString(payment.amount),
          savingsTransactionReference: posted.reference,
        },
        reason: params.reason,
        severity: "CRITICAL",
      },
      { id: params.adminUserId },
      tx
    );
  });

  return { ok: true, reference };
}

/** Payments whose retry time has come. Called by the worker. */
export async function retryFailedPayments(limit = 50): Promise<number> {
  const due = await prisma.payment.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: new Date() },
      savingsTransaction: null,
    },
    select: { id: true },
    take: limit,
  });

  let recovered = 0;

  for (const payment of due) {
    try {
      const outcome = await processPayment(payment.id);
      if (outcome === "PROCESSED") recovered++;
    } catch (error) {
      paymentLogger.error(
        { paymentId: payment.id, ...serialiseError(error) },
        "retry failed"
      );
    }
  }

  return recovered;
}

// Helpers ---------------------------------------------------------------------

async function setStatus(
  paymentId: string,
  status: PaymentStatus,
  failureReason: string | null
): Promise<void> {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status, failureReason },
  });
}

/**
 * Schedules the next retry with exponential backoff.
 * Once the attempt budget is exhausted the payment stops retrying and waits
 * for a human — an endless retry loop hides a real problem.
 */
async function markForRetry(
  paymentId: string,
  reason: string,
  retryable: boolean,
  maxRetries: number,
  currentRetries: number
): Promise<void> {
  const attempts = currentRetries + 1;
  const exhausted = !retryable || attempts >= maxRetries;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "FAILED",
      failureReason: reason,
      retryCount: attempts,
      lastRetryAt: new Date(),
      nextRetryAt: exhausted
        ? null
        : new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000),
    },
  });
}

async function logReconciliation(
  paymentId: string,
  outcome: ReconciliationOutcome,
  details: {
    strategy?: string;
    confidence?: number;
    candidateIds?: string[];
    notes?: string;
    errorMessage?: string;
    performedById?: string;
  } = {}
): Promise<void> {
  const attempt = await prisma.paymentReconciliation.count({ where: { paymentId } });

  await prisma.paymentReconciliation.create({
    data: {
      paymentId,
      attempt: attempt + 1,
      outcome,
      strategy: (details.strategy ?? "NONE") as never,
      confidence: details.confidence ?? 0,
      candidateIds: details.candidateIds ?? [],
      notes: details.notes ?? null,
      errorMessage: details.errorMessage ?? null,
      performedById: details.performedById ?? null,
    },
  });
}

function buildDescription(narration: string | null, evidence: string): string {
  if (narration?.trim()) return narration.trim().slice(0, 200);
  return `Contribution received — ${evidence}`;
}
