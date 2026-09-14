import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { postSavingsTransaction } from "@/lib/services/ledger";
import {
  approveLoanApplication,
  disburseLoan,
  recordLoanRepayment,
  submitLoanApplication,
  LoanError,
} from "@/lib/services/loans";
import { add, toMoney } from "@/lib/money";

/**
 * Loan lifecycle integration tests.
 *
 * Follows one loan from application through to full settlement, asserting at
 * each step that the loan ledger and the savings ledger agree, and that the
 * balance reaches exactly zero.
 */

const RUN = `LOAN${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminId: string;
let memberId: string;
let savingsAccountId: string;
let productId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: {
      code: CODE,
      name: `Loan Test ${RUN}`,
      status: "ACTIVE",
      currency: "RWF",
      // LENDING_UNLOCK_MONTHS: "The association builds its fund for this many
      // months before it lends anything to anyone." A fixture association
      // created a millisecond ago is zero months old, so every application
      // here would be refused with LENDING_NOT_OPEN — a real rule firing on an
      // unreal association. Backdated two years so the lending rules under
      // test are the ones that actually get exercised.
      createdAt: new Date(Date.now() - 730 * 86_400_000),
    },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@loan.test`,
      firstName: "Loan",
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
      code: "TESTSTD",
      name: "Test Standard Loan",
      // The rulebook, expressed in product columns — see prisma/seed.ts.
      // 2% a month flat is stored as 24% a year because generateSchedule
      // always reads the rate as annual. No fees, six months, monthly.
      // The savings multiple, minimum balance and tenure gate are left
      // non-binding so that assessBorrowing is the only thing deciding.
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
      maxTermMonths: 6,
      allowedFrequencies: ["MONTHLY"],
      requiresGuarantors: false,
      minimumGuarantors: 0,
      singleActiveLoan: true,
    },
  });
  productId = product.id;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member-${RUN.toLowerCase()}@loan.test`,
      firstName: "Loan",
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
          joinedAt: new Date(Date.now() - 365 * 86_400_000),
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${CODE}-SA-1`,
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
  savingsAccountId = user.member!.savingsAccounts[0].id;

  // Fund the savings account through the ledger, as a real member would.
  await postSavingsTransaction({
    savingsAccountId,
    type: "DEPOSIT",
    direction: "CREDIT",
    amount: "500000",
    channel: "CASH",
    description: "Savings before borrowing",
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.loanRepaymentAllocation.deleteMany({
    where: { loanTransaction: { associationId } },
  });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  // Before the loan transactions they point at. InterestDistribution holds a
  // RESTRICT foreign key onto loanTransaction, so deleting the transactions
  // first fails outright rather than cascading.
  //
  // This only started biting once the lifecycle actually reached repayment:
  // every repayment credits the borrower's half of the interest back through
  // `distributeInterest`, which writes one of these rows. While the suite was
  // failing at approval, no repayment ran and none existed to block teardown.
  await prisma.interestDistribution.deleteMany({ where: { associationId } });
  await prisma.loanTransaction.deleteMany({ where: { associationId } });
  await prisma.loanInstallment.deleteMany({ where: { loan: { associationId } } });
  await prisma.loanApplicationEvent.deleteMany({
    where: { application: { associationId } },
  });
  await prisma.loan.deleteMany({ where: { associationId } });
  await prisma.loanApplication.deleteMany({ where: { associationId } });
  await prisma.loanProduct.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

describe("application", () => {
  // Savings are 500,000, so OWN_SAVINGS_PERCENT (80%) puts the no-collateral
  // limit at 400,000 and anything above it needs collateral of equal value.

  it("refuses more than the own-savings share when nothing is pledged", async () => {
    const result = await submitLoanApplication({
      memberId,
      loanProductId: productId,
      requestedAmount: "600000",
      purpose: "Expand tailoring workshop",
      termMonths: 6,
      frequency: "MONTHLY",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.map((f) => f.rule)).toContain("COLLATERAL");
    }
  });

  /**
   * LOAN_MAX_TERM_MONTHS, enforced twice over.
   *
   * The product now restates the six-month rule in its own term bounds, and
   * `checkEligibility` runs before `assessBorrowing` and returns early — so an
   * over-long term is caught by the product's TERM rule and never reaches the
   * rulebook's TERM_TOO_LONG. Both say the same thing because the product was
   * configured from the rulebook; this asserts the refusal, not which of the
   * two gates happened to speak first.
   */
  it("refuses a term longer than the six months the rules allow", async () => {
    const result = await submitLoanApplication({
      memberId,
      loanProductId: productId,
      requestedAmount: "100000",
      purpose: "Buy fabric in bulk for the season",
      termMonths: 12,
      frequency: "MONTHLY",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const rules = result.failures.map((f) => f.rule);
      expect(
        rules.includes("TERM") || rules.includes("TERM_TOO_LONG"),
        rules.join(",")
      ).toBe(true);
    }
  });

  /**
   * The path that was impossible before collateral could be supplied.
   *
   * The rule says anything above your own share may be borrowed against
   * pledged items, but nothing in the application flow accepted a pledge, so
   * the COLLATERAL blocker could never be cleared and every such request was
   * permanently refused. This is the regression test for that.
   */
  it("accepts more than the own share when collateral covers the difference", async () => {
    const result = await submitLoanApplication({
      memberId,
      loanProductId: productId,
      requestedAmount: "600000",
      purpose: "Buy an industrial embroidery machine",
      termMonths: 6,
      frequency: "MONTHLY",
      collateralDescription: "Two industrial sewing machines",
      // 600,000 − 400,000 own share = 200,000 above, covered at 100%.
      collateralValue: "200000",
    });

    // Naming the refusals in the assertion, so a failure here says which rule
    // objected rather than only "expected false to be true".
    expect(
      result.ok,
      result.ok ? "" : result.failures.map((f) => f.rule).join(",")
    ).toBe(true);

    if (result.ok) {
      await prisma.loanApplicationEvent.deleteMany({
        where: { applicationId: result.applicationId },
      });
      await prisma.loanApplication.delete({ where: { id: result.applicationId } });
    }
  });

  it("accepts a request within the own share and snapshots the rulebook", async () => {
    const result = await submitLoanApplication({
      memberId,
      loanProductId: productId,
      requestedAmount: "400000",
      purpose: "Buy industrial sewing machines",
      termMonths: 6,
      frequency: "MONTHLY",
    });

    expect(
      result.ok,
      result.ok ? "" : result.failures.map((f) => f.rule).join(",")
    ).toBe(true);
    if (!result.ok) return;

    const application = await prisma.loanApplication.findUniqueOrThrow({
      where: { id: result.applicationId },
      include: { statusHistory: true },
    });

    expect(application.status).toBe("SUBMITTED");
    expect(application.savingsAtApplication?.toFixed(2)).toBe("500000.00");
    expect(application.statusHistory).toHaveLength(1);

    // The rulebook in force on the day is snapshotted beside the product's
    // own assessment, so an approval questioned later can be judged against
    // the rules that actually applied.
    const report = application.eligibilityReport as {
      ruleCheck?: { ownShareLimit?: string };
      policyAtApplication?: { ownSavingsPercent?: string };
    } | null;
    expect(report?.ruleCheck?.ownShareLimit).toBe("400000.00");
    expect(report?.policyAtApplication?.ownSavingsPercent).toBeDefined();
  });
});

describe("full lifecycle", () => {
  let applicationId: string;
  let loanId: string;

  it("submits and approves", async () => {
    const existing = await prisma.loanApplication.findFirstOrThrow({
      where: { memberId, status: "SUBMITTED" },
    });
    applicationId = existing.id;

    const approval = await approveLoanApplication({
      applicationId,
      actorId: adminId,
      note: "Approved at full amount after review of contribution history",
    });

    loanId = approval.loanId;

    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    expect(loan.status).toBe("PENDING_DISBURSEMENT");
    expect(loan.principal.toFixed(2)).toBe("400000.00");

    // Approval must not move money.
    expect(loan.disbursedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: loanId, action: "ADMIN_APPROVED_LOAN" },
    });
    expect(audit?.actorId).toBe(adminId);
  });

  it("refuses to approve more than was requested", async () => {
    const application = await prisma.loanApplication.create({
      data: {
        associationId,
        memberId,
        loanProductId: productId,
        reference: `${CODE}-APP-OVER`,
        status: "SUBMITTED",
        requestedAmount: "100000",
        purpose: "test",
        termMonths: 6,
        frequency: "MONTHLY",
        submittedAt: new Date(),
      },
    });

    await expect(
      approveLoanApplication({
        applicationId: application.id,
        actorId: adminId,
        approvedAmount: "200000",
      })
    ).rejects.toThrow(/cannot exceed/);
  });

  it("disburses, generating the schedule and crediting savings atomically", async () => {
    const balanceBefore = await savingsBalance();

    const result = await disburseLoan({
      loanId,
      actorId: adminId,
      disbursementDate: new Date("2026-01-15T00:00:00Z"),
    });

    // LOAN_NO_EXTRA_CHARGES: no processing fee and no insurance fee, so the
    // member receives the whole of what they borrowed.
    expect(result.netDisbursement).toBe("400000.00");
    expect(result.instalments).toBe(6);

    expect(await savingsBalance()).toBe(balanceBefore + 400000);

    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });

    expect(loan.status).toBe("ACTIVE");
    expect(loan.installments).toHaveLength(6);
    expect(loan.installments[5].balanceAfter.toFixed(2)).toBe("0.00");

    // 2% a month for six months on 400,000 — the rulebook's own arithmetic,
    // which a member can check on a phone calculator.
    expect(loan.totalInterest.toFixed(2)).toBe("48000.00");
    expect(loan.totalFees.toFixed(2)).toBe("0.00");
    expect(loan.totalPayable.toFixed(2)).toBe("448000.00");

    // The schedule's instalments must sum to the recorded total payable.
    const scheduleTotal = loan.installments.reduce(
      (total, i) => add(total, i.totalDue),
      toMoney(0)
    );
    expect(scheduleTotal.toFixed(2)).toBe(loan.totalPayable.toFixed(2));

    // Loan ledger row exists and is linked to the savings credit.
    const loanTx = await prisma.loanTransaction.findFirstOrThrow({
      where: { loanId, type: "DISBURSEMENT" },
    });
    const savingsTx = await prisma.savingsTransaction.findFirstOrThrow({
      where: { loanTransactionId: loanTx.id },
    });
    expect(savingsTx.type).toBe("LOAN_DISBURSEMENT");
    expect(savingsTx.amount.toFixed(2)).toBe("400000.00");
  });

  it("refuses to disburse the same loan twice", async () => {
    await expect(disburseLoan({ loanId, actorId: adminId })).rejects.toThrow(LoanError);
  });

  it("allocates a repayment penalties-fees-interest-principal, oldest first", async () => {
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    const firstInstalment = await prisma.loanInstallment.findFirstOrThrow({
      where: { loanId, installmentNumber: 1 },
    });

    const result = await recordLoanRepayment({
      loanId,
      amount: firstInstalment.totalDue.toFixed(2),
      actorId: adminId,
      fromSavings: true,
    });

    // There are no fees to settle under the rulebook, so interest is taken
    // first and the rest reduces principal. 48,000 over six instalments.
    expect(result.allocated.fees).toBe("0.00");
    expect(result.allocated.interest).toBe("8000.00");
    expect(Number(result.allocated.principal)).toBeGreaterThan(0);
    expect(result.instalmentsSettled).toBe(1);

    const settled = await prisma.loanInstallment.findUniqueOrThrow({
      where: { id: firstInstalment.id },
    });
    expect(settled.status).toBe("PAID");

    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    expect(Number(after.totalPaid)).toBeCloseTo(Number(firstInstalment.totalDue), 2);
    expect(Number(after.principalOutstanding)).toBeLessThan(Number(loan.principalOutstanding));
  });

  it("refuses a repayment larger than the outstanding balance", async () => {
    await expect(
      recordLoanRepayment({ loanId, amount: "99999999", actorId: adminId })
    ).rejects.toThrow(/exceeds/);
  });

  it("settles the loan to exactly zero and marks it completed", async () => {
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });

    const outstanding = add(
      loan.principalOutstanding,
      loan.interestOutstanding,
      loan.feesOutstanding,
      loan.penaltyOutstanding
    );

    // Pay the remainder from an external channel rather than savings, so the
    // savings balance is not required to cover it.
    const result = await recordLoanRepayment({
      loanId,
      amount: outstanding.toFixed(2),
      actorId: adminId,
      channel: "BANK_TRANSFER",
      externalReference: "FINAL-SETTLEMENT",
    });

    expect(result.loanCompleted).toBe(true);
    expect(result.totalOutstanding).toBe("0.00");

    const settled = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { installments: true },
    });

    expect(settled.status).toBe("COMPLETED");
    expect(settled.completedAt).not.toBeNull();

    // Every bucket at exactly zero — the property that makes a loan closable.
    expect(settled.principalOutstanding.toFixed(2)).toBe("0.00");
    expect(settled.interestOutstanding.toFixed(2)).toBe("0.00");
    expect(settled.feesOutstanding.toFixed(2)).toBe("0.00");
    expect(settled.totalPaid.toFixed(2)).toBe(settled.totalPayable.toFixed(2));

    expect(settled.installments.every((i) => i.status === "PAID")).toBe(true);
  });

  it("refuses further repayments on a completed loan", async () => {
    await expect(
      recordLoanRepayment({ loanId, amount: "1000", actorId: adminId })
    ).rejects.toThrow(/cannot receive repayments/);
  });

  it("leaves the loan ledger internally consistent", async () => {
    const transactions = await prisma.loanTransaction.findMany({
      where: { loanId },
      orderBy: { sequence: "asc" },
    });

    // Gapless sequence.
    expect(transactions.map((t) => t.sequence)).toEqual(
      Array.from({ length: transactions.length }, (_, i) => i + 1)
    );

    const repayments = transactions.filter((t) => t.type === "REPAYMENT");
    const totalRepaid = repayments.reduce((total, t) => add(total, t.amount), toMoney(0));

    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    expect(totalRepaid.toFixed(2)).toBe(loan.totalPayable.toFixed(2));

    // Each repayment's bucket split must sum to its own amount.
    for (const repayment of repayments) {
      const split = add(
        repayment.principalPortion,
        repayment.interestPortion,
        repayment.feesPortion,
        repayment.penaltyPortion
      );
      expect(split.toFixed(2)).toBe(repayment.amount.toFixed(2));
    }
  });
});

async function savingsBalance(): Promise<number> {
  const account = await prisma.savingsAccount.findUniqueOrThrow({
    where: { id: savingsAccountId },
    select: { balance: true },
  });
  return Number(account.balance.toFixed(2));
}
