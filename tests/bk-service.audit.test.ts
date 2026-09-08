import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { BkApiError } from "@/lib/bk/types";
import {
  matchBkTransactionToMember,
  manuallyMatchBkTransaction,
  unmatchBkTransaction,
  getBkTransactionStats,
  syncBkTransactions,
} from "@/lib/services/bk-transactions";

/**
 * Independent verification of the BK reconciliation service.
 *
 * The shipped code is exercised unmodified against the real database, in the
 * same style as the Jenga reconciliation tests. The cases below are the ones
 * that cost real money: crediting the wrong member, crediting across
 * associations, and losing the sync audit trail.
 */

const RUN = `BKA${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);
const OTHER_CODE = `X${CODE.slice(1)}`;

let associationId: string;
let otherAssociationId: string;
let adminUserId: string;

interface TestMember {
  memberId: string;
  memberNumber: string;
  paymentReference: string;
}

const members: Record<string, TestMember> = {};

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `BK Audit ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const other = await prisma.association.create({
    data: { code: OTHER_CODE, name: `BK Audit Other ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  otherAssociationId = other.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@bk.test`,
      firstName: "BK",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminUserId = admin.id;

  // alice is created FIRST, so she is the row an unfiltered findFirst returns.
  members.alice = await createMember(associationId, CODE, "alice", "000001", "+250788300001");
  members.bob = await createMember(associationId, CODE, "bob", "000002", "+250788300002");
  members.outsider = await createMember(
    otherAssociationId,
    OTHER_CODE,
    "outsider",
    "000003",
    "+250788300003"
  );
});

afterAll(async () => {
  const scope = { in: [associationId, otherAssociationId] };
  await prisma.bkTransactionReconciliation.deleteMany({
    where: { bkTransaction: { associationId: scope } },
  });
  await prisma.bkTransaction.deleteMany({ where: { associationId: scope } });
  await prisma.bkSyncLog.deleteMany({ where: { triggeredById: adminUserId } });
  await prisma.auditLog.deleteMany({ where: { associationId: scope } });
  await prisma.savingsAccount.deleteMany({ where: { associationId: scope } });
  await prisma.member.deleteMany({ where: { associationId: scope } });
  await prisma.user.deleteMany({ where: { associationId: scope } });
  await prisma.association.deleteMany({ where: { id: scope } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

// --- matching --------------------------------------------------------------

describe("matchBkTransactionToMember", () => {
  it("matches on the payment reference with full confidence", async () => {
    const tx = await createBkTransaction({
      narration: `Savings ${members.alice.paymentReference}`,
    });

    const result = await matchBkTransactionToMember(tx.id, associationId, CODE);

    expect(result.strategy).toBe("MEMBER_PAYMENT_REFERENCE");
    expect(result.confidence).toBe(100);
    expect(result.member?.memberId).toBe(members.alice.memberId);
  });

  it("matches on a quoted membership number", async () => {
    const tx = await createBkTransaction({
      narration: `Paying for ${members.bob.memberNumber}`,
    });

    const result = await matchBkTransactionToMember(tx.id, associationId, CODE);

    expect(result.strategy).toBe("EXTERNAL_REFERENCE");
    expect(result.member?.memberId).toBe(members.bob.memberId);
  });

  it("matches a registered phone number to its owner", async () => {
    const tx = await createBkTransaction({
      narration: "no reference given",
      payerContact: "250788300002",
    });

    const result = await matchBkTransactionToMember(tx.id, associationId, CODE);

    expect(result.strategy).toBe("PHONE_NUMBER");
    expect(result.member?.memberId).toBe(members.bob.memberId);
  });

  it("refuses to match when nothing identifies the payer", async () => {
    const tx = await createBkTransaction({
      narration: "monthly contribution",
      payerNames: null,
      payerContact: null,
      payerAccount: null,
    });

    const result = await matchBkTransactionToMember(tx.id, associationId, CODE);

    expect(result.strategy).toBe("NONE");
    expect(result.member).toBeNull();
  });

  it("does not resolve an unknown payment code to an arbitrary member", async () => {
    // A payment code BK issued that corresponds to no RTA record must not be
    // matched. Crediting it to whichever member happens to come back first
    // moves one member's money into another member's savings account.
    const tx = await createBkTransaction({
      narration: "no reference given",
      bkPaymentCode: "PAYCODE-THAT-MATCHES-NOTHING",
      payerNames: null,
      payerContact: null,
      payerAccount: null,
    });

    const result = await matchBkTransactionToMember(tx.id, associationId, CODE);

    expect(result.member).toBeNull();
  });

  it("never matches a transaction to a member of another association", async () => {
    const tx = await createBkTransaction({
      narration: "no reference given",
      bkPaymentCode: "PAYCODE-THAT-MATCHES-NOTHING",
      payerNames: null,
      payerContact: null,
      payerAccount: null,
    });

    const result = await matchBkTransactionToMember(tx.id, otherAssociationId, OTHER_CODE);

    expect(result.member?.memberId).not.toBe(members.alice.memberId);
    expect(result.member?.memberId).not.toBe(members.bob.memberId);
  });
});

// --- manual matching -------------------------------------------------------

describe("manuallyMatchBkTransaction", () => {
  it("records the match, the actor and the reason", async () => {
    const tx = await createBkTransaction({ narration: "manual case" });

    const outcome = await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "Confirmed by phone with the member",
    });

    expect(outcome.ok).toBe(true);

    const stored = await prisma.bkTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.reconciliationStatus).toBe("MANUALLY_MATCHED");
    expect(stored.matchedMemberId).toBe(members.alice.memberId);
    expect(stored.matchedById).toBe(adminUserId);
    expect(stored.matchReason).toBe("Confirmed by phone with the member");
  });

  it("requires a reason", async () => {
    const tx = await createBkTransaction({ narration: "no reason given" });

    const outcome = await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "   ",
    });

    expect(outcome.ok).toBe(false);
  });

  it("refuses to match a member from another association", async () => {
    const tx = await createBkTransaction({ narration: "cross tenant" });

    const outcome = await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.outsider.memberId,
      adminUserId,
      reason: "should be rejected",
    });

    expect(outcome.ok).toBe(false);
  });

  it("refuses to match an unassociated transaction to any member at all", async () => {
    // associationId is nullable on BkTransaction, and the sync leaves it null
    // whenever no association is passed. An admin must not be able to pull
    // such a transaction into an arbitrary association.
    const tx = await createBkTransaction({ narration: "orphan" }, null);

    const outcome = await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.outsider.memberId,
      adminUserId,
      reason: "should be rejected",
    });

    expect(outcome.ok).toBe(false);
  });

  it("refuses to re-match an already matched transaction", async () => {
    const tx = await createBkTransaction({ narration: "double match" });

    await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "first match",
    });

    const second = await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.bob.memberId,
      adminUserId,
      reason: "second match",
    });

    expect(second.ok).toBe(false);
  });
});

describe("unmatchBkTransaction", () => {
  it("clears the match and leaves an audit trail", async () => {
    const tx = await createBkTransaction({ narration: "to be unmatched" });

    await manuallyMatchBkTransaction({
      bkTransactionId: tx.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "matched in error",
    });

    const outcome = await unmatchBkTransaction({
      bkTransactionId: tx.id,
      adminUserId,
      reason: "wrong member",
    });

    expect(outcome.ok).toBe(true);

    const stored = await prisma.bkTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.matchedMemberId).toBeNull();
    expect(stored.reconciliationStatus).toBe("UNMATCHED");
  });

  it("refuses to unmatch a completed transaction", async () => {
    const tx = await createBkTransaction({ narration: "completed" });
    await prisma.bkTransaction.update({
      where: { id: tx.id },
      data: { reconciliationStatus: "COMPLETED", matchedMemberId: members.alice.memberId },
    });

    const outcome = await unmatchBkTransaction({
      bkTransactionId: tx.id,
      adminUserId,
      reason: "should be refused",
    });

    expect(outcome.ok).toBe(false);
  });
});

// --- sync ------------------------------------------------------------------

describe("syncBkTransactions", () => {
  it("ingests a page of transactions and closes its sync log", async () => {
    const bkId = `${RUN}-SYNC-1`;

    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [normalised(bkId, `Savings ${members.alice.paymentReference}`)],
      page: { size: 50, number: 0, totalElements: 1, totalPages: 1 },
      hasMore: false,
    } as never);

    const result = await syncBkTransactions({ associationId, triggeredById: adminUserId });

    expect(result.transactionsFetched).toBe(1);
    expect(result.transactionsCreated).toBe(1);

    const log = await prisma.bkSyncLog.findFirst({
      where: { triggeredById: adminUserId },
      orderBy: { startedAt: "desc" },
    });
    expect(log?.status).toBe("SUCCESS");
    expect(log?.finishedAt).not.toBeNull();
  });

  it("does not re-create a transaction it has already seen", async () => {
    const bkId = `${RUN}-SYNC-DUP`;
    const tx = normalised(bkId, "repeated payload");

    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [tx],
      page: { size: 50, number: 0, totalElements: 1, totalPages: 1 },
      hasMore: false,
    } as never);

    await syncBkTransactions({ associationId, triggeredById: adminUserId });
    const second = await syncBkTransactions({ associationId, triggeredById: adminUserId });

    expect(second.transactionsCreated).toBe(0);

    const rows = await prisma.bkTransaction.count({ where: { bkTransactionId: bkId } });
    expect(rows).toBe(1);
  });

  it("auto-matches an ingested transaction that carries a payment reference", async () => {
    // Money arriving with a valid reference should not need a human. If the
    // sync never matches, every transaction lands in the manual queue.
    const bkId = `${RUN}-SYNC-MATCH`;

    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [normalised(bkId, `Savings ${members.bob.paymentReference}`)],
      page: { size: 50, number: 0, totalElements: 1, totalPages: 1 },
      hasMore: false,
    } as never);

    const result = await syncBkTransactions({ associationId, triggeredById: adminUserId });

    expect(result.matchedCount).toBe(1);

    const stored = await prisma.bkTransaction.findUniqueOrThrow({
      where: { bkTransactionId: bkId },
    });
    expect(stored.matchedMemberId).toBe(members.bob.memberId);
  });

  it("marks the sync log FAILED when BK rejects the credentials", async () => {
    // The real case today: BK answers 401 "Client credentials expired". That
    // is not retryable, so it must end the run and be recorded, not be
    // swallowed into a PARTIAL success.
    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockRejectedValue(
      new BkApiError("Client credentials expired", "AUTH_FAILED", false, 401)
    );

    await syncBkTransactions({ associationId, triggeredById: adminUserId }).catch(() => undefined);

    const log = await prisma.bkSyncLog.findFirst({
      where: { triggeredById: adminUserId },
      orderBy: { startedAt: "desc" },
    });

    expect(log?.status).toBe("FAILED");
    expect(log?.finishedAt).not.toBeNull();
  });
});

describe("the fast poll's quiet sync log", () => {
  async function logCount() {
    return prisma.bkSyncLog.count({ where: { triggeredById: adminUserId } });
  }

  it("writes no log row when a poll finds nothing", async () => {
    // A five-second poll that logged every tick would write ~17k rows a day
    // per association and bury the runs that mattered.
    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [],
      page: { size: 50, number: 0, totalElements: 0, totalPages: 0 },
      hasMore: false,
    } as never);

    const before = await logCount();

    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    });
    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    });

    expect(await logCount()).toBe(before);
  });

  it("writes a log row when a poll actually ingests something", async () => {
    const bkId = `${RUN}-POLL-NEW`;

    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [normalised(bkId, "arrived between polls")],
      page: { size: 50, number: 0, totalElements: 1, totalPages: 1 },
      hasMore: false,
    } as never);

    const before = await logCount();

    const result = await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    });

    expect(result.transactionsCreated).toBe(1);
    expect(await logCount()).toBe(before + 1);

    const log = await prisma.bkSyncLog.findFirst({
      where: { triggeredById: adminUserId },
      orderBy: { startedAt: "desc" },
    });
    expect(log?.status).toBe("SUCCESS");
    expect(log?.transactionsCreated).toBe(1);
    expect(log?.finishedAt).not.toBeNull();
    // The row is written after the fact, so its duration must still be real.
    expect(log?.durationMs ?? -1).toBeGreaterThanOrEqual(0);
  });

  it("always records a failure, however quiet the mode", async () => {
    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockRejectedValue(
      new BkApiError("Client credentials expired", "AUTH_FAILED", false, 401)
    );

    const before = await logCount();

    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    }).catch(() => undefined);

    expect(await logCount()).toBe(before + 1);

    const log = await prisma.bkSyncLog.findFirst({
      where: { triggeredById: adminUserId },
      orderBy: { startedAt: "desc" },
    });
    expect(log?.status).toBe("FAILED");
    expect(log?.errorMessage).toContain("expired");
  });

  it("records one continuous outage once, not once per tick", async () => {
    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockRejectedValue(
      new BkApiError("Client credentials expired", "AUTH_FAILED", false, 401)
    );

    // Establish the fault, then keep failing the way a poll would.
    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    }).catch(() => undefined);

    const after = await logCount();

    for (let i = 0; i < 3; i++) {
      await syncBkTransactions({
        associationId,
        triggeredById: adminUserId,
        persistLog: "when-interesting",
      }).catch(() => undefined);
    }

    expect(await logCount()).toBe(after);
  });

  it("sees through the clock BK embeds in its error bodies", async () => {
    // BK stamps its own time into the error body, so the raw message differs
    // on every call. Suppression has to compare the fault, not the text, or
    // one outage is recorded as thousands of separate failures.
    const bk = await import("@/lib/bk");
    let tick = 0;

    vi.spyOn(bk, "fetchBkTransactions").mockImplementation(async () => {
      tick++;
      throw new BkApiError(
        `BK authentication failed (401): {"status":401,"message":"Client credentials expired","timestamps":"Tue Sep 08 09:${String(tick).padStart(2, "0")}:15 CAT 2026"}`,
        "AUTH_FAILED",
        false,
        401
      );
    });

    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    }).catch(() => undefined);

    const after = await logCount();

    for (let i = 0; i < 3; i++) {
      await syncBkTransactions({
        associationId,
        triggeredById: adminUserId,
        persistLog: "when-interesting",
      }).catch(() => undefined);
    }

    expect(await logCount()).toBe(after);
  });

  it("records a genuinely different fault straight away", async () => {
    const bk = await import("@/lib/bk");

    vi.spyOn(bk, "fetchBkTransactions").mockRejectedValue(
      new BkApiError("Client credentials expired", "AUTH_FAILED", false, 401)
    );
    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    }).catch(() => undefined);

    const after = await logCount();

    vi.spyOn(bk, "fetchBkTransactions").mockRejectedValue(
      new BkApiError("BK rate limited", "RATE_LIMITED", true, 429)
    );
    await syncBkTransactions({
      associationId,
      triggeredById: adminUserId,
      persistLog: "when-interesting",
    }).catch(() => undefined);

    expect(await logCount()).toBe(after + 1);
  });

  it("still logs every run in the default mode", async () => {
    vi.spyOn(await import("@/lib/bk"), "fetchBkTransactions").mockResolvedValue({
      transactions: [],
      page: { size: 50, number: 0, totalElements: 0, totalPages: 0 },
      hasMore: false,
    } as never);

    const before = await logCount();

    await syncBkTransactions({ associationId, triggeredById: adminUserId });

    expect(await logCount()).toBe(before + 1);
  });
});

describe("getBkTransactionStats", () => {
  it("counts and totals only the requested association", async () => {
    const stats = await getBkTransactionStats(associationId);

    expect(stats.total).toBeGreaterThan(0);
    expect(Number(stats.totalAmount)).toBeGreaterThan(0);
    expect(stats.matched + stats.unmatched + stats.manuallyMatched).toBeLessThanOrEqual(
      stats.total
    );
  });
});

// --- helpers ---------------------------------------------------------------

let seq = 0;

async function createBkTransaction(
  overrides: Record<string, unknown> = {},
  association: string | null = associationId
) {
  seq += 1;
  return prisma.bkTransaction.create({
    data: {
      associationId: association,
      bkTransactionId: `${RUN}-TX-${seq}`,
      amount: "5000.00",
      currency: "RWF",
      payerNames: "JOHN DOE",
      payerAccount: "1000812341234",
      payerContact: "250788999999",
      reconciliationStatus: "UNMATCHED",
      matchStrategy: "NONE",
      matchConfidence: 0,
      ...overrides,
    },
  });
}

function normalised(bkTransactionId: string, narration: string) {
  return {
    bkTransactionId,
    bkClientReference: null,
    bkTransactionReference: null,
    bkPaymentCode: null,
    bkExtrasClientReference: null,
    amount: "5000.00",
    currency: "RWF",
    bkStatus: "SUCCESS",
    bkExtrasStatus: "SUCCESS",
    payerNames: "JOHN DOE",
    payerAccount: "1000812341234",
    payerContact: "250788999999",
    payeeNames: null,
    payeeAccount: null,
    beneficiaryNames: null,
    beneficiaryBank: null,
    beneficiaryBankCode: null,
    narration,
    serviceCode: null,
    transferType: null,
    sourceChannel: null,
    transactionStage: null,
    transactionStatus: null,
    transactionStatusComment: null,
    digitalProfileId: null,
    debitedAccount: null,
    debitedAccountOwnerNames: null,
    creditedAccount: null,
    creditedAccountOwnerNames: null,
    debitCurrency: null,
    creditCurrency: null,
    debitAccount: null,
    creditAccount: null,
    transactionDate: new Date(),
    createdDate: new Date(),
    updatedDate: new Date(),
    rawPayload: { narration },
  };
}

async function createMember(
  association: string,
  code: string,
  slug: string,
  sequence: string,
  phone: string
): Promise<TestMember> {
  const user = await prisma.user.create({
    data: {
      associationId: association,
      email: `${slug}-${RUN.toLowerCase()}@bk.test`,
      phone,
      firstName: slug,
      lastName: "Tester",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId: association,
          memberNumber: `${code}-M${sequence}`,
          paymentReference: `${code}-${sequence}`,
          status: "ACTIVE",
          savingsAccounts: {
            create: {
              associationId: association,
              accountNumber: `${code}-SA-${sequence}`,
              currency: "RWF",
              balance: "0",
            },
          },
        },
      },
    },
    include: { member: true },
  });

  return {
    memberId: user.member!.id,
    memberNumber: user.member!.memberNumber,
    paymentReference: user.member!.paymentReference,
  };
}
