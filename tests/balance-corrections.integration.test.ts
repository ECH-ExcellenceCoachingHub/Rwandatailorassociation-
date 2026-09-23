import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { postSavingsTransaction, verifyAccountIntegrity } from "@/lib/services/ledger";
import {
  CorrectionError,
  correctLoanBalance,
  recordMissedDeposit,
  setSavingsBalance,
} from "@/lib/services/balance-corrections";
import { recordLoanRepayment } from "@/lib/services/loans";

/**
 * Hand corrections to a member's figures, against a real database.
 *
 * The point of each test is that the correction leaves the books consistent:
 * the savings ledger still replays to the cached balance, and the loan's
 * schedule, totals and status still agree with each other afterwards.
 */

const RUN = `CORR${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);
const DAY = 86_400_000;

let associationId: string;
let adminId: string;
let memberId: string;
let savingsAccountId: string;
let productId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `Correction Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@corr.test`,
      firstName: "Corr",
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
      code: "CORRSTD",
      name: "Correction Test Loan",
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
      singleActiveLoan: false,
    },
  });
  productId = product.id;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member-${RUN.toLowerCase()}@corr.test`,
      firstName: "Corr",
      lastName: "Member",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M1`,
          paymentReference: `${CODE}-1`,
          status: "ACTIVE",
          joinedAt: new Date(Date.now() - 365 * DAY),
          savingsAccounts: {
            create: { associationId, accountNumber: `${CODE}-SA-1`, currency: "RWF", balance: "0" },
          },
        },
      },
    },
    include: { member: { include: { savingsAccounts: true } } },
  });
  memberId = user.member!.id;
  savingsAccountId = user.member!.savingsAccounts[0].id;

  await postSavingsTransaction({
    savingsAccountId,
    type: "DEPOSIT",
    direction: "CREDIT",
    amount: "100000",
    channel: "CASH",
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.loanRepaymentAllocation.deleteMany({ where: { loanTransaction: { associationId } } });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.interestDistribution.deleteMany({ where: { associationId } });
  await prisma.loanTransaction.deleteMany({ where: { associationId } });
  await prisma.loanInstallment.deleteMany({ where: { loan: { associationId } } });
  await prisma.loan.deleteMany({ where: { associationId } });
  await prisma.loanProduct.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

/** A disbursed 3-month loan of 30,000 at 2,000 interest a month; the first instalment is overdue. */
async function createLoan(reference: string) {
  const now = Date.now();
  return prisma.loan.create({
    data: {
      associationId,
      memberId,
      loanProductId: productId,
      reference: `${CODE}-${reference}`,
      status: "OVERDUE",
      principal: "30000",
      interestRate: "24",
      interestMethod: "FLAT",
      termMonths: 3,
      frequency: "MONTHLY",
      totalInterest: "6000",
      totalPayable: "36000",
      principalOutstanding: "30000",
      interestOutstanding: "6000",
      disbursedAmount: "30000",
      disbursedAt: new Date(now - 40 * DAY),
      daysOverdue: 10,
      overdueAmount: "12000",
      installments: {
        create: [1, 2, 3].map((n) => ({
          installmentNumber: n,
          dueDate: new Date(now + (n * 30 - 40) * DAY),
          status: n === 1 ? ("OVERDUE" as const) : ("UPCOMING" as const),
          principalDue: "10000",
          interestDue: "2000",
          totalDue: "12000",
          balanceAfter: String(30000 - n * 10000),
        })),
      },
    },
  });
}

describe("savings corrections", () => {
  it("records a missed deposit as a DEPOSIT that counts toward contributions", async () => {
    const before = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: savingsAccountId } });

    const posted = await recordMissedDeposit({
      memberId,
      amount: "5000",
      channel: "CASH",
      reason: "Cash paid at the office, receipt 0042",
      actorId: adminId,
    });

    const after = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: savingsAccountId } });
    expect(posted.type).toBe("DEPOSIT");
    expect(after.balance.toFixed(2)).toBe(before.balance.plus(5000).toFixed(2));
    expect(after.totalDeposits.toFixed(2)).toBe(before.totalDeposits.plus(5000).toFixed(2));
  });

  it("sets the balance to a stated figure with one ADJUSTMENT, in either direction", async () => {
    const down = await setSavingsBalance({
      memberId,
      targetBalance: "80000",
      reason: "Duplicate statement line credited twice",
      actorId: adminId,
    });
    expect(down).toMatchObject({ type: "ADJUSTMENT", direction: "DEBIT", balanceAfter: "80000.00" });

    const up = await setSavingsBalance({
      memberId,
      targetBalance: "82500.50",
      reason: "Passbook reconciliation",
      actorId: adminId,
    });
    expect(up).toMatchObject({ direction: "CREDIT", amount: "2500.50", balanceAfter: "82500.50" });

    const row = await prisma.savingsTransaction.findUniqueOrThrow({ where: { id: up.id } });
    expect(row.adjustmentReason).toBe("Passbook reconciliation");
    expect(row.postedById).toBe(adminId);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: up.id, action: "BALANCE_ADJUSTED" },
    });
    expect(audit?.severity).toBe("CRITICAL");

    // The ledger still replays to the cached balance.
    expect((await verifyAccountIntegrity(savingsAccountId)).ok).toBe(true);
  });

  it("refuses a correction that changes nothing, or has no reason", async () => {
    await expect(
      setSavingsBalance({ memberId, targetBalance: "82500.50", reason: "Same figure", actorId: adminId })
    ).rejects.toMatchObject({ code: "NO_CHANGE" });
    await expect(
      setSavingsBalance({ memberId, targetBalance: "1", reason: "  ", actorId: adminId })
    ).rejects.toBeInstanceOf(CorrectionError);
  });
});

describe("loan corrections", () => {
  it("reduces interest, reshapes the schedule and clears the arrears", async () => {
    const loan = await createLoan("L1");

    const result = await correctLoanBalance({
      loanId: loan.id,
      outstanding: { principal: "30000", interest: "3000", fees: "0", penalty: "0" },
      reason: "Interest charged at the wrong rate",
      actorId: adminId,
    });
    expect(result).toMatchObject({ totalOutstanding: "33000.00", instalmentsChanged: 2 });

    const after = await prisma.loan.findUniqueOrThrow({
      where: { id: loan.id },
      include: { installments: { orderBy: { installmentNumber: "asc" } }, transactions: true },
    });
    expect(after.interestOutstanding.toFixed(2)).toBe("3000.00");
    expect(after.totalPayable.toFixed(2)).toBe("33000.00");
    // The schedule still sums to what the loan says is owed.
    const scheduled = after.installments.reduce((t, i) => t.plus(i.totalDue).minus(i.totalPaid), after.totalPaid.mul(0));
    expect(scheduled.toFixed(2)).toBe("33000.00");
    // Instalment 1 lost its interest but still owes principal, so it stays overdue.
    expect(after.installments[0].interestDue.toFixed(2)).toBe("0.00");
    expect(after.status).toBe("OVERDUE");
    expect(after.overdueAmount.toFixed(2)).toBe("10000.00");

    const [entry] = after.transactions;
    expect(entry).toMatchObject({ type: "ADJUSTMENT", adjustmentReason: "Interest charged at the wrong rate" });
    expect(entry.interestPortion.toFixed(2)).toBe("-3000.00");
  });

  it("closes a loan corrected to zero, and reopens it when corrected back up", async () => {
    const loan = await createLoan("L2");

    const closed = await correctLoanBalance({
      loanId: loan.id,
      outstanding: { principal: "0", interest: "0", fees: "0", penalty: "0" },
      reason: "Repaid in cash before the system went live",
      actorId: adminId,
    });
    expect(closed.status).toBe("COMPLETED");
    const afterClose = await prisma.loan.findUniqueOrThrow({
      where: { id: loan.id },
      include: { installments: true },
    });
    expect(afterClose.completedAt).not.toBeNull();
    expect(afterClose.daysOverdue).toBe(0);
    expect(afterClose.installments.every((i) => i.status === "PAID")).toBe(true);

    const reopened = await correctLoanBalance({
      loanId: loan.id,
      outstanding: { principal: "10000", interest: "0", fees: "0", penalty: "0" },
      reason: "Closed by mistake — only two instalments were repaid",
      actorId: adminId,
    });
    expect(reopened.status).not.toBe("COMPLETED");

    // A repayment then settles the corrected figure exactly.
    const repaid = await recordLoanRepayment({ loanId: loan.id, amount: "10000", actorId: adminId });
    expect(repaid).toMatchObject({ totalOutstanding: "0.00", loanCompleted: true });
  });
});
