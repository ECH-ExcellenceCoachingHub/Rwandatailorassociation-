import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  LedgerError,
  postSavingsTransaction,
  reverseSavingsTransaction,
  verifyAccountIntegrity,
} from "@/lib/services/ledger";
import { toMoney } from "@/lib/money";

/**
 * Ledger integration tests.
 *
 * These run against the real database because the guarantees under test are
 * database guarantees — row locks, unique constraints and transaction
 * isolation. Mocking Prisma would test the mock, not the ledger, and would
 * pass happily while production lost money to a race.
 *
 * Everything is created under a unique per-run prefix and deleted afterwards.
 */

const RUN = `TEST${Date.now().toString(36).toUpperCase()}`;

let associationId: string;
let memberId: string;
let accountId: string;
let adminUserId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: {
      code: RUN,
      name: `Ledger Test Association ${RUN}`,
      status: "ACTIVE",
      currency: "RWF",
    },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@ledger.test`,
      firstName: "Ledger",
      lastName: "Tester",
      passwordHash: "not-a-real-hash",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminUserId = admin.id;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member-${RUN.toLowerCase()}@ledger.test`,
      firstName: "Test",
      lastName: "Member",
      passwordHash: "not-a-real-hash",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${RUN}-M1`,
          paymentReference: `${RUN}-1`,
          status: "ACTIVE",
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${RUN}-SA-1`,
              currency: "RWF",
              balance: "0",
            },
          },
        },
      },
    },
    include: { member: { include: { savingsAccounts: true } } },
  });

  memberId = user.member!.id;
  accountId = user.member!.savingsAccounts[0].id;
});

afterAll(async () => {
  // Ordered by foreign key dependency.
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.payment.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

describe("posting to the ledger", () => {
  it("credits a deposit and updates the cached balance atomically", async () => {
    const posted = await postSavingsTransaction({
      savingsAccountId: accountId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "50000",
      channel: "CASH",
      description: "Initial contribution",
    });

    expect(posted.balanceBefore).toBe("0.00");
    expect(posted.balanceAfter).toBe("50000.00");
    expect(posted.sequence).toBe(1);
    expect(posted.reference).toMatch(/^DEP-\d{4}-[A-Z0-9]{10}$/);

    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.balance.toFixed(2)).toBe("50000.00");
    expect(account.totalDeposits.toFixed(2)).toBe("50000.00");
    expect(account.lastSequence).toBe(1);
  });

  it("debits a withdrawal and tracks the running total", async () => {
    const posted = await postSavingsTransaction({
      savingsAccountId: accountId,
      type: "WITHDRAWAL",
      direction: "DEBIT",
      amount: "10000",
      channel: "BANK_TRANSFER",
    });

    expect(posted.balanceBefore).toBe("50000.00");
    expect(posted.balanceAfter).toBe("40000.00");
    expect(posted.sequence).toBe(2);

    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.totalWithdrawals.toFixed(2)).toBe("10000.00");
  });

  it("refuses a withdrawal larger than the balance", async () => {
    await expect(
      postSavingsTransaction({
        savingsAccountId: accountId,
        type: "WITHDRAWAL",
        direction: "DEBIT",
        amount: "999999",
      })
    ).rejects.toThrow(LedgerError);

    // The failed attempt must leave nothing behind.
    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.balance.toFixed(2)).toBe("40000.00");
    expect(account.lastSequence).toBe(2);
  });

  it("rejects zero and negative amounts", async () => {
    for (const amount of ["0", "-100"]) {
      await expect(
        postSavingsTransaction({
          savingsAccountId: accountId,
          type: "DEPOSIT",
          direction: "CREDIT",
          amount,
        })
      ).rejects.toThrow(/greater than zero/);
    }
  });

  it("refuses a manual adjustment with no stated reason", async () => {
    await expect(
      postSavingsTransaction({
        savingsAccountId: accountId,
        type: "ADJUSTMENT",
        direction: "CREDIT",
        amount: "1000",
        postedById: adminUserId,
      })
    ).rejects.toThrow(/requires a written reason/);
  });

  it("accepts an adjustment when a reason is given, and audits it as critical", async () => {
    const posted = await postSavingsTransaction({
      savingsAccountId: accountId,
      type: "ADJUSTMENT",
      direction: "CREDIT",
      amount: "500",
      postedById: adminUserId,
      adjustmentReason: "Correcting a mis-keyed deposit from 12 Aug",
    });

    expect(posted.balanceAfter).toBe("40500.00");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: posted.id, action: "BALANCE_ADJUSTED" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.severity).toBe("CRITICAL");
    expect(audit!.reason).toContain("mis-keyed");
  });

  it("allows fees to overdraw when explicitly permitted", async () => {
    const scratch = await createScratchAccount("OVERDRAFT");

    const posted = await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "PENALTY",
      direction: "DEBIT",
      amount: "250",
      allowOverdraft: true,
    });

    expect(posted.balanceAfter).toBe("-250.00");
  });
});

describe("duplicate protection", () => {
  it("never posts the same payment twice", async () => {
    const payment = await prisma.payment.create({
      data: {
        associationId,
        provider: "TEST",
        externalTransactionId: `${RUN}-EXT-1`,
        amount: "7500",
        currency: "RWF",
        transactionDate: new Date(),
        status: "VERIFIED",
      },
    });

    const first = await postSavingsTransaction({
      savingsAccountId: accountId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "7500",
      paymentId: payment.id,
    });
    expect(first.balanceAfter).toBe("48000.00");

    // The same payment arriving again — a replayed webhook, or an overlapping
    // reconciliation window — must not credit the member a second time.
    await expect(
      postSavingsTransaction({
        savingsAccountId: accountId,
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: "7500",
        paymentId: payment.id,
      })
    ).rejects.toThrow(/already been posted/);

    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    expect(account.balance.toFixed(2)).toBe("48000.00");
  });

  it("enforces the constraint at the database level, not only in code", async () => {
    const payment = await prisma.payment.create({
      data: {
        associationId,
        provider: "TEST",
        externalTransactionId: `${RUN}-EXT-2`,
        amount: "100",
        currency: "RWF",
        transactionDate: new Date(),
        status: "VERIFIED",
      },
    });

    await postSavingsTransaction({
      savingsAccountId: accountId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "100",
      paymentId: payment.id,
    });

    // Bypass the service entirely and try to insert a second ledger row for
    // the same payment. The unique index must refuse it.
    await expect(
      prisma.savingsTransaction.create({
        data: {
          associationId,
          savingsAccountId: accountId,
          memberId,
          sequence: 9999,
          reference: `${RUN}-MANUAL-DUP`,
          type: "DEPOSIT",
          direction: "CREDIT",
          amount: "100",
          balanceBefore: "0",
          balanceAfter: "100",
          paymentId: payment.id,
        },
      })
    ).rejects.toThrow();
  });
});

describe("concurrency", () => {
  /**
   * THE test. Twenty simultaneous deposits of 1,000 each.
   *
   * Without a row lock, several writers read the same starting balance and the
   * last write wins — the account ends up with far less than 20,000 and every
   * individual receipt still looks correct. That is the failure mode this
   * whole design exists to prevent, and the only way to be sure it is absent
   * is to provoke it.
   */
  it("loses no updates under 20 simultaneous deposits", async () => {
    const scratch = await createScratchAccount("CONCURRENT");

    const deposits = Array.from({ length: 20 }, (_, i) =>
      postSavingsTransaction({
        savingsAccountId: scratch,
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: "1000",
        description: `Concurrent deposit ${i + 1}`,
      })
    );

    const results = await Promise.all(deposits);

    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: scratch },
    });

    // Every franc accounted for.
    expect(account.balance.toFixed(2)).toBe("20000.00");
    expect(account.lastSequence).toBe(20);

    // Sequences are gapless and unique — no two writers claimed the same slot.
    const sequences = results.map((r) => r.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // Each row's balanceAfter is a correct step in a single chain.
    const rows = await prisma.savingsTransaction.findMany({
      where: { savingsAccountId: scratch },
      orderBy: { sequence: "asc" },
      select: { sequence: true, balanceAfter: true },
    });
    rows.forEach((row, index) => {
      expect(row.balanceAfter.toFixed(2)).toBe(`${(index + 1) * 1000}.00`);
    });
  });

  it("does not allow concurrent withdrawals to overdraw an account", async () => {
    const scratch = await createScratchAccount("RACE");

    await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "10000",
    });

    // Ten simultaneous withdrawals of 2,000 against a 10,000 balance. Exactly
    // five may succeed; the rest must be refused for insufficient funds.
    const attempts = Array.from({ length: 10 }, () =>
      postSavingsTransaction({
        savingsAccountId: scratch,
        type: "WITHDRAWAL",
        direction: "DEBIT",
        amount: "2000",
      }).then(
        () => "ok" as const,
        () => "refused" as const
      )
    );

    const outcomes = await Promise.all(attempts);
    const succeeded = outcomes.filter((o) => o === "ok").length;

    expect(succeeded).toBe(5);

    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: scratch },
    });
    // Never negative, whatever the interleaving.
    expect(account.balance.toFixed(2)).toBe("0.00");
  });
});

describe("reversal", () => {
  it("reverses by contra entry, preserving the original row", async () => {
    const scratch = await createScratchAccount("REVERSAL");

    const original = await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "3000",
      description: "Deposit entered in error",
    });

    const reversal = await reverseSavingsTransaction(
      original.id,
      "Deposit was credited to the wrong member",
      adminUserId
    );

    expect(reversal.balanceAfter).toBe("0.00");

    // A reversed deposit stops counting as contributed.
    const account = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: scratch } });
    expect(account.totalDeposits.toFixed(2)).toBe("0.00");

    const originalRow = await prisma.savingsTransaction.findUniqueOrThrow({
      where: { id: original.id },
    });
    // Still there, still readable, now marked.
    expect(originalRow.status).toBe("REVERSED");
    expect(originalRow.amount.toFixed(2)).toBe("3000.00");

    const reversalRow = await prisma.savingsTransaction.findUniqueOrThrow({
      where: { id: reversal.id },
    });
    expect(reversalRow.reversalOfId).toBe(original.id);
    expect(reversalRow.direction).toBe("DEBIT");
  });

  it("refuses to reverse the same transaction twice", async () => {
    const scratch = await createScratchAccount("DOUBLEREV");

    const original = await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "1000",
    });

    await reverseSavingsTransaction(original.id, "First reversal", adminUserId);

    await expect(
      reverseSavingsTransaction(original.id, "Second reversal", adminUserId)
    ).rejects.toThrow(/already been reversed/);
  });

  it("requires a reason", async () => {
    const scratch = await createScratchAccount("NOREASON");
    const original = await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "1000",
    });

    await expect(
      reverseSavingsTransaction(original.id, "   ", adminUserId)
    ).rejects.toThrow(/requires a written reason/);
  });
});

describe("integrity verification", () => {
  it("confirms the cached balance matches a full replay of the ledger", async () => {
    const report = await verifyAccountIntegrity(accountId);

    expect(report.ok).toBe(true);
    expect(report.difference).toBe("0.00");
    expect(report.sequenceGaps).toEqual([]);
    expect(report.brokenChainAt).toBeNull();
    expect(report.cachedBalance).toBe(report.derivedBalance);
  });

  it("detects a balance tampered with behind the ledger's back", async () => {
    const scratch = await createScratchAccount("TAMPER");

    await postSavingsTransaction({
      savingsAccountId: scratch,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: "5000",
    });

    // Simulate someone editing the balance column directly — the exact abuse
    // the verification job exists to catch.
    await prisma.savingsAccount.update({
      where: { id: scratch },
      data: { balance: "9999999" },
    });

    const report = await verifyAccountIntegrity(scratch);

    expect(report.ok).toBe(false);
    expect(toMoney(report.difference).isZero()).toBe(false);
    expect(report.derivedBalance).toBe("5000.00");
  });
});

// ---------------------------------------------------------------------------

let scratchCounter = 0;

async function createScratchAccount(label: string): Promise<string> {
  scratchCounter++;
  const suffix = `${label}${scratchCounter}`;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `${suffix.toLowerCase()}-${RUN.toLowerCase()}@ledger.test`,
      firstName: "Scratch",
      lastName: label,
      passwordHash: "not-a-real-hash",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${RUN}-${suffix}`,
          paymentReference: `${RUN}-${suffix}`,
          status: "ACTIVE",
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${RUN}-SA-${suffix}`,
              currency: "RWF",
              balance: "0",
            },
          },
        },
      },
    },
    include: { member: { include: { savingsAccounts: true } } },
  });

  return user.member!.savingsAccounts[0].id;
}
