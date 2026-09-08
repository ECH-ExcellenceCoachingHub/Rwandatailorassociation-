import "server-only";
import { prisma, Prisma, isUniqueConstraintError } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { bkLogger, serialiseError } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { phoneMatchKey } from "@/lib/phone";
import {
  fetchBkTransactions,
  type NormalisedBkTransaction,
  type BkMatchResult,
  type BkMatchCandidate,
  type BkSyncResult,
} from "@/lib/bk";
import { BkApiError } from "@/lib/bk/types";
import { extractPaymentReferences, extractMemberNumbers } from "@/lib/services/payment-matching";

const CONFIDENCE = {
  MEMBER_PAYMENT_REFERENCE: 100,
  EXTERNAL_REFERENCE: 96,
  PAYMENT_CODE: 94,
  BANK_ACCOUNT: 92,
  MOBILE_MONEY_ACCOUNT: 88,
  PHONE_NUMBER: 85,
  PAYER_NAME_EXACT: 75,
  PAYER_NAME_PARTIAL: 60,
} as const;

export interface SyncOptions {
  associationId?: string;
  lookbackHours?: number;
  pageSize?: number;
  maxPages?: number;
  triggeredById?: string | null;
  /** Overrides the window derived from `lookbackHours`. */
  fromDate?: Date;
  toDate?: Date;
  /**
   * Whether this run earns a row in the sync log.
   *
   * "always" for anything a human triggered or that runs on a slow cron.
   * "when-interesting" for the seconds-scale poll, which is overwhelmingly
   * going to find nothing: at one row per tick a five-second poll would write
   * about seventeen thousand rows a day per association and bury the runs that
   * actually did something.
   */
  persistLog?: "always" | "when-interesting";
}

export async function syncBkTransactions(options: SyncOptions = {}): Promise<BkSyncResult> {
  const env = getEnv();
  const lookbackHours = options.lookbackHours ?? env.BK_SYNC_LOOKBACK_HOURS;
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 100;

  const toDate = options.toDate ?? new Date();
  const fromDate = options.fromDate ?? new Date(Date.now() - lookbackHours * 3_600_000);

  const persistLog = options.persistLog ?? "always";
  const startedAt = new Date();

  // `startedAt` is selected because the duration is measured against it when
  // the run closes. BkSyncLog has no `createdAt` column at all.
  //
  // A "when-interesting" run writes nothing up front — there is no RUNNING row
  // to watch — and inserts a finished row at the end only if it found or broke
  // something. That trade is right for a poll that ticks every few seconds and
  // wrong for anything slower, which is why it is not the default.
  const syncLog =
    persistLog === "always"
      ? await prisma.bkSyncLog.create({
          data: {
            status: "RUNNING",
            lookbackHours,
            pageSize,
            triggeredById: options.triggeredById,
          },
          select: { id: true, startedAt: true },
        })
      : null;

  // Matching needs the association's code to recognise its payment references.
  const association = options.associationId
    ? await prisma.association.findUnique({
        where: { id: options.associationId },
        select: { code: true },
      })
    : null;

  const result: BkSyncResult = {
    transactionsFetched: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    duplicatesSkipped: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    errorsCount: 0,
    nextPage: null,
    hasMore: false,
  };

  let currentPage = 0;
  let pageCount = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  try {
    while (pageCount < maxPages) {
      try {
        const { transactions, hasMore } = await fetchBkTransactions({
          page: currentPage,
          size: pageSize,
          sort: "createdDate,desc",
          fromDate,
          toDate,
        });

        result.transactionsFetched += transactions.length;
        result.hasMore = hasMore;
        result.nextPage = hasMore ? currentPage + 1 : null;
        pageCount++;

        for (const tx of transactions) {
          try {
            const outcome = await ingestBkTransaction(tx, options.associationId);
            switch (outcome) {
              case "CREATED":
                result.transactionsCreated++;
                break;
              case "UPDATED":
                result.transactionsUpdated++;
                break;
              case "DUPLICATE":
                result.duplicatesSkipped++;
                break;
            }

            // Money that arrived with a usable reference should be attributed
            // without a human. Without this every transaction lands in the
            // manual queue and matchedCount is permanently zero.
            if (outcome === "CREATED" && options.associationId && association) {
              const matched = await autoMatchBkTransaction(
                tx.bkTransactionId,
                options.associationId,
                association.code
              );
              if (matched) result.matchedCount++;
              else result.unmatchedCount++;
            }
          } catch (error) {
            result.errorsCount++;
            bkLogger.error(
              { bkTransactionId: tx.bkTransactionId, ...serialiseError(error) },
              "failed to ingest BK transaction"
            );
          }
        }

        if (!hasMore) break;
        currentPage++;
        consecutiveErrors = 0;
      } catch (error) {
        result.errorsCount++;
        consecutiveErrors++;

        if (error instanceof BkApiError && !error.retryable) {
          throw error;
        }

        if (consecutiveErrors >= maxConsecutiveErrors) {
          bkLogger.error({ consecutiveErrors }, "too many consecutive errors, stopping sync");
          break;
        }

        bkLogger.warn(
          { page: currentPage, ...serialiseError(error) },
          "page fetch failed, retrying"
        );

        await new Promise((resolve) => setTimeout(resolve, 2000 * consecutiveErrors));
      }
    }

    // Close the loop: any claim this association raised that BK has now
    // surfaced as a transaction gets stamped as observed. Only worth a query
    // when something new actually arrived, so an idle poll costs nothing.
    if (options.associationId && result.transactionsCreated > 0) {
      const { markClaimsObserved } = await import("@/lib/services/bk-claims");
      await markClaimsObserved(options.associationId).catch((error) => {
        bkLogger.warn({ ...serialiseError(error) }, "claim observation pass failed");
      });
    }

    const outcome = {
      status: result.errorsCount > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      transactionsFetched: result.transactionsFetched,
      transactionsCreated: result.transactionsCreated,
      transactionsUpdated: result.transactionsUpdated,
      duplicatesSkipped: result.duplicatesSkipped,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
      errorsCount: result.errorsCount,
      nextPage: result.nextPage,
      hasMore: result.hasMore,
    };

    if (syncLog) {
      await prisma.bkSyncLog.update({ where: { id: syncLog.id }, data: outcome });
      bkLogger.info(result, "BK sync completed");
    } else if (interesting(result)) {
      await prisma.bkSyncLog.create({
        data: { ...outcome, startedAt, lookbackHours, pageSize, triggeredById: options.triggeredById },
      });
      bkLogger.info(result, "BK poll found new activity");
    }

    return result;
  } catch (error) {
    const failure = {
      status: "FAILED" as const,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      errorMessage: error instanceof Error ? error.message : String(error),
      errorDetails: serialiseError(error) as Prisma.InputJsonValue,
    };

    // A failure is always interesting — but a poll ticking every few seconds
    // against a bank that is down would write the same row thousands of times
    // a day. In quiet mode an unchanged failure is recorded once and then
    // suppressed until it changes or clears, so the log says "this broke, and
    // is still broken" without drowning everything else.
    if (syncLog) {
      await prisma.bkSyncLog.update({ where: { id: syncLog.id }, data: failure });
    } else if (await failureIsNew(failure.errorMessage)) {
      await prisma.bkSyncLog.create({
        data: { ...failure, startedAt, lookbackHours, pageSize, triggeredById: options.triggeredById },
      });
    }

    bkLogger.error({ ...serialiseError(error) }, "BK sync failed");
    throw error;
  }
}

/**
 * Whether this failure is worth its own row, or is the same outage repeating.
 *
 * Suppression is deliberately time-boxed as well as content-based: a fault
 * that has persisted for ten minutes gets a fresh row, so a long outage leaves
 * a visible trail rather than a single stale entry from when it started.
 */
const FAILURE_REPEAT_WINDOW_MS = 10 * 60_000;

/**
 * Collapses the varying parts of an error message so two reports of the same
 * fault compare equal.
 *
 * BK echoes its own clock inside the error body it returns, so the raw text of
 * "credentials expired" differs on every single call. Comparing messages
 * verbatim therefore treats one continuous outage as thousands of distinct
 * faults, which is precisely the flood the suppression exists to prevent.
 */
function failureFingerprint(message: string): string {
  return message.replace(/\d+/g, "#").slice(0, 300);
}

async function failureIsNew(errorMessage: string): Promise<boolean> {
  const latest = await prisma.bkSyncLog.findFirst({
    orderBy: { startedAt: "desc" },
    select: { status: true, errorMessage: true, startedAt: true },
  });

  if (!latest || latest.status !== "FAILED" || !latest.errorMessage) return true;

  if (failureFingerprint(latest.errorMessage) !== failureFingerprint(errorMessage)) {
    return true;
  }

  return Date.now() - latest.startedAt.getTime() > FAILURE_REPEAT_WINDOW_MS;
}

/** Whether a quiet run did enough to be worth a row in the sync log. */
function interesting(result: BkSyncResult): boolean {
  return (
    result.transactionsCreated > 0 ||
    result.transactionsUpdated > 0 ||
    result.errorsCount > 0
  );
}

type IngestOutcome = "CREATED" | "UPDATED" | "DUPLICATE";

async function ingestBkTransaction(
  tx: NormalisedBkTransaction,
  associationId?: string
): Promise<IngestOutcome> {
  try {
    const existing = await prisma.bkTransaction.findUnique({
      where: { bkTransactionId: tx.bkTransactionId },
      select: { id: true, reconciliationStatus: true },
    });

    if (existing) {
      await prisma.bkTransaction.update({
        where: { bkTransactionId: tx.bkTransactionId },
        data: {
          lastSyncedAt: new Date(),
          bkStatus: tx.bkStatus,
          bkExtrasStatus: tx.bkExtrasStatus,
          amount: tx.amount,
          currency: tx.currency,
          rawPayload: tx.rawPayload as object,
        },
      });
      return "UPDATED";
    }

    await prisma.bkTransaction.create({
      data: {
        associationId: associationId ?? null,
        bkTransactionId: tx.bkTransactionId,
        bkClientReference: tx.bkClientReference,
        bkTransactionReference: tx.bkTransactionReference,
        bkPaymentCode: tx.bkPaymentCode,
        bkExtrasClientReference: tx.bkExtrasClientReference,
        amount: tx.amount,
        currency: tx.currency,
        bkStatus: tx.bkStatus,
        bkExtrasStatus: tx.bkExtrasStatus,
        payerNames: tx.payerNames,
        payerAccount: tx.payerAccount,
        payerContact: tx.payerContact,
        payeeNames: tx.payeeNames,
        payeeAccount: tx.payeeAccount,
        beneficiaryNames: tx.beneficiaryNames,
        beneficiaryBank: tx.beneficiaryBank,
        beneficiaryBankCode: tx.beneficiaryBankCode,
        narration: tx.narration,
        serviceCode: tx.serviceCode,
        transferType: tx.transferType,
        sourceChannel: tx.sourceChannel,
        transactionStage: tx.transactionStage,
        transactionStatus: tx.transactionStatus,
        transactionStatusComment: tx.transactionStatusComment,
        digitalProfileId: tx.digitalProfileId,
        debitedAccount: tx.debitedAccount,
        debitedAccountOwnerNames: tx.debitedAccountOwnerNames,
        creditedAccount: tx.creditedAccount,
        creditedAccountOwnerNames: tx.creditedAccountOwnerNames,
        debitCurrency: tx.debitCurrency,
        creditCurrency: tx.creditCurrency,
        debitAccount: tx.debitAccount,
        creditAccount: tx.creditAccount,
        transactionDate: tx.transactionDate,
        createdDate: tx.createdDate,
        updatedDate: tx.updatedDate,
        rawPayload: tx.rawPayload as object,
        reconciliationStatus: "UNMATCHED",
        matchStrategy: "NONE",
        matchConfidence: 0,
      },
    });

    return "CREATED";
  } catch (error) {
    if (isUniqueConstraintError(error, "bkTransactionId")) {
      return "DUPLICATE";
    }
    throw error;
  }
}

/**
 * Runs the matcher over a freshly ingested transaction and records the result.
 *
 * Only a confident, unambiguous match is written. Anything else is left
 * UNMATCHED for an administrator, because attributing money to the wrong
 * member is far more expensive than leaving it in a queue.
 */
const AUTO_MATCH_THRESHOLD = 90;

async function autoMatchBkTransaction(
  bkTransactionId: string,
  associationId: string,
  associationCode: string
): Promise<boolean> {
  const row = await prisma.bkTransaction.findUnique({
    where: { bkTransactionId },
    select: { id: true },
  });
  if (!row) return false;

  const match = await matchBkTransactionToMember(row.id, associationId, associationCode);

  const confident =
    match.member !== null &&
    match.confidence >= AUTO_MATCH_THRESHOLD &&
    match.strategy !== "NONE";

  await prisma.bkTransactionReconciliation.create({
    data: {
      bkTransactionId: row.id,
      attempt: 1,
      outcome: confident ? "MATCHED" : "UNMATCHED",
      strategy: match.strategy,
      confidence: match.confidence,
      candidateIds: match.candidates.map((c) => c.memberId),
      resolvedMemberId: confident ? match.member!.memberId : null,
      notes: match.evidence,
    },
  });

  if (!confident) return false;

  await prisma.bkTransaction.update({
    where: { id: row.id },
    data: {
      reconciliationStatus: "MATCHED",
      matchedMemberId: match.member!.memberId,
      matchStrategy: match.strategy,
      matchConfidence: match.confidence,
      matchedAt: new Date(),
      matchReason: match.evidence,
    },
  });

  return true;
}

export async function matchBkTransactionToMember(
  bkTransactionId: string,
  associationId: string,
  associationCode: string
): Promise<BkMatchResult> {
  const tx = await prisma.bkTransaction.findUniqueOrThrow({
    where: { id: bkTransactionId },
    select: {
      bkTransactionId: true,
      bkClientReference: true,
      bkPaymentCode: true,
      bkExtrasClientReference: true,
      payerNames: true,
      payerAccount: true,
      payerContact: true,
      narration: true,
    },
  });

  const searchText = [tx.narration, tx.bkClientReference, tx.bkPaymentCode]
    .filter(Boolean)
    .join(" ");

  const references = extractPaymentReferences(searchText, associationCode);
  for (const ref of references) {
    const member = await findMemberByPaymentReference(ref, associationId);
    if (member) {
      return {
        strategy: "MEMBER_PAYMENT_REFERENCE",
        confidence: CONFIDENCE.MEMBER_PAYMENT_REFERENCE,
        member,
        candidates: [member],
        evidence: `Payment reference "${ref}" found in BK transaction`,
      };
    }
  }

  const memberNumbers = extractMemberNumbers(searchText, associationCode);
  for (const num of memberNumbers) {
    const member = await findMemberByMemberNumber(num, associationId);
    if (member) {
      return {
        strategy: "EXTERNAL_REFERENCE",
        confidence: CONFIDENCE.EXTERNAL_REFERENCE,
        member,
        candidates: [member],
        evidence: `Membership number "${num}" found in BK transaction`,
      };
    }
  }

  if (tx.bkPaymentCode) {
    const match = await findMemberByPaymentCode(tx.bkPaymentCode, associationId);
    if (match) {
      return {
        strategy: "PAYMENT_CODE",
        confidence: CONFIDENCE.PAYMENT_CODE,
        member: match,
        candidates: [match],
        evidence: `BK payment code matches an RTA payment`,
      };
    }
  }

  if (tx.payerContact) {
    const phoneKey = phoneMatchKey(tx.payerContact);
    if (phoneKey) {
      const matches = await findMembersByPhone(phoneKey, associationId);
      if (matches.length === 1) {
        return {
          strategy: "PHONE_NUMBER",
          confidence: CONFIDENCE.PHONE_NUMBER,
          member: matches[0],
          candidates: matches,
          evidence: `Payer contact matches member's registered phone`,
        };
      }
      if (matches.length > 1) {
        return ambiguous("PHONE_NUMBER", matches, "phone number");
      }
    }
  }

  if (tx.payerAccount) {
    const matches = await findMembersByBankAccount(tx.payerAccount, associationId);
    if (matches.length === 1) {
      return {
        strategy: "BANK_ACCOUNT",
        confidence: CONFIDENCE.BANK_ACCOUNT,
        member: matches[0],
        candidates: matches,
        evidence: `Payer bank account matches member's registered account`,
      };
    }
    if (matches.length > 1) {
      return ambiguous("BANK_ACCOUNT", matches, "bank account");
    }
  }

  if (tx.payerNames) {
    const nameMatch = await matchByPayerName(tx.payerNames, associationId);
    if (nameMatch) return nameMatch;
  }

  bkLogger.debug(
    { bkTransactionId: tx.bkTransactionId },
    "BK transaction could not be matched to a member"
  );

  return {
    strategy: "NONE",
    confidence: 0,
    member: null,
    candidates: [],
    evidence: "No usable identifier found on the BK transaction",
  };
}

async function matchByPayerName(
  payerName: string | null,
  associationId: string
): Promise<BkMatchResult | null> {
  if (!payerName) return null;

  const tokens = payerName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (tokens.length < 2) return null;

  const insensitive = "insensitive" as const;

  // One `in` clause covers every token, so it belongs outside the loop; the
  // prefix clauses are the only per-token part.
  const nameFilters: Prisma.UserWhereInput[] = [
    { firstName: { in: tokens, mode: insensitive } },
    { lastName: { in: tokens, mode: insensitive } },
  ];

  for (const token of tokens) {
    if (token.length >= 4) {
      nameFilters.push({ firstName: { startsWith: token, mode: insensitive } });
      nameFilters.push({ lastName: { startsWith: token, mode: insensitive } });
    }
  }

  const members = await prisma.member.findMany({
    where: {
      associationId,
      status: "ACTIVE",
      user: { OR: nameFilters },
    },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: {
        where: { isActive: true },
        take: 1,
        select: { id: true },
      },
    },
    take: 10,
  });

  const candidates = members.map((m) => ({
    memberId: m.id,
    memberNumber: m.memberNumber,
    fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
    paymentReference: m.paymentReference,
    savingsAccountId: m.savingsAccounts[0]?.id ?? null,
  }));

  const exact = candidates.filter((c) => {
    const memberTokens = c.fullName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    return tokens.every((t) => memberTokens.includes(t));
  });

  if (exact.length === 1) {
    return {
      strategy: "PAYER_NAME",
      confidence: CONFIDENCE.PAYER_NAME_EXACT,
      member: exact[0],
      candidates: exact,
      evidence: `Payer name "${payerName}" matches member exactly`,
    };
  }

  if (exact.length > 1) {
    return ambiguous("PAYER_NAME", exact, "payer name");
  }

  return null;
}

function ambiguous(
  strategy: string,
  candidates: BkMatchCandidate[],
  identifier: string
): BkMatchResult {
  return {
    strategy: strategy as BkMatchResult["strategy"],
    confidence: 0,
    member: null,
    candidates,
    evidence: `${candidates.length} members share this ${identifier} — manual review required`,
  };
}

async function findMemberByPaymentReference(
  reference: string,
  associationId: string
): Promise<BkMatchCandidate | null> {
  const member = await prisma.member.findFirst({
    where: { associationId, paymentReference: reference, status: "ACTIVE" },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
  });

  if (!member) return null;

  return {
    memberId: member.id,
    memberNumber: member.memberNumber,
    fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
    paymentReference: member.paymentReference,
    savingsAccountId: member.savingsAccounts[0]?.id ?? null,
  };
}

async function findMemberByMemberNumber(
  memberNumber: string,
  associationId: string
): Promise<BkMatchCandidate | null> {
  const member = await prisma.member.findFirst({
    where: { associationId, memberNumber, status: "ACTIVE" },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
  });

  if (!member) return null;

  return {
    memberId: member.id,
    memberNumber: member.memberNumber,
    fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
    paymentReference: member.paymentReference,
    savingsAccountId: member.savingsAccounts[0]?.id ?? null,
  };
}

/**
 * Resolves a BK payment code to the member whose claim carried it.
 *
 * The code is the payer's own six-digit code from Internet Banking or the BK
 * app, so it only identifies a member if this system recorded the claim that
 * used it. It is matched against the payment reference we issued for that
 * claim — never used as an excuse to pick a member.
 */
async function findMemberByPaymentCode(
  paymentCode: string,
  associationId: string
): Promise<BkMatchCandidate | null> {
  const code = paymentCode.trim();
  if (!code) return null;

  const claim = await prisma.bkPaymentClaim.findFirst({
    where: { associationId, payerCode: code, memberId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { memberId: true },
  });

  if (!claim?.memberId) return null;

  const member = await prisma.member.findFirst({
    where: { id: claim.memberId, associationId, status: "ACTIVE" },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
  });

  return member
    ? {
        memberId: member.id,
        memberNumber: member.memberNumber,
        fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
        paymentReference: member.paymentReference,
        savingsAccountId: member.savingsAccounts[0]?.id ?? null,
      }
    : null;
}

async function findMembersByPhone(
  phoneKey: string,
  associationId: string
): Promise<BkMatchCandidate[]> {
  const members = await prisma.member.findMany({
    where: {
      associationId,
      status: "ACTIVE",
      user: { phone: { endsWith: phoneKey } },
    },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
    take: 5,
  });

  return members.map((m) => ({
    memberId: m.id,
    memberNumber: m.memberNumber,
    fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
    paymentReference: m.paymentReference,
    savingsAccountId: m.savingsAccounts[0]?.id ?? null,
  }));
}

async function findMembersByBankAccount(
  accountNumber: string,
  associationId: string
): Promise<BkMatchCandidate[]> {
  const cleaned = accountNumber.replace(/\s/g, "");
  if (cleaned.length < 6) return [];

  const members = await prisma.member.findMany({
    where: {
      associationId,
      status: "ACTIVE",
      bankAccountNumber: cleaned,
    },
    select: {
      id: true,
      memberNumber: true,
      paymentReference: true,
      user: { select: { firstName: true, lastName: true } },
      savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
    },
    take: 5,
  });

  return members.map((m) => ({
    memberId: m.id,
    memberNumber: m.memberNumber,
    fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
    paymentReference: m.paymentReference,
    savingsAccountId: m.savingsAccounts[0]?.id ?? null,
  }));
}

export async function manuallyMatchBkTransaction(params: {
  bkTransactionId: string;
  memberId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!params.reason?.trim()) {
    return { ok: false, message: "A reason is required to match a transaction manually" };
  }

  const bkTx = await prisma.bkTransaction.findUniqueOrThrow({
    where: { id: params.bkTransactionId },
    select: {
      id: true,
      associationId: true,
      bkTransactionId: true,
      amount: true,
      reconciliationStatus: true,
      matchedMemberId: true,
    },
  });

  if (bkTx.reconciliationStatus === "COMPLETED") {
    return { ok: false, message: "This transaction has already been reconciled" };
  }

  if (bkTx.reconciliationStatus === "MATCHED" || bkTx.reconciliationStatus === "MANUALLY_MATCHED") {
    return { ok: false, message: "This transaction is already matched to a member" };
  }

  // A transaction with no association must not be matchable at all: passing
  // `undefined` as the filter would drop the tenant condition entirely and let
  // an administrator attach it to a member of any association on the platform.
  if (!bkTx.associationId) {
    return {
      ok: false,
      message:
        "This transaction is not assigned to an association yet, so it cannot be matched to a member",
    };
  }

  const member = await prisma.member.findFirst({
    where: { id: params.memberId, associationId: bkTx.associationId },
    select: {
      id: true,
      memberNumber: true,
      status: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  if (!member) {
    return { ok: false, message: "Member not found in this association" };
  }

  if (member.status !== "ACTIVE") {
    return { ok: false, message: "This member's account is not active" };
  }

  await prisma.bkTransaction.update({
    where: { id: bkTx.id },
    data: {
      reconciliationStatus: "MANUALLY_MATCHED",
      matchedMemberId: member.id,
      matchStrategy: "MANUAL",
      matchConfidence: 100,
      matchedById: params.adminUserId,
      matchedAt: new Date(),
      matchReason: params.reason,
    },
  });

  await prisma.bkTransactionReconciliation.create({
    data: {
      bkTransactionId: bkTx.id,
      attempt: 1,
      outcome: "MATCHED",
      strategy: "MANUAL",
      confidence: 100,
      candidateIds: [member.id],
      resolvedMemberId: member.id,
      notes: params.reason,
      performedById: params.adminUserId,
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.BK_TRANSACTION_MATCHED_MANUALLY,
      entityType: "BkTransaction",
      entityId: bkTx.id,
      associationId: bkTx.associationId,
      newValue: {
        memberId: member.id,
        memberNumber: member.memberNumber,
        memberName: `${member.user.firstName} ${member.user.lastName}`,
        amount: bkTx.amount.toFixed(2),
        bkTransactionId: bkTx.bkTransactionId,
      },
      reason: params.reason,
      severity: "CRITICAL",
    },
    { id: params.adminUserId }
  );

  bkLogger.info(
    {
      bkTransactionId: bkTx.id,
      memberId: member.id,
      adminUserId: params.adminUserId,
    },
    "BK transaction manually matched"
  );

  return { ok: true };
}

export async function unmatchBkTransaction(params: {
  bkTransactionId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!params.reason?.trim()) {
    return { ok: false, message: "A reason is required to unmatch a transaction" };
  }

  const bkTx = await prisma.bkTransaction.findUniqueOrThrow({
    where: { id: params.bkTransactionId },
    select: {
      id: true,
      associationId: true,
      bkTransactionId: true,
      reconciliationStatus: true,
      matchedMemberId: true,
    },
  });

  if (!bkTx.matchedMemberId) {
    return { ok: false, message: "This transaction is not matched to any member" };
  }

  if (bkTx.reconciliationStatus === "COMPLETED") {
    return { ok: false, message: "This transaction has been completed and cannot be unmatched" };
  }

  await prisma.bkTransaction.update({
    where: { id: bkTx.id },
    data: {
      reconciliationStatus: "UNMATCHED",
      matchedMemberId: null,
      matchStrategy: "NONE",
      matchConfidence: 0,
      matchedById: null,
      matchedAt: null,
      matchReason: null,
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.BK_TRANSACTION_UNMATCHED,
      entityType: "BkTransaction",
      entityId: bkTx.id,
      associationId: bkTx.associationId,
      oldValue: { matchedMemberId: bkTx.matchedMemberId },
      reason: params.reason,
      severity: "WARNING",
    },
    { id: params.adminUserId }
  );

  bkLogger.info(
    { bkTransactionId: bkTx.id, adminUserId: params.adminUserId },
    "BK transaction unmatched"
  );

  return { ok: true };
}

export async function getBkTransactionStats(associationId: string | null) {
  const scope = associationId ? { associationId } : {};

  const [
    total,
    matched,
    unmatched,
    manuallyMatched,
    pending,
    failed,
    completed,
    totalAmount,
    matchedAmount,
  ] = await Promise.all([
    prisma.bkTransaction.count({ where: scope }),
    prisma.bkTransaction.count({ where: { ...scope, reconciliationStatus: "MATCHED" } }),
    prisma.bkTransaction.count({ where: { ...scope, reconciliationStatus: "UNMATCHED" } }),
    prisma.bkTransaction.count({ where: { ...scope, reconciliationStatus: "MANUALLY_MATCHED" } }),
    prisma.bkTransaction.count({ where: { ...scope, bkExtrasStatus: "PENDING" } }),
    prisma.bkTransaction.count({ where: { ...scope, bkExtrasStatus: "FAILED" } }),
    prisma.bkTransaction.count({ where: { ...scope, reconciliationStatus: "COMPLETED" } }),
    prisma.bkTransaction.aggregate({ where: scope, _sum: { amount: true } }),
    prisma.bkTransaction.aggregate({
      where: { ...scope, reconciliationStatus: { in: ["MATCHED", "MANUALLY_MATCHED", "COMPLETED"] } },
      _sum: { amount: true },
    }),
  ]);

  return {
    total,
    matched,
    unmatched,
    manuallyMatched,
    pending,
    failed,
    completed,
    totalAmount: totalAmount._sum.amount?.toFixed(2) ?? "0.00",
    matchedAmount: matchedAmount._sum.amount?.toFixed(2) ?? "0.00",
  };
}

export interface BkTransactionListItem {
  id: string;
  bkTransactionId: string;
  amount: string;
  currency: string;
  payerNames: string | null;
  payerAccount: string | null;
  narration: string | null;
  bkStatus: string | null;
  reconciliationStatus: string;
  matchStrategy: string;
  matchConfidence: number;
  memberName: string | null;
  transactionDate: Date | null;
  importedAt: Date;
}

/**
 * The transactions already ingested for an association, newest first.
 *
 * Account numbers are masked the way the API route masks them: this list is
 * read on screen by whoever is testing the integration, and a full payer
 * account number is not something a diagnostic page needs to display.
 */
export async function listRecentBkTransactions(
  associationId: string | null,
  limit = 50
): Promise<BkTransactionListItem[]> {
  const rows = await prisma.bkTransaction.findMany({
    where: associationId ? { associationId } : {},
    // `transactionDate` is null on anything BK gave no timestamp for, and
    // nulls sort last on a descending order, which would bury exactly the
    // rows worth looking at. `importedAt` is always set.
    orderBy: [{ transactionDate: "desc" }, { importedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      bkTransactionId: true,
      amount: true,
      currency: true,
      payerNames: true,
      payerAccount: true,
      narration: true,
      bkStatus: true,
      reconciliationStatus: true,
      matchStrategy: true,
      matchConfidence: true,
      transactionDate: true,
      importedAt: true,
      matchedMember: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    bkTransactionId: r.bkTransactionId,
    amount: r.amount.toFixed(2),
    currency: r.currency,
    payerNames: r.payerNames,
    payerAccount: maskAccount(r.payerAccount),
    narration: r.narration,
    bkStatus: r.bkStatus,
    reconciliationStatus: r.reconciliationStatus,
    matchStrategy: r.matchStrategy,
    matchConfidence: r.matchConfidence,
    memberName: r.matchedMember
      ? `${r.matchedMember.user.firstName} ${r.matchedMember.user.lastName}`.trim()
      : null,
    transactionDate: r.transactionDate,
    importedAt: r.importedAt,
  }));
}

function maskAccount(account: string | null): string | null {
  if (!account) return null;
  if (account.length <= 6) return account;
  return `${account.slice(0, 4)}***${account.slice(-4)}`;
}

/** The oldest transaction held for an association, so the UI can say how far back the record goes. */
export async function getBkTransactionCoverage(associationId: string | null) {
  const where = associationId ? { associationId } : {};

  const [oldest, newest, total] = await Promise.all([
    prisma.bkTransaction.findFirst({
      where,
      orderBy: { transactionDate: "asc" },
      select: { transactionDate: true },
    }),
    prisma.bkTransaction.findFirst({
      where,
      orderBy: { transactionDate: "desc" },
      select: { transactionDate: true },
    }),
    prisma.bkTransaction.count({ where }),
  ]);

  return {
    oldest: oldest?.transactionDate ?? null,
    newest: newest?.transactionDate ?? null,
    total,
  };
}

export async function getBkSyncLogs(limit = 20) {
  return prisma.bkSyncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      transactionsFetched: true,
      transactionsCreated: true,
      transactionsUpdated: true,
      duplicatesSkipped: true,
      matchedCount: true,
      unmatchedCount: true,
      errorsCount: true,
      hasMore: true,
      nextPage: true,
      errorMessage: true,
    },
  });
}
