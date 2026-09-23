import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { postSavingsTransaction, reverseSavingsTransaction } from "@/lib/services/ledger";
import {
  approveLoanApplication,
  disburseLoan,
  recordLoanRepayment,
  submitLoanApplication,
} from "@/lib/services/loans";
import { createItem, issueToMember, settleIssuance } from "@/lib/services/warehouse";
import { deleteMember } from "@/lib/services/members";

/**
 * Deleting a member who has a history.
 *
 * A test account used in earnest ends up with a bit of everything: a deposit
 * that came in through a matched payment, one that was reversed, a loan with a
 * repayment and the interest share it credited, goods on loan and goods paid
 * for out of savings, a fine, a bank line. This builds exactly that through
 * the real services, deletes the member, and checks two things:
 *
 *  - every row that was theirs is gone, and so is their login;
 *  - nothing that was not theirs moved — another member's balance, the stock
 *    count, the bank's record of money that arrived.
 */

const RUN = `DEL${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminId: string;
let productId: string;
let itemId: string;

let testUserId: string;
let testMemberId: string;
let testAccountId: string;
let paymentId: string;
let bankLineId: string;

let otherMemberId: string;
let otherAccountId: string;
let otherBalanceBefore: string;
let otherTransactionsBefore: number;

async function createMember(n: number, role: "MEMBER" | "SUPER_ADMIN" = "MEMBER") {
  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member${n}-${RUN.toLowerCase()}@delete.test`,
      firstName: "Delete",
      lastName: `Member ${n}`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M${n}`,
          paymentReference: `${CODE}-${n}`,
          status: "ACTIVE",
          joinedAt: new Date(Date.now() - 365 * 86_400_000),
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${CODE}-SA-${n}`,
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
    userId: user.id,
    memberId: user.member!.id,
    accountId: user.member!.savingsAccounts[0].id,
  };
}

beforeAll(async () => {
  const association = await prisma.association.create({
    data: {
      code: CODE,
      name: `Delete Test ${RUN}`,
      status: "ACTIVE",
      currency: "RWF",
      // Backdated so the lending rules are open, as in the loan tests.
      createdAt: new Date(Date.now() - 730 * 86_400_000),
    },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@delete.test`,
      firstName: "Delete",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminId = admin.id;

  const product = await prisma.loanProduct.create({
    data: {
      associationId,
      code: "TESTDEL",
      name: "Test Loan",
      minimumSavings: "0",
      savingsMultiplier: "10",
      minAmount: "0",
      maxAmount: "5000000",
      interestRate: "24",
      interestMethod: "FLAT",
      processingFeeType: "FIXED",
      processingFeeValue: "0",
      insuranceFeeType: "FIXED",
      insuranceFeeValue: "0",
      minimumMembershipMonths: 0,
      minTermMonths: 1,
      maxTermMonths: 3,
      allowedFrequencies: ["MONTHLY"],
      requiresGuarantors: false,
      minimumGuarantors: 0,
      singleActiveLoan: true,
    },
  });
  productId = product.id;

  // ---- The member who stays -------------------------------------------------
  const other = await createMember(2);
  otherMemberId = other.memberId;
  otherAccountId = other.accountId;
  await postSavingsTransaction({
    savingsAccountId: otherAccountId,
    type: "DEPOSIT",
    direction: "CREDIT",
    amount: "100000",
    channel: "CASH",
    description: "Another member's savings",
  });

  // ---- The test account, used in earnest ------------------------------------
  const test = await createMember(1);
  testUserId = test.userId;
  testMemberId = test.memberId;
  testAccountId = test.accountId;

  // A deposit that arrived through the bank and was matched to them.
  const payment = await prisma.payment.create({
    data: {
      associationId,
      externalTransactionId: `${RUN}-PAY-1`,
      amount: "500000",
      status: "PROCESSED",
      transactionDate: new Date(),
      ingestSource: "MANUAL",
      matchedMemberId: testMemberId,
      matchStrategy: "MEMBER_PAYMENT_REFERENCE",
      matchConfidence: 100,
      matchedAt: new Date(),
      processedAt: new Date(),
    },
  });
  paymentId = payment.id;
  await postSavingsTransaction({
    savingsAccountId: testAccountId,
    type: "DEPOSIT",
    direction: "CREDIT",
    amount: "500000",
    channel: "JENGA_EQUITY",
    paymentId,
    description: "Deposit from the bank",
  });

  const bankLine = await prisma.bkTransaction.create({
    data: {
      associationId,
      bkTransactionId: `${RUN}-BK-1`,
      amount: "500000",
      reconciliationStatus: "MATCHED",
      matchedMemberId: testMemberId,
      matchStrategy: "MEMBER_PAYMENT_REFERENCE",
      matchConfidence: 100,
      matchedAt: new Date(),
      paymentId,
    },
  });
  bankLineId = bankLine.id;

  // A deposit keyed in wrongly and reversed: a reversal pair in the ledger.
  const mistake = await postSavingsTransaction({
    savingsAccountId: testAccountId,
    type: "DEPOSIT",
    direction: "CREDIT",
    amount: "1000",
    channel: "CASH",
  });
  await reverseSavingsTransaction(mistake.id, "Keyed in twice", adminId);

  // A loan, disbursed and partly repaid out of savings — which also writes the
  // interest distribution crediting their half of the interest.
  const application = await submitLoanApplication({
    memberId: testMemberId,
    loanProductId: productId,
    requestedAmount: "300000",
    purpose: "Test loan",
    termMonths: 3,
    frequency: "MONTHLY",
  });
  if (!application.ok) {
    throw new Error(application.failures.map((f) => f.rule).join(","));
  }
  const approval = await approveLoanApplication({
    applicationId: application.applicationId,
    actorId: adminId,
  });
  await disburseLoan({ loanId: approval.loanId, actorId: adminId });
  await recordLoanRepayment({
    loanId: approval.loanId,
    amount: "56000",
    actorId: adminId,
    fromSavings: true,
  });

  // Goods: three machines lent out, two bought and paid for from savings.
  const item = await createItem({
    associationId,
    actorId: adminId,
    sku: `${CODE}-MC`,
    name: "Test machine",
    category: "MACHINE",
    unit: "piece",
    unitCost: "1000",
    unitPrice: "1200",
    currency: "RWF",
    openingQuantity: "10",
  });
  itemId = item.id;
  await issueToMember({
    associationId,
    actorId: adminId,
    memberId: testMemberId,
    terms: "LOAN_OUT",
    lines: [{ itemId, quantity: "3" }],
    dueBackAt: new Date(Date.now() + 30 * 86_400_000),
  });
  const bought = await issueToMember({
    associationId,
    actorId: adminId,
    memberId: testMemberId,
    terms: "PURCHASE",
    lines: [{ itemId, quantity: "2" }],
  });
  await settleIssuance({
    associationId,
    actorId: adminId,
    issuanceId: bought.id,
    amount: "2400",
    fromSavings: true,
  });

  await prisma.contributionFine.create({
    data: {
      associationId,
      memberId: testMemberId,
      reference: `${RUN}-FINE-1`,
      missedDays: 3,
      dueDayIndex: 1,
      arrearsAmount: "3000",
      rate: "0.1",
      amount: "300",
    },
  });

  // Their login wrote a note on the other member's file; an administrator
  // wrote one too.
  await prisma.memberNote.create({
    data: { memberId: otherMemberId, authorId: testUserId, body: "Written by the test login" },
  });
  await prisma.memberNote.create({
    data: { memberId: otherMemberId, authorId: adminId, body: "Written by an administrator" },
  });

  const otherAccount = await prisma.savingsAccount.findUniqueOrThrow({
    where: { id: otherAccountId },
  });
  otherBalanceBefore = otherAccount.balance.toFixed(2);
  otherTransactionsBefore = await prisma.savingsTransaction.count({
    where: { savingsAccountId: otherAccountId },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.memberNote.deleteMany({ where: { member: { associationId } } });
  await prisma.bkTransaction.deleteMany({ where: { associationId } });
  await prisma.payment.deleteMany({ where: { associationId } });
  await prisma.warehouseStockMovement.deleteMany({ where: { associationId } });
  await prisma.warehouseIssuance.deleteMany({ where: { associationId } });
  await prisma.warehouseItem.deleteMany({ where: { associationId } });
  await prisma.savingsTransaction.updateMany({
    where: { associationId },
    data: { reversalOfId: null },
  });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.loanProduct.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

describe("deleting a member with a history", () => {
  it("has the history the test depends on", async () => {
    // If the services above stop writing any of these, the test below would
    // pass without proving anything.
    const [savings, reversals, loans, distributions, issuances, fines] = await Promise.all([
      prisma.savingsTransaction.count({ where: { memberId: testMemberId } }),
      prisma.savingsTransaction.count({
        where: { memberId: testMemberId, reversalOfId: { not: null } },
      }),
      prisma.loan.count({ where: { memberId: testMemberId } }),
      prisma.interestDistribution.count({ where: { memberId: testMemberId } }),
      prisma.warehouseIssuance.count({ where: { memberId: testMemberId } }),
      prisma.contributionFine.count({ where: { memberId: testMemberId } }),
    ]);

    expect(savings).toBeGreaterThan(4);
    expect(reversals).toBe(1);
    expect(loans).toBe(1);
    expect(distributions).toBe(1);
    expect(issuances).toBe(2);
    expect(fines).toBe(1);

    const item = await prisma.warehouseItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.quantityOnHand.toFixed(3)).toBe("5.000");
    expect(item.quantityIssued.toFixed(3)).toBe("3.000");
  });

  it("erases the member, their login and everything that was theirs", async () => {
    const result = await deleteMember({
      memberId: testMemberId,
      actorId: adminId,
      reason: "Test account created while trying out the system",
    });
    expect(result).toEqual({ ok: true });

    const [member, user, account, savings, loans, applications, issuances, fines, notes] =
      await Promise.all([
        prisma.member.findUnique({ where: { id: testMemberId } }),
        prisma.user.findUnique({ where: { id: testUserId } }),
        prisma.savingsAccount.findUnique({ where: { id: testAccountId } }),
        prisma.savingsTransaction.count({
          where: { OR: [{ memberId: testMemberId }, { savingsAccountId: testAccountId }] },
        }),
        prisma.loan.count({ where: { memberId: testMemberId } }),
        prisma.loanApplication.count({ where: { memberId: testMemberId } }),
        prisma.warehouseIssuance.count({ where: { memberId: testMemberId } }),
        prisma.contributionFine.count({ where: { memberId: testMemberId } }),
        prisma.memberNote.count({ where: { authorId: testUserId } }),
      ]);

    expect(member).toBeNull();
    expect(user).toBeNull();
    expect(account).toBeNull();
    expect(savings).toBe(0);
    expect(loans).toBe(0);
    expect(applications).toBe(0);
    expect(issuances).toBe(0);
    expect(fines).toBe(0);
    expect(notes).toBe(0);
  });

  it("leaves the other member exactly as they were", async () => {
    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: otherAccountId },
    });
    expect(account.balance.toFixed(2)).toBe(otherBalanceBefore);
    expect(
      await prisma.savingsTransaction.count({ where: { savingsAccountId: otherAccountId } })
    ).toBe(otherTransactionsBefore);

    // Only the note the deleted login wrote is gone from their file.
    const notes = await prisma.memberNote.findMany({ where: { memberId: otherMemberId } });
    expect(notes.map((n) => n.body)).toEqual(["Written by an administrator"]);
  });

  it("puts the goods back in stock without breaking the stock ledger", async () => {
    const item = await prisma.warehouseItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.quantityOnHand.toFixed(3)).toBe("10.000");
    expect(item.quantityIssued.toFixed(3)).toBe("0.000");

    const movements = await prisma.warehouseStockMovement.findMany({
      where: { itemId },
      orderBy: { sequence: "asc" },
    });

    // Opening receipt, two issues, two returns — nothing removed.
    expect(movements.map((m) => m.type)).toEqual([
      "RECEIPT",
      "ISSUE",
      "ISSUE",
      "RETURN",
      "RETURN",
    ]);
    // The chain is unbroken: each row starts where the one before ended, and
    // the last one agrees with the cached count.
    movements.forEach((movement, i) => {
      expect(movement.sequence).toBe(i + 1);
      if (i > 0) {
        expect(movement.quantityBefore.toFixed(3)).toBe(
          movements[i - 1].quantityAfter.toFixed(3)
        );
      }
    });
    expect(movements.at(-1)!.quantityAfter.toFixed(3)).toBe("10.000");
  });

  it("returns the bank's money to the unmatched queue rather than erasing it", async () => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("UNMATCHED");
    expect(payment.matchedMemberId).toBeNull();
    expect(payment.amount.toFixed(2)).toBe("500000.00");

    const bankLine = await prisma.bkTransaction.findUniqueOrThrow({
      where: { id: bankLineId },
    });
    expect(bankLine.reconciliationStatus).toBe("UNMATCHED");
    expect(bankLine.matchedMemberId).toBeNull();
  });

  it("keeps a full copy of the file in the audit log", async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: testMemberId, action: "MEMBER_DELETED" },
    });
    expect(audit.actorId).toBe(adminId);
    expect(audit.severity).toBe("CRITICAL");

    const oldValue = audit.oldValue as { memberNumber: string; loans: unknown[] };
    expect(oldValue.memberNumber).toBe(`${CODE}-M1`);
    expect(oldValue.loans).toHaveLength(1);

    const metadata = audit.metadata as { erased: { loans: number; warehouse: number } };
    expect(metadata.erased.loans).toBe(1);
    expect(metadata.erased.warehouse).toBe(2);
  });
});

describe("the refusals that remain", () => {
  it("will not let an administrator delete a super administrator", async () => {
    const owner = await createMember(3, "SUPER_ADMIN");

    const result = await deleteMember({
      memberId: owner.memberId,
      actorId: adminId,
      reason: "Trying to remove the platform owner",
    });

    expect(result.ok).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: owner.userId } })).not.toBeNull();
  });

  it("still requires a reason", async () => {
    const result = await deleteMember({
      memberId: otherMemberId,
      actorId: adminId,
      reason: "  ",
    });
    expect(result.ok).toBe(false);
  });
});
