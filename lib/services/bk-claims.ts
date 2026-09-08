import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { bkLogger, serialiseError } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { claimPayment, getBkConfig } from "@/lib/bk";
import { BkApiError } from "@/lib/bk/types";
import { toMoneyString } from "@/lib/money";

/**
 * Payment claims: the half of the BK loop that RTA initiates.
 *
 * A claim declares an intent to collect and BK answers CLAIMED. The
 * transaction sync is the other half. Recording the claim is what makes the
 * integration testable at all: without it there is no way to ask whether a
 * payment we raised ever came back through getTransactions.
 */

export interface CreateClaimParams {
  associationId: string;
  /** Six-digit code the payer generated in Internet Banking or the BK app. */
  payerCode: string;
  narration: string;
  amount: number;
  memberId?: string | null;
  createdById: string;
}

export type CreateClaimResult =
  | { ok: true; claimId: string; clientReference: string; status: string; expiryTime: string | null }
  | { ok: false; message: string; claimId?: string };

/** BK's payerCode is a six-digit code; anything else is a typo, not a claim. */
function validPayerCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export async function createBkPaymentClaim(
  params: CreateClaimParams
): Promise<CreateClaimResult> {
  const config = getBkConfig();

  if (!config.configured) {
    return {
      ok: false,
      message: "BK credentials are not configured, so a payment cannot be claimed.",
    };
  }

  const payerCode = params.payerCode.trim();
  if (!validPayerCode(payerCode)) {
    return { ok: false, message: "The payer code must be exactly six digits." };
  }

  const narration = params.narration.trim();
  if (!narration) {
    return { ok: false, message: "A narration is required." };
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return { ok: false, message: "The amount must be greater than zero." };
  }

  if (params.memberId) {
    const member = await prisma.member.findFirst({
      where: { id: params.memberId, associationId: params.associationId },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, message: "Member not found in this association." };
    }
  }

  // Ours to generate, and BK's duplicate guard, so it has to be unique per
  // claim. It is also the thread that ties the claim to the transaction that
  // eventually comes back.
  const clientReference = randomUUID();

  // The claim row is written BEFORE the call, so a request that succeeds at
  // the bank but fails on the way back to us is still recorded rather than
  // becoming money nobody knows was asked for.
  const claim = await prisma.bkPaymentClaim.create({
    data: {
      associationId: params.associationId,
      clientReference,
      payerCode,
      narration,
      amount: toMoneyString(params.amount),
      memberId: params.memberId ?? null,
      status: "PENDING",
      createdById: params.createdById,
    },
    select: { id: true },
  });

  try {
    const response = await claimPayment({
      clientReference,
      payerCode,
      narration,
      amount: params.amount,
    });

    const expiry = response?.expiryTime ? new Date(response.expiryTime.replace(" ", "T")) : null;

    await prisma.bkPaymentClaim.update({
      where: { id: claim.id },
      data: {
        status: response?.status ?? "UNKNOWN",
        expiryTime: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
        rawResponse: response as object,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.BK_PAYMENT_CLAIMED,
        entityType: "BkPaymentClaim",
        entityId: claim.id,
        associationId: params.associationId,
        newValue: {
          clientReference,
          payerCode,
          amount: toMoneyString(params.amount),
          status: response?.status ?? "UNKNOWN",
        },
        severity: "NOTICE",
      },
      { id: params.createdById }
    );

    bkLogger.info({ claimId: claim.id, clientReference, status: response?.status }, "BK claim raised");

    return {
      ok: true,
      claimId: claim.id,
      clientReference,
      status: response?.status ?? "UNKNOWN",
      expiryTime: response?.expiryTime ?? null,
    };
  } catch (error) {
    const message =
      error instanceof BkApiError ? error.message : "The claim could not be sent to BK.";

    await prisma.bkPaymentClaim.update({
      where: { id: claim.id },
      data: { status: "FAILED", failed: true, errorMessage: message },
    });

    bkLogger.error({ claimId: claim.id, ...serialiseError(error) }, "BK claim failed");

    return { ok: false, message, claimId: claim.id };
  }
}

/**
 * Stamps claims that the transaction sync has since surfaced.
 *
 * A claim is considered observed once a BK transaction carrying the same
 * clientReference has been ingested. This is the measurement the association
 * actually wants: did the money we asked for come back, and how long did BK
 * take to show it?
 */
export async function markClaimsObserved(associationId: string): Promise<number> {
  const pending = await prisma.bkPaymentClaim.findMany({
    where: { associationId, observedAt: null, failed: false },
    select: { id: true, clientReference: true },
    take: 500,
  });

  if (pending.length === 0) return 0;

  const references = pending.map((c) => c.clientReference);

  // BK echoes our reference back on either the envelope or the extras, so both
  // are checked.
  const seen = await prisma.bkTransaction.findMany({
    where: {
      OR: [
        { bkClientReference: { in: references } },
        { bkExtrasClientReference: { in: references } },
      ],
    },
    select: { id: true, bkClientReference: true, bkExtrasClientReference: true },
  });

  if (seen.length === 0) return 0;

  const byReference = new Map<string, string>();
  for (const tx of seen) {
    if (tx.bkClientReference) byReference.set(tx.bkClientReference, tx.id);
    if (tx.bkExtrasClientReference) byReference.set(tx.bkExtrasClientReference, tx.id);
  }

  const now = new Date();
  let stamped = 0;

  for (const claim of pending) {
    const transactionId = byReference.get(claim.clientReference);
    if (!transactionId) continue;

    await prisma.bkPaymentClaim.update({
      where: { id: claim.id },
      data: { observedAt: now, observedTransactionId: transactionId },
    });
    stamped++;
  }

  if (stamped > 0) {
    bkLogger.info({ associationId, stamped }, "BK claims observed in transactions");
  }

  return stamped;
}

export interface ClaimListItem {
  id: string;
  clientReference: string;
  payerCode: string;
  narration: string;
  amount: string;
  status: string;
  failed: boolean;
  errorMessage: string | null;
  expiryTime: Date | null;
  observedAt: Date | null;
  observedTransactionId: string | null;
  createdAt: Date;
  memberName: string | null;
  createdByName: string | null;
}

export async function listBkPaymentClaims(
  associationId: string,
  limit = 50
): Promise<ClaimListItem[]> {
  const rows = await prisma.bkPaymentClaim.findMany({
    where: { associationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      clientReference: true,
      payerCode: true,
      narration: true,
      amount: true,
      status: true,
      failed: true,
      errorMessage: true,
      expiryTime: true,
      observedAt: true,
      observedTransactionId: true,
      createdAt: true,
      member: { select: { user: { select: { firstName: true, lastName: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    clientReference: r.clientReference,
    payerCode: r.payerCode,
    narration: r.narration,
    amount: r.amount.toFixed(2),
    status: r.status,
    failed: r.failed,
    errorMessage: r.errorMessage,
    expiryTime: r.expiryTime,
    observedAt: r.observedAt,
    observedTransactionId: r.observedTransactionId,
    createdAt: r.createdAt,
    memberName: r.member
      ? `${r.member.user.firstName} ${r.member.user.lastName}`.trim()
      : null,
    createdByName: r.createdBy
      ? `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim()
      : null,
  }));
}
