import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { parseStatementRows } from "@/lib/services/statement-import";
import {
  buildImportPreview,
  commitStatementImport,
} from "@/lib/services/statement-commit";
import { setSmsProvider } from "@/lib/notifications/providers";
import type { SendResult, SmsMessage, SmsProvider } from "@/lib/notifications/types";

/**
 * Statement import integration tests.
 *
 * Proves the two things the feature promises: that reviewing a statement
 * credits the right members through the real ledger, and that each of them is
 * sent an SMS. Also proves the thing it must never do — credit anyone twice
 * when the same statement is uploaded again.
 */

const RUN = `IMP${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminId: string;
const members: Record<string, { memberId: string; accountId: string; ref: string; phone: string }> = {};

/** Captures SMS instead of sending, so the test can assert on delivery. */
const sentSms: SmsMessage[] = [];

const captureSms: SmsProvider = {
  name: "test-capture",
  async send(message: SmsMessage): Promise<SendResult> {
    sentSms.push(message);
    return { ok: true, providerMessageId: `test-${sentSms.length}` };
  },
};

beforeAll(async () => {
  setSmsProvider(captureSms);

  const association = await prisma.association.create({
    data: { code: CODE, name: `Import Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@import.test`,
      firstName: "Import",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminId = admin.id;

  members.alice = await createMember("alice", "000001", "+250788300001");
  members.bob = await createMember("bob", "000002", "+250788300002");
});

afterAll(async () => {
  setSmsProvider(null);
  await prisma.notificationDelivery.deleteMany({
    where: { notification: { associationId } },
  });
  await prisma.notification.deleteMany({ where: { associationId } });
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.platformFeeCharge.deleteMany({ where: { associationId } });
  await prisma.paymentReconciliation.deleteMany({ where: { payment: { associationId } } });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.payment.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

function statementText(): string {
  return [
    `Account Number: 9001234567`,
    `Date        Description                     Debit      Credit     Balance`,
    `01/08/2026  Balance brought forward                             500,000.00`,
    `03/08/2026  MOBILE MONEY ${CODE}-000001 ALICE          60,000.00 560,000.00`,
    `05/08/2026  MOBILE MONEY ${CODE}-000002 BOB            45,000.00 605,000.00`,
    `07/08/2026  BANK CHARGES                     2,500.00            602,500.00`,
    `09/08/2026  CASH DEPOSIT NO REFERENCE                  30,000.00 632,500.00`,
  ].join("\n");
}

const tenant = () => ({ id: associationId, code: CODE, currency: "RWF" });

describe("preview", () => {
  it("shows who each row would be credited to, without writing anything", async () => {
    const parsed = parseStatementRows(statementText());
    const preview = await buildImportPreview(parsed.rows, tenant(), 90);

    // Nothing written.
    expect(await prisma.payment.count({ where: { associationId } })).toBe(0);

    expect(preview.summary.credits).toBe(3);
    expect(preview.summary.debits).toBe(1);

    const aliceRow = preview.rows.find((r) => r.description.includes("ALICE"));
    expect(aliceRow?.matchedMemberNumber).toBe(`${CODE}-M000001`);
    expect(aliceRow?.wouldAutoCredit).toBe(true);
    expect(aliceRow?.matchStrategy).toBe("MEMBER_PAYMENT_REFERENCE");

    // The unreferenced deposit cannot be attributed — the admin will see that
    // it goes to the unmatched queue rather than to a guessed member.
    const noRef = preview.rows.find((r) => r.description.includes("NO REFERENCE"));
    expect(noRef?.matchedMemberName).toBeNull();
    expect(noRef?.wouldAutoCredit).toBe(false);

    // A debit is never importable.
    const charge = preview.rows.find((r) => r.description.includes("BANK CHARGES"));
    expect(charge?.direction).toBe("DEBIT");
    expect(charge?.wouldAutoCredit).toBe(false);
  });
});

describe("commit", () => {
  it("credits matched members, parks the rest, and sends an SMS to each", async () => {
    sentSms.length = 0;

    const parsed = parseStatementRows(statementText());
    const credits = parsed.rows.filter((r) => r.direction === "CREDIT");

    const result = await commitStatementImport({
      rows: parsed.rows,
      selectedFingerprints: credits.map((r) => r.fingerprint),
      association: tenant(),
      adminUserId: adminId,
      fileName: "august-2026.pdf",
      fileHash: "testhash1234",
    });

    expect(result.created).toBe(3);
    expect(result.credited).toBe(2);
    expect(result.unmatched).toBe(1);
    expect(result.failed).toBe(0);

    // Balances moved through the real ledger.
    expect(await creditedTo(members.alice.accountId)).toBe(60000);
    expect(await creditedTo(members.bob.accountId)).toBe(45000);

    // The service fee came off as the payment was credited, not the next night.
    const aliceFee = await prisma.platformFeeCharge.findFirst({
      where: { memberId: members.alice.memberId, status: "CHARGED" },
    });
    expect(aliceFee).not.toBeNull();
    const alice = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: members.alice.accountId },
    });
    expect(alice.balance.toFixed(2)).toBe(alice.totalDeposits.minus(aliceFee!.amount).toFixed(2));

    // A savings transaction exists for each credited payment, linked to it.
    const posted = await prisma.savingsTransaction.findMany({
      where: { associationId, type: "DEPOSIT" },
      select: { amount: true, type: true, paymentId: true },
    });
    expect(posted).toHaveLength(2);
    expect(posted.every((t) => t.paymentId)).toBe(true);

    // Deliveries are dispatched fire-and-forget so the credit is not blocked
    // on an SMS gateway. Poll rather than sleeping a fixed time — under load a
    // fixed wait is either flaky or needlessly slow.
    await waitFor(() => sentSms.length >= 2, 20_000);

    // THE SMS. Each credited member is told their new balance.
    const recipients = sentSms.map((m) => m.to).sort();
    expect(recipients).toContain(members.alice.phone);
    expect(recipients).toContain(members.bob.phone);

    const aliceSms = sentSms.find((m) => m.to === members.alice.phone);
    // SMS is Kinyarwanda only (see lib/notifications/templates.ts), and names
    // the service fee that came off, so the new balance is explained.
    expect(aliceSms?.body).toMatch(/60,000/);
    expect(aliceSms?.body).toMatch(/twakiriye/i);
    expect(aliceSms?.body).toMatch(/serivisi/i);

    // The member with no reference is NOT told anything — nobody was credited.
    expect(sentSms).toHaveLength(2);
  });

  it("records the administrator's attestation against every payment", async () => {
    const payment = await prisma.payment.findFirstOrThrow({
      where: { associationId, provider: "STATEMENT_IMPORT" },
      select: { verificationResponse: true, ingestSource: true, matchedById: true },
    });

    const attestation = payment.verificationResponse as Record<string, unknown>;

    expect(payment.ingestSource).toBe("MANUAL");
    expect(attestation.method).toBe("ADMIN_ATTESTATION");
    expect(attestation.attestedByUserId).toBe(adminId);
    expect(attestation.fileName).toBe("august-2026.pdf");
    expect(attestation.fileHash).toBe("testhash1234");

    // And the batch itself is audited at CRITICAL.
    const audit = await prisma.auditLog.findFirst({
      where: { associationId, entityType: "StatementImport" },
    });
    expect(audit?.severity).toBe("CRITICAL");
    expect(audit?.actorId).toBe(adminId);
    expect(audit?.reason).toContain("august-2026.pdf");
  });

  /**
   * THE test for this feature. Uploading the same statement again — which
   * administrators do routinely, by accident or when they are unsure whether
   * the first attempt worked — must credit nobody a second time.
   */
  it("credits nobody twice when the same statement is re-imported", async () => {
    sentSms.length = 0;

    const balancesBefore = {
      alice: await creditedTo(members.alice.accountId),
      bob: await creditedTo(members.bob.accountId),
    };

    const parsed = parseStatementRows(statementText());
    const credits = parsed.rows.filter((r) => r.direction === "CREDIT");

    const result = await commitStatementImport({
      rows: parsed.rows,
      selectedFingerprints: credits.map((r) => r.fingerprint),
      association: tenant(),
      adminUserId: adminId,
      fileName: "august-2026.pdf",
      fileHash: "testhash1234",
    });

    expect(result.created).toBe(0);
    expect(result.credited).toBe(0);
    expect(result.skipped).toBe(3);

    expect(await creditedTo(members.alice.accountId)).toBe(balancesBefore.alice);
    expect(await creditedTo(members.bob.accountId)).toBe(balancesBefore.bob);

    // Deliberately a fixed pause: we are asserting that nothing arrives, so
    // there is no condition to poll for — only time to give it a chance to.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // No member is told about a payment that did not happen.
    expect(sentSms).toHaveLength(0);

    // Still exactly one ledger entry each.
    expect(
      await prisma.savingsTransaction.count({ where: { associationId, type: "DEPOSIT" } })
    ).toBe(2);
  });

  it("imports only the rows the administrator ticked", async () => {
    // A second statement, of which the admin selects one row.
    const text = [
      `Date        Description                     Debit      Credit     Balance`,
      `20/08/2026  MOBILE MONEY ${CODE}-000001 ALICE          11,000.00 643,500.00`,
      `21/08/2026  MOBILE MONEY ${CODE}-000002 BOB            22,000.00 665,500.00`,
    ].join("\n");

    const parsed = parseStatementRows(text);
    const aliceRow = parsed.rows.find((r) => r.description.includes("ALICE"))!;

    const before = await creditedTo(members.bob.accountId);

    const result = await commitStatementImport({
      rows: parsed.rows,
      // Only Alice's row.
      selectedFingerprints: [aliceRow.fingerprint],
      association: tenant(),
      adminUserId: adminId,
      fileName: "second.pdf",
      fileHash: "testhash5678",
    });

    expect(result.created).toBe(1);
    expect(result.credited).toBe(1);

    // Bob's untouched row was never written.
    expect(await creditedTo(members.bob.accountId)).toBe(before);
  });
});

// ---------------------------------------------------------------------------

/** Polls until `condition` holds or the timeout elapses. */
async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * What has been credited to the account: its balance with the platform service
 * fee added back. The fee now comes off as each payment is credited, and these
 * tests are about crediting, not about the fee.
 */
async function creditedTo(accountId: string): Promise<number> {
  const account = await prisma.savingsAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { balance: true, memberId: true },
  });
  return Number(account.balance.toFixed(2)) + (await feesOf(account.memberId));
}

async function feesOf(memberId: string): Promise<number> {
  const fees = await prisma.platformFeeCharge.aggregate({
    where: { memberId, status: "CHARGED" },
    _sum: { amount: true },
  });
  return Number(fees._sum.amount?.toFixed(2) ?? 0);
}

async function createMember(slug: string, sequence: string, phone: string) {
  const user = await prisma.user.create({
    data: {
      associationId,
      email: `${slug}-${RUN.toLowerCase()}@import.test`,
      phone,
      firstName: slug,
      lastName: "Tester",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      phoneVerifiedAt: new Date(),
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M${sequence}`,
          paymentReference: `${CODE}-${sequence}`,
          status: "ACTIVE",
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
    ref: user.member!.paymentReference,
    phone,
  };
}
