import "server-only";
import { prisma, isUniqueConstraintError } from "@/lib/db/prisma";
import { paymentLogger, serialiseError } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, toMoney, toMoneyString } from "@/lib/money";
import { matchAndCredit } from "@/lib/services/reconciliation";
import { matchPaymentToMember } from "@/lib/services/payment-matching";
import { importedTransactionId, type ParsedRow } from "@/lib/services/statement-import";

/**
 * BANK STATEMENT IMPORT — COMMIT LAYER.
 *
 * Turns rows an administrator has reviewed and confirmed into Payment records,
 * then hands them to the ordinary reconciliation pipeline.
 *
 * WHAT IS DIFFERENT FROM THE API PATH, AND WHY:
 *
 * The Jenga path verifies a transaction by re-querying the bank. A PDF has no
 * second source to query — the document IS the bank's record. So verification
 * here is an ADMINISTRATOR'S ATTESTATION: by confirming the import they state
 * that this is their association's genuine statement and that the rows were
 * read correctly. That attestation is recorded on every payment it creates
 * (`ingestSource: MANUAL`, the attesting user, the file name and its hash),
 * so months later it is possible to answer "who said this payment happened,
 * and on the strength of what document?".
 *
 * WHAT IS IDENTICAL:
 *
 * Everything after that. Same duplicate constraints, same member-matching
 * rules and confidence threshold, same ledger, same audit trail, same
 * notifications. An imported payment cannot skip a check that an API payment
 * must pass.
 */

export interface ImportPreviewRow extends ParsedRow {
  externalTransactionId: string;
  /// Already imported previously — will be skipped.
  alreadyImported: boolean;
  /// Who the matcher believes this belongs to, if anyone.
  matchedMemberName: string | null;
  matchedMemberNumber: string | null;
  matchStrategy: string;
  matchConfidence: number;
  matchEvidence: string;
  /// Whether this row would credit automatically at the configured threshold.
  wouldAutoCredit: boolean;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: {
    total: number;
    credits: number;
    debits: number;
    alreadyImported: number;
    wouldCredit: number;
    wouldGoToUnmatched: number;
    lowConfidence: number;
    totalCreditAmount: string;
  };
}

/**
 * Builds the preview an administrator reviews before anything is written.
 *
 * Runs the real matcher against each row so the admin sees exactly who each
 * payment would reach — the whole point of the confirm step is that they can
 * catch a wrong attribution before it becomes a ledger entry, not after.
 *
 * Read-only. Nothing here writes.
 */
export async function buildImportPreview(
  rows: ParsedRow[],
  association: { id: string; code: string },
  autoMatchThreshold: number
): Promise<ImportPreview> {
  // Only credits can be member contributions. Debits on the association's
  // account are its own spending and are shown but never importable.
  const credits = rows.filter((row) => row.direction === "CREDIT");

  const externalIds = credits.map(importedTransactionId);

  const existing = await prisma.payment.findMany({
    where: { externalTransactionId: { in: externalIds } },
    select: { externalTransactionId: true },
  });
  const existingIds = new Set(existing.map((p) => p.externalTransactionId));

  // Rows are matched several at a time: each match is a couple of database
  // round trips, and doing hundreds of them one after another is what made a
  // long statement slow to preview. Order is preserved.
  const previewRows = await mapWithConcurrency(rows, PREVIEW_CONCURRENCY, async (row) => {
    const externalTransactionId = importedTransactionId(row);
    const alreadyImported = existingIds.has(externalTransactionId);

    let matchedMemberName: string | null = null;
    let matchedMemberNumber: string | null = null;
    let matchStrategy = "NONE";
    let matchConfidence = 0;
    let matchEvidence = "Not a credit — cannot be a member contribution";

    if (row.direction === "CREDIT" && !alreadyImported) {
      const match = await matchPaymentToMember(
        {
          externalTransactionId,
          transactionReference: row.bankReference,
          amount: row.amount,
          currency: "RWF",
          providerStatus: "IMPORTED",
          status: "SUCCESS",
          // Read out of the narration by the parser. A statement line has no
          // structured payer field, and these are the only leads when the
          // payer quoted no reference.
          payerName: row.payerName,
          payerPhone: row.payerPhone,
          payerAccount: null,
          payerBank: null,
          narration: row.description,
          debitAccount: null,
          creditAccount: null,
          transactionDate: row.date,
          valueDate: null,
          raw: null,
        },
        association.id,
        association.code
      );

      matchedMemberName = match.member?.fullName ?? null;
      matchedMemberNumber = match.member?.memberNumber ?? null;
      matchStrategy = match.strategy;
      matchConfidence = match.confidence;
      matchEvidence = match.evidence;
    } else if (alreadyImported) {
      matchEvidence = "Already imported from a previous upload — will be skipped";
    }

    const previewRow: ImportPreviewRow = {
      ...row,
      externalTransactionId,
      alreadyImported,
      matchedMemberName,
      matchedMemberNumber,
      matchStrategy,
      matchConfidence,
      matchEvidence,
      wouldAutoCredit:
        row.direction === "CREDIT" &&
        !alreadyImported &&
        matchConfidence >= autoMatchThreshold &&
        matchedMemberName !== null,
    };
    return previewRow;
  });

  const importable = previewRows.filter(
    (r) => r.direction === "CREDIT" && !r.alreadyImported
  );

  return {
    rows: previewRows,
    summary: {
      total: previewRows.length,
      credits: credits.length,
      debits: previewRows.length - credits.length,
      alreadyImported: previewRows.filter((r) => r.alreadyImported).length,
      wouldCredit: importable.filter((r) => r.wouldAutoCredit).length,
      wouldGoToUnmatched: importable.filter((r) => !r.wouldAutoCredit).length,
      lowConfidence: importable.filter((r) => r.confidence === "low").length,
      totalCreditAmount: toMoneyString(
        importable.reduce((total, row) => add(total, row.amount), toMoney(0))
      ),
    },
  };
}

export interface ImportResult {
  created: number;
  credited: number;
  unmatched: number;
  skipped: number;
  failed: number;
  errors: string[];
  batchId: string;
}

/**
 * Commits the rows an administrator selected.
 *
 * `selectedFingerprints` is explicit rather than "import everything": the
 * admin ticks the rows they have actually checked, and a row they did not tick
 * is never written. Sending the whole parse result would make the review
 * theatre.
 */
export async function commitStatementImport(params: {
  rows: ParsedRow[];
  selectedFingerprints: string[];
  association: { id: string; code: string; currency: string };
  adminUserId: string;
  fileName: string;
  fileHash: string;
}): Promise<ImportResult> {
  const selected = new Set(params.selectedFingerprints);

  const importable = params.rows.filter(
    (row) => row.direction === "CREDIT" && selected.has(row.fingerprint)
  );

  const batchId = `IMP-${Date.now().toString(36).toUpperCase()}`;

  const result: ImportResult = {
    created: 0,
    credited: 0,
    unmatched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    batchId,
  };

  // The attestation itself, recorded once for the whole batch and referenced
  // by every payment it produces.
  await recordAudit(
    {
      action: AUDIT_ACTIONS.PAYMENT_RECONCILED,
      entityType: "StatementImport",
      entityId: batchId,
      associationId: params.association.id,
      newValue: {
        fileName: params.fileName,
        fileHash: params.fileHash,
        rowsInFile: params.rows.length,
        rowsSelected: importable.length,
      },
      reason: `Bank statement "${params.fileName}" uploaded and attested as genuine`,
      severity: "CRITICAL",
    },
    { id: params.adminUserId }
  );

  for (const row of importable) {
    const externalTransactionId = importedTransactionId(row);

    try {
      await prisma.payment.create({
        data: {
          associationId: params.association.id,
          provider: "STATEMENT_IMPORT",
          externalTransactionId,
          transactionReference: row.bankReference,
          amount: row.amount,
          currency: params.association.currency,
          providerStatus: "IMPORTED",
          // VERIFIED on the strength of the administrator's attestation, not a
          // provider round trip. The distinction is preserved in
          // verificationResponse below so it is never mistaken for the other.
          status: "VERIFIED",
          verifiedAt: new Date(),
          verificationResponse: {
            method: "ADMIN_ATTESTATION",
            attestedByUserId: params.adminUserId,
            fileName: params.fileName,
            fileHash: params.fileHash,
            batchId,
            parserConfidence: row.confidence,
            parserWarnings: row.warnings,
          },
          payerName: row.payerName,
          payerPhone: row.payerPhone,
          // A number in the narration means this arrived as mobile money, not
          // an ordinary transfer. Recording it correctly matters for reporting
          // by channel.
          channel: row.payerPhone ? "MOBILE_MONEY" : "BANK_TRANSFER",
          narration: row.description,
          transactionDate: row.date,
          valueDate: row.date,
          rawPayload: {
            source: "PDF_STATEMENT",
            rawLine: row.rawLine,
            balanceAfter: row.balanceAfter,
            parsedPayerName: row.payerName,
            parsedPayerPhone: row.payerPhone,
            batchId,
          },
          ingestSource: "MANUAL",
          matchedById: params.adminUserId,
        },
        select: { id: true },
      });

      result.created++;
    } catch (error) {
      // Re-uploading a statement lands here. Expected, not an error.
      if (isUniqueConstraintError(error, "externalTransactionId")) {
        result.skipped++;
        continue;
      }

      result.failed++;
      result.errors.push(
        `${row.date.toISOString().slice(0, 10)} ${row.amount}: ${
          error instanceof Error ? error.message : "could not be saved"
        }`
      );
      continue;
    }

    // Hand off to the ordinary pipeline: match, credit, notify.
    try {
      const payment = await prisma.payment.findFirstOrThrow({
        where: { externalTransactionId },
        select: { id: true },
      });

      const outcome = await matchAndCredit(payment.id, params.association);

      if (outcome === "PROCESSED") result.credited++;
      else result.unmatched++;
    } catch (error) {
      result.failed++;
      result.errors.push(
        `${row.date.toISOString().slice(0, 10)} ${row.amount}: ${
          error instanceof Error ? error.message : "could not be processed"
        }`
      );
      paymentLogger.error(
        { externalTransactionId, ...serialiseError(error) },
        "imported payment failed to process"
      );
    }
  }

  paymentLogger.info({ ...result, batchId }, "statement import complete");

  return result;
}

/** How many statement rows are matched at once while building a preview. */
const PREVIEW_CONCURRENCY = 8;

/** `Promise.all` over `items`, with at most `limit` in flight. Keeps order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
