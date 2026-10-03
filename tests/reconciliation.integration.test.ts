import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { SandboxPaymentAdapter, setPaymentProvider } from "@/lib/jenga";
import {
  ingestAndProcess,
  manuallyMatchPayment,
  processPayment,
} from "@/lib/services/reconciliation";
import {
  extractPaymentReferences,
  matchPaymentToMember,
} from "@/lib/services/payment-matching";
import type { ProviderTransaction } from "@/lib/jenga/types";

/**
 * Payment pipeline integration tests.
 *
 * These cover the failure modes that cost real money: double-crediting a
 * replayed webhook, crediting an unverified or failed transaction, and
 * attributing a payment to the wrong member.
 */

const RUN = `PAY${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminUserId: string;
let adapter: SandboxPaymentAdapter;

interface TestMember {
  memberId: string;
  accountId: string;
  paymentReference: string;
  memberNumber: string;
}

const members: Record<string, TestMember> = {};

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `Reconciliation Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@pay.test`,
      firstName: "Pay",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminUserId = admin.id;

  members.alice = await createMember("alice", "000001", "+250788200001", "0788200001");
  members.bob = await createMember("bob", "000002", "+250788200002", "0788200002");
  // Two members deliberately sharing ONE mobile money number, to prove
  // ambiguity is refused rather than resolved by guesswork. This is the
  // realistic case: a household or business paying for several members from a
  // single mobile money account. (User.phone is globally unique, so the
  // account phone itself cannot be shared.)
  members.twinA = await createMember("twina", "000003", "+250788200003", "0788200009");
  members.twinB = await createMember("twinb", "000004", "+250788200004", "0788200009");
});

beforeEach(() => {
  adapter = new SandboxPaymentAdapter();
  setPaymentProvider(adapter);
});

afterAll(async () => {
  setPaymentProvider(null);
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.paymentReconciliation.deleteMany({
    where: { payment: { associationId } },
  });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.payment.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

const tenant = () => ({ id: associationId, code: CODE, currency: "RWF" });

describe("reference extraction", () => {
  it("recognises the formats payers actually type", () => {
    for (const text of [
      "RTA-000123",
      "RTA 000123",
      "rta000123",
      "Payment ref: RTA-000123 thanks",
      "RTA/000123",
      "RTA_000123",
    ]) {
      expect(extractPaymentReferences(text, "RTA"), text).toContain("RTA-000123");
    }
  });

  it("zero-pads a short reference to the canonical form", () => {
    expect(extractPaymentReferences("RTA-123", "RTA")).toContain("RTA-000123");
  });

  it("finds nothing in text with no reference", () => {
    expect(extractPaymentReferences("monthly contribution", "RTA")).toEqual([]);
    expect(extractPaymentReferences(null, "RTA")).toEqual([]);
  });
});

describe("member matching", () => {
  it("matches on the payment reference with full confidence", async () => {
    const result = await matchPaymentToMember(
      transaction({ narration: `Contribution ${members.alice.paymentReference}` }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("MEMBER_PAYMENT_REFERENCE");
    expect(result.confidence).toBe(100);
    expect(result.member?.memberId).toBe(members.alice.memberId);
  });

  it("matches on a quoted membership number", async () => {
    const result = await matchPaymentToMember(
      transaction({ narration: `Paying for ${members.bob.memberNumber}` }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("EXTERNAL_CUSTOMER_REFERENCE");
    expect(result.member?.memberId).toBe(members.bob.memberId);
  });

  it("matches a registered mobile money number above the auto-credit bar", async () => {
    const result = await matchPaymentToMember(
      transaction({ narration: "no reference given", payerPhone: "0788200001" }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("MOBILE_MONEY_ACCOUNT");
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.member?.memberId).toBe(members.alice.memberId);
  });

  it("matches phone formats interchangeably", async () => {
    for (const phone of ["0788200002", "+250788200002", "250788200002"]) {
      const result = await matchPaymentToMember(
        transaction({ payerPhone: phone }),
        associationId,
        CODE
      );
      expect(result.member?.memberId, phone).toBe(members.bob.memberId);
    }
  });

  // The core safety property: when the evidence points at more than one
  // person, the engine declines to choose.
  it("refuses to choose between members sharing a mobile money number", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerPhone: "0788200009" }),
      associationId,
      CODE
    );

    expect(result.member).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.candidates.length).toBe(2);
    expect(result.evidence).toMatch(/manual review/i);
  });

  it("credits on phone + matching sender name, no reference needed", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "BOB TESTER", payerPhone: "0788200002" }),
      associationId,
      CODE
    );

    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.member?.memberId).toBe(members.bob.memberId);
    expect(result.evidence).toMatch(/name on the payment/i);
  });

  it("holds a phone match whose sender name is somebody else", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "GRACE MUKAMANA", payerPhone: "0788200002" }),
      associationId,
      CODE
    );

    expect(result.member?.memberId).toBe(members.bob.memberId);
    expect(result.confidence).toBeLessThan(90);
    expect(result.evidence).toMatch(/review/i);
  });

  it("confirms a phone match from the narration when the payer field is wrong", async () => {
    // A parsed payer field can hold the association's own account name; the
    // narration still names the real sender.
    const result = await matchPaymentToMember(
      transaction({
        payerName: "RWANDA TAILORS",
        payerPhone: "+250788200002",
        narration: "EKASH incoming transfer : RWANDA TAILORS A I Bob TESTER250788200002",
      }),
      associationId,
      CODE
    );

    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.member?.memberId).toBe(members.bob.memberId);
  });

  it("lets the sender name pick between members sharing a phone", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "TWINB TESTER", payerPhone: "0788200009" }),
      associationId,
      CODE
    );

    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.member?.memberId).toBe(members.twinB.memberId);
  });

  it("credits on an exact sender name that belongs to one member only", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "Alice Tester" }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("PAYER_NAME");
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.member?.memberId).toBe(members.alice.memberId);
  });

  it("only suggests a sender name that is not word for word", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "Alice Marie Tester" }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("PAYER_NAME");
    expect(result.confidence).toBeLessThan(90);
  });

  it("never matches on a name that fits nobody", async () => {
    const result = await matchPaymentToMember(
      transaction({ payerName: "Grace Mukamana", narration: "Grace Mukamana" }),
      associationId,
      CODE
    );

    expect(result.strategy).toBe("NONE");
    expect(result.member).toBeNull();
  });

  it("never matches on amount alone", async () => {
    const result = await matchPaymentToMember(
      transaction({ amount: "45000", narration: "45000" }),
      associationId,
      CODE
    );

    expect(result.member).toBeNull();
  });

  it("does not match a member of another association", async () => {
    const other = await prisma.association.create({
      data: { code: `${CODE}X`, name: "Other", status: "ACTIVE" },
    });

    const result = await matchPaymentToMember(
      transaction({ narration: members.alice.paymentReference }),
      other.id,
      CODE
    );

    expect(result.member).toBeNull();
    await prisma.association.delete({ where: { id: other.id } });
  });
});

describe("end-to-end processing", () => {
  it("credits a verified, referenced payment", async () => {
    const before = await balanceOf(members.alice.accountId);

    const tx = adapter.inject({
      amount: "50000",
      narration: `Contribution ${members.alice.paymentReference}`,
      status: "SUCCESS",
    });

    const outcome = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    expect(outcome).toBe("PROCESSED");

    expect(await balanceOf(members.alice.accountId)).toBe(before + 50000);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
      include: { savingsTransaction: true },
    });

    expect(payment.status).toBe("PROCESSED");
    expect(payment.matchedMemberId).toBe(members.alice.memberId);
    expect(payment.verifiedAt).not.toBeNull();
    expect(payment.savingsTransaction).not.toBeNull();
    // The provider's own words are kept for audit.
    expect(payment.rawPayload).not.toBeNull();
  });

  /**
   * THE double-credit test. A replayed webhook, or an overlapping poll window,
   * must be absorbed silently — not credited a second time.
   */
  it("never credits the same provider transaction twice", async () => {
    const tx = adapter.inject({
      amount: "25000",
      narration: `Payment ${members.bob.paymentReference}`,
      status: "SUCCESS",
    });

    const first = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    const after = await balanceOf(members.bob.accountId);

    // Same transaction delivered four more times.
    for (let i = 0; i < 4; i++) {
      const repeat = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
      expect(repeat).toBe("DUPLICATE");
    }

    expect(first).toBe("PROCESSED");
    expect(await balanceOf(members.bob.accountId)).toBe(after);

    const rows = await prisma.payment.count({
      where: { externalTransactionId: tx.externalTransactionId },
    });
    expect(rows).toBe(1);

    const ledgerRows = await prisma.savingsTransaction.count({
      where: { externalReference: tx.externalTransactionId },
    });
    expect(ledgerRows).toBe(1);
  });

  it("absorbs concurrent delivery of the same transaction", async () => {
    const tx = adapter.inject({
      amount: "12000",
      narration: `Ref ${members.alice.paymentReference}`,
      status: "SUCCESS",
    });

    const before = await balanceOf(members.alice.accountId);

    // Five webhook deliveries landing at once.
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        ingestAndProcess(tx, tenant(), "JENGA_SANDBOX").catch(() => "ERROR" as const)
      )
    );

    expect(outcomes.filter((o) => o === "PROCESSED").length).toBe(1);
    expect(await balanceOf(members.alice.accountId)).toBe(before + 12000);

    // The four losers must be recognised as DUPLICATE, not surface as errors.
    // Asserting only on the balance let a real bug hide here once already: the
    // duplicate detector was failing to identify the constraint, every repeat
    // delivery threw, and the balance was still right — so the test passed
    // while the pipeline was logging unhandled exceptions on every replay.
    expect(outcomes.filter((o) => o === "DUPLICATE").length).toBe(4);
    expect(outcomes).not.toContain("ERROR");
  });

  it("does not credit a transaction the provider reports as pending", async () => {
    const before = await balanceOf(members.alice.accountId);

    const tx = adapter.inject({
      amount: "99000",
      narration: `Ref ${members.alice.paymentReference}`,
      status: "PENDING",
      providerStatus: "PENDING",
    });

    const outcome = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    expect(outcome).toBe("PENDING");
    expect(await balanceOf(members.alice.accountId)).toBe(before);
  });

  it("does not credit a transaction the provider reports as failed", async () => {
    const before = await balanceOf(members.alice.accountId);

    const tx = adapter.inject({
      amount: "77000",
      narration: `Ref ${members.alice.paymentReference}`,
      status: "FAILED",
      providerStatus: "DECLINED",
    });

    const outcome = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    expect(outcome).toBe("FAILED");
    expect(await balanceOf(members.alice.accountId)).toBe(before);
  });

  it("parks an unidentifiable payment instead of guessing", async () => {
    const tx = adapter.inject({
      amount: "33000",
      narration: "Just a payment, no reference",
      payerName: "Unknown Person",
      status: "SUCCESS",
    });

    const outcome = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    expect(outcome).toBe("UNMATCHED");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
      include: { reconciliations: true },
    });

    expect(payment.status).toBe("UNMATCHED");
    expect(payment.matchedMemberId).toBeNull();
    // The reason is recorded so an admin knows where to start.
    expect(payment.reconciliations.length).toBeGreaterThan(0);
    expect(payment.reconciliations[0].notes).toBeTruthy();
  });

  it("parks an ambiguous payment rather than picking a member", async () => {
    const tx = adapter.inject({
      amount: "15000",
      payerPhone: "0788200009",
      narration: "contribution",
      status: "SUCCESS",
    });

    const outcome = await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    expect(outcome).toBe("UNMATCHED");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
      include: { reconciliations: true },
    });

    expect(payment.reconciliations.some((r) => r.outcome === "AMBIGUOUS")).toBe(true);
    expect(payment.reconciliations[0].candidateIds.length).toBe(2);
  });
});

describe("manual reconciliation", () => {
  it("credits an unmatched payment when an admin resolves it, with a reason", async () => {
    const tx = adapter.inject({
      amount: "18000",
      narration: "no reference at all",
      status: "SUCCESS",
    });

    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });
    expect(payment.status).toBe("UNMATCHED");

    const before = await balanceOf(members.bob.accountId);

    const result = await manuallyMatchPayment({
      paymentId: payment.id,
      memberId: members.bob.memberId,
      adminUserId,
      reason: "Member confirmed by phone that this payment is theirs",
    });

    expect(result.ok).toBe(true);
    expect(await balanceOf(members.bob.accountId)).toBe(before + 18000);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: payment.id, action: "PAYMENT_MATCHED_MANUALLY" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.severity).toBe("CRITICAL");
    expect(audit!.actorId).toBe(adminUserId);
    expect(audit!.reason).toContain("confirmed by phone");
  });

  it("refuses a manual match with no reason", async () => {
    const tx = adapter.inject({ amount: "5000", narration: "x", status: "SUCCESS" });
    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });

    const result = await manuallyMatchPayment({
      paymentId: payment.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "   ",
    });

    expect(result.ok).toBe(false);
  });

  // An admin decides WHO a payment belongs to. They cannot decide THAT it
  // happened — a failed transaction stays uncreditable.
  it("refuses to manually credit a payment that failed verification", async () => {
    const tx = adapter.inject({
      amount: "8000",
      narration: "x",
      status: "FAILED",
      providerStatus: "DECLINED",
    });
    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });

    const result = await manuallyMatchPayment({
      paymentId: payment.id,
      memberId: members.alice.memberId,
      adminUserId,
      reason: "Member insists it went through",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/failed verification/i);
  });

  it("refuses to match a payment that is already posted", async () => {
    const tx = adapter.inject({
      amount: "9000",
      narration: `Ref ${members.alice.paymentReference}`,
      status: "SUCCESS",
    });
    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });

    const result = await manuallyMatchPayment({
      paymentId: payment.id,
      memberId: members.bob.memberId,
      adminUserId,
      reason: "Attempting to re-assign an already credited payment",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/already been posted/i);
  });

  it("refuses to match a member from another association", async () => {
    const other = await prisma.association.create({
      data: { code: `${CODE}Y`, name: "Other Assoc", status: "ACTIVE" },
    });
    const otherUser = await prisma.user.create({
      data: {
        associationId: other.id,
        email: `outsider-${RUN.toLowerCase()}@pay.test`,
        firstName: "Out",
        lastName: "Sider",
        passwordHash: "x",
        role: "MEMBER",
        status: "ACTIVE",
        member: {
          create: {
            associationId: other.id,
            memberNumber: `${CODE}Y-M1`,
            paymentReference: `${CODE}Y-1`,
            status: "ACTIVE",
          },
        },
      },
      include: { member: true },
    });

    const tx = adapter.inject({ amount: "1000", narration: "x", status: "SUCCESS" });
    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");
    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });

    const result = await manuallyMatchPayment({
      paymentId: payment.id,
      memberId: otherUser.member!.id,
      adminUserId,
      reason: "Cross-tenant attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not found in this association/i);

    await prisma.member.deleteMany({ where: { associationId: other.id } });
    await prisma.user.deleteMany({ where: { associationId: other.id } });
    await prisma.association.delete({ where: { id: other.id } });
  });
});

describe("retry safety", () => {
  it("does not re-credit when a processed payment is reprocessed", async () => {
    const tx = adapter.inject({
      amount: "4000",
      narration: `Ref ${members.alice.paymentReference}`,
      status: "SUCCESS",
    });
    await ingestAndProcess(tx, tenant(), "JENGA_SANDBOX");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { externalTransactionId: tx.externalTransactionId },
    });
    const before = await balanceOf(members.alice.accountId);

    const outcome = await processPayment(payment.id, tenant());

    expect(outcome).toBe("PROCESSED");
    expect(await balanceOf(members.alice.accountId)).toBe(before);
  });
});

// ---------------------------------------------------------------------------

function transaction(overrides: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    externalTransactionId: `T${Math.random().toString(36).slice(2)}`,
    transactionReference: null,
    amount: "10000",
    currency: "RWF",
    providerStatus: "SUCCESS",
    status: "SUCCESS",
    payerName: null,
    payerPhone: null,
    payerAccount: null,
    payerBank: null,
    narration: null,
    debitAccount: null,
    creditAccount: null,
    transactionDate: new Date(),
    valueDate: null,
    raw: {},
    ...overrides,
  };
}

async function balanceOf(accountId: string): Promise<number> {
  const account = await prisma.savingsAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { balance: true },
  });
  return Number(account.balance.toFixed(2));
}

async function createMember(
  slug: string,
  sequence: string,
  phone: string,
  mobileMoney: string | null
): Promise<TestMember> {
  const user = await prisma.user.create({
    data: {
      associationId,
      email: `${slug}-${RUN.toLowerCase()}@pay.test`,
      phone,
      firstName: slug,
      lastName: "Tester",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M${sequence}`,
          paymentReference: `${CODE}-${sequence}`,
          status: "ACTIVE",
          mobileMoneyNumber: mobileMoney,
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${CODE}-SA-${sequence}`,
              currency: "RWF",
              balance: "0",
            },
          },
        },
      },
    },
    include: { member: { include: { savingsAccounts: true } } },
  });

  return {
    memberId: user.member!.id,
    accountId: user.member!.savingsAccounts[0].id,
    paymentReference: user.member!.paymentReference,
    memberNumber: user.member!.memberNumber,
  };
}
