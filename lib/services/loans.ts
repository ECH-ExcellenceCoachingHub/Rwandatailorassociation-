import "server-only";
import { Prisma, prisma, withFinancialTransaction } from "@/lib/db/prisma";
import { loanLogger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, gt, isPositive, lte, min, subtract, toMoney, toMoneyString } from "@/lib/money";
import {
  buildTransactionReference,
  postSavingsTransaction,
} from "@/lib/services/ledger";
import { checkEligibility, generateSchedule } from "@/lib/services/loan-calculator";
import { distributeInterest } from "@/lib/services/interest-sharing";
import { assessBorrowing, wholeMonthsBetween } from "@/lib/rules/borrowing";
import { getMemberStanding } from "@/lib/services/contributions";
import { getPolicy, getPolicyWithin } from "@/lib/services/rulebook";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import type { LoanApplicationStatus, RepaymentFrequency } from "@/lib/generated/prisma/enums";

/**
 * LOAN LIFECYCLE.
 *
 * application → review → approval → disbursement → repayment → completion
 *
 * The financial steps (disbursement and repayment) go through the same
 * discipline as savings: one database transaction, an append-only loan ledger
 * row, and an audit entry written inside that transaction.
 *
 * Repayment allocation follows a fixed, stated order — penalties, then fees,
 * then interest, then principal. It is written down here rather than left
 * implicit because it materially changes what a member owes: paying principal
 * first would reduce future interest and flatter the member, while charging
 * penalties first is the convention associations actually operate.
 */

/**
 * Serialises a report into the exact shape the Json column will hold.
 *
 * Not merely a cast. The eligibility snapshot is assembled from interfaces,
 * and TypeScript will not accept an interface where Prisma wants
 * `InputJsonValue` — an interface has no implicit index signature, so the
 * compiler cannot prove every property is serialisable. Round-tripping through
 * JSON both satisfies that and does what the database is about to do anyway:
 * drops `undefined`, renders dates as ISO strings, and guarantees what was
 * type-checked is what is stored.
 */
function asJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class LoanError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_ELIGIBLE"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "ALREADY_DISBURSED"
      | "REASON_REQUIRED"
      | "OVERPAYMENT"
  ) {
    super(message);
    this.name = "LoanError";
  }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export interface SubmitApplicationInput {
  memberId: string;
  loanProductId: string;
  requestedAmount: string;
  purpose: string;
  termMonths: number;
  frequency: RepaymentFrequency;
  guarantors?: { fullName: string; phone?: string; nationalId?: string; memberId?: string }[];
  /// What the member has pledged, when the amount exceeds the share they may
  /// take against their own savings. Free text plus a value the committee will
  /// verify — the rule says "materials or anything", so the field cannot be a
  /// closed list of asset types.
  collateralDescription?: string | null;
  collateralValue?: string | null;
}

export async function submitLoanApplication(
  input: SubmitApplicationInput
): Promise<{ ok: true; applicationId: string; reference: string } | { ok: false; failures: { rule: string; message: string }[] }> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: input.memberId },
    select: {
      id: true,
      associationId: true,
      status: true,
      joinedAt: true,
      createdAt: true,
      approvedAt: true,
      savingsAccounts: { where: { isActive: true }, take: 1, select: { balance: true } },
      loans: {
        where: { status: { in: ["PENDING_DISBURSEMENT", "DISBURSED", "ACTIVE", "OVERDUE"] } },
        select: { id: true },
      },
      association: { select: { createdAt: true } },
    },
  });

  if (member.status !== "ACTIVE") {
    return {
      ok: false,
      failures: [{ rule: "MEMBER_STATUS", message: "Your membership is not active" }],
    };
  }

  const product = await prisma.loanProduct.findFirstOrThrow({
    // Scoped to the member's association: a member must not be able to apply
    // against another association's product by supplying its id.
    where: { id: input.loanProductId, associationId: member.associationId, isActive: true },
  });

  const savingsBalance = member.savingsAccounts[0]?.balance ?? toMoney(0);
  const since = member.joinedAt ?? member.createdAt;
  const membershipMonths = Math.floor(
    (Date.now() - since.getTime()) / (30.44 * 86_400_000)
  );

  // Eligibility is evaluated on the SERVER from stored data. The client's view
  // of the member's balance is never trusted.
  const eligibility = checkEligibility({
    savingsBalance,
    requestedAmount: input.requestedAmount,
    termMonths: input.termMonths,
    membershipMonths,
    hasActiveLoan: member.loans.length > 0,
    product: {
      name: product.name,
      minimumSavings: product.minimumSavings,
      savingsMultiplier: product.savingsMultiplier,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      absoluteMaxAmount: product.absoluteMaxAmount,
      minimumMembershipMonths: product.minimumMembershipMonths,
      minTermMonths: product.minTermMonths,
      maxTermMonths: product.maxTermMonths,
      singleActiveLoan: product.singleActiveLoan,
    },
  });

  if (!eligibility.eligible) {
    return { ok: false, failures: eligibility.failures };
  }

  // THE ASSOCIATION'S OWN RULES, on top of the product's.
  //
  // Checked here and not only in the form, because the form is a convenience
  // and this is the decision. A member who is behind on their daily saving, or
  // who is asking for more than their savings share without pledging anything,
  // is refused with the sentence that says what would change it.
  const policy = await getPolicy(member.associationId);
  const standing = await getMemberStanding(member.id);

  const ruleCheck = assessBorrowing({
    policy,
    savingsBalance: toMoneyString(savingsBalance),
    membershipMonths: wholeMonthsBetween(since, new Date()),
    associationMonths: wholeMonthsBetween(member.association.createdAt, new Date()),
    missedDays: standing?.missedDays ?? 0,
    outstandingFines: standing?.outstandingFineAmount ?? "0.00",
    hasActiveLoan: member.loans.length > 0,
    requestedAmount: input.requestedAmount,
    collateralValue: input.collateralValue ?? null,
    termMonths: input.termMonths,
  });

  if (ruleCheck.blockers.length > 0) {
    return { ok: false, failures: ruleCheck.blockers };
  }

  const reference = buildTransactionReference("APP");

  const application = await prisma.loanApplication.create({
    data: {
      associationId: member.associationId,
      memberId: member.id,
      loanProductId: product.id,
      reference,
      status: "SUBMITTED",
      requestedAmount: toMoneyString(input.requestedAmount),
      purpose: input.purpose,
      termMonths: input.termMonths,
      frequency: input.frequency,
      // The eligibility snapshot: what was true when they applied, so a later
      // approval can be judged against the facts that existed at the time.
      savingsAtApplication: toMoneyString(savingsBalance),
      maxEligibleAmount: eligibility.maxEligibleAmount,
      eligibilityPassed: true,
      // Both assessments are snapshotted. The association's rules change more
      // often than a loan product does, and an approval questioned next year
      // has to be judgeable against the rulebook that was in force on the day.
      eligibilityReport: asJson({
        ...eligibility,
        membershipMonths,
        ruleCheck,
        policyAtApplication: policy,
        collateral: input.collateralDescription
          ? {
              description: input.collateralDescription,
              value: input.collateralValue ?? null,
            }
          : null,
      }),
      submittedAt: new Date(),
      statusHistory: {
        create: { toStatus: "SUBMITTED", note: "Submitted by member" },
      },
      guarantors: input.guarantors?.length
        ? {
            create: input.guarantors.map((g) => ({
              fullName: g.fullName,
              phone: g.phone ?? null,
              nationalId: g.nationalId ?? null,
              guarantorMemberId: g.memberId ?? null,
            })),
          }
        : undefined,
    },
    select: { id: true, reference: true },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.LOAN_APPLICATION_SUBMITTED,
      entityType: "LoanApplication",
      entityId: application.id,
      associationId: member.associationId,
      newValue: {
        reference: application.reference,
        requestedAmount: toMoneyString(input.requestedAmount),
        termMonths: input.termMonths,
      },
    },
    null
  );

  return { ok: true, applicationId: application.id, reference: application.reference };
}

/** Moves an application between review states, recording who and why. */
export async function transitionApplication(params: {
  applicationId: string;
  toStatus: LoanApplicationStatus;
  actorId: string;
  note?: string;
  rejectionReason?: string;
  infoRequested?: string;
}): Promise<void> {
  const application = await prisma.loanApplication.findUniqueOrThrow({
    where: { id: params.applicationId },
    select: { id: true, status: true, associationId: true, reference: true },
  });

  if (params.toStatus === "REJECTED" && !params.rejectionReason?.trim()) {
    throw new LoanError("A rejection requires a written reason", "REASON_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    await tx.loanApplication.update({
      where: { id: application.id },
      data: {
        status: params.toStatus,
        reviewedById: params.actorId,
        reviewedAt: new Date(),
        reviewNotes: params.note ?? undefined,
        rejectionReason: params.rejectionReason ?? undefined,
        infoRequested: params.infoRequested ?? undefined,
        infoRequestedAt: params.infoRequested ? new Date() : undefined,
        ...(params.toStatus === "REJECTED"
          ? { decidedById: params.actorId, decidedAt: new Date() }
          : {}),
      },
    });

    await tx.loanApplicationEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: params.toStatus,
        actorId: params.actorId,
        note: params.note ?? params.rejectionReason ?? params.infoRequested ?? null,
      },
    });
  });

  await recordAudit(
    {
      action:
        params.toStatus === "REJECTED"
          ? AUDIT_ACTIONS.ADMIN_REJECTED_LOAN
          : params.toStatus === "MORE_INFORMATION_REQUIRED"
            ? AUDIT_ACTIONS.LOAN_INFO_REQUESTED
            : AUDIT_ACTIONS.LOAN_APPLICATION_REVIEWED,
      entityType: "LoanApplication",
      entityId: application.id,
      associationId: application.associationId,
      oldValue: { status: application.status },
      newValue: { status: params.toStatus },
      reason: params.rejectionReason ?? params.note ?? null,
    },
    { id: params.actorId }
  );
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

/**
 * Approves an application and creates the loan in PENDING_DISBURSEMENT.
 *
 * Approval does NOT move money. The loan exists with its terms fixed and its
 * schedule not yet generated; disbursement is a separate, separately
 * authorised act. Keeping them apart means approving a loan can never
 * accidentally pay one out.
 */
export async function approveLoanApplication(params: {
  applicationId: string;
  actorId: string;
  approvedAmount?: string;
  approvedRate?: string;
  approvedTermMonths?: number;
  approvedFrequency?: RepaymentFrequency;
  note?: string;
}): Promise<{ loanId: string; reference: string }> {
  const application = await prisma.loanApplication.findUniqueOrThrow({
    where: { id: params.applicationId },
    include: { loanProduct: true, loan: { select: { id: true } } },
  });

  if (application.loan) {
    throw new LoanError("This application has already been approved", "INVALID_STATE");
  }
  if (!["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(application.status)) {
    throw new LoanError(
      `An application with status ${application.status} cannot be approved`,
      "INVALID_STATE"
    );
  }

  const product = application.loanProduct;

  // The reviewer may approve less than requested, but never more — an approval
  // above the requested amount is either a typo or an abuse.
  const requested = toMoney(application.requestedAmount);
  const approvedAmount = params.approvedAmount ? toMoney(params.approvedAmount) : requested;

  if (gt(approvedAmount, requested)) {
    throw new LoanError(
      `The approved amount cannot exceed the ${toMoneyString(requested)} requested`,
      "INVALID_STATE"
    );
  }
  if (!isPositive(approvedAmount)) {
    throw new LoanError("The approved amount must be greater than zero", "INVALID_STATE");
  }

  const rate = params.approvedRate ?? product.interestRate.toString();
  const termMonths = params.approvedTermMonths ?? application.termMonths;
  const frequency = params.approvedFrequency ?? application.frequency;

  const reference = buildTransactionReference("LN");

  const result = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        associationId: application.associationId,
        memberId: application.memberId,
        loanProductId: product.id,
        applicationId: application.id,
        reference,
        status: "PENDING_DISBURSEMENT",
        principal: toMoneyString(approvedAmount),
        interestRate: rate,
        interestMethod: product.interestMethod,
        interestPeriod: product.interestPeriod,
        termMonths,
        frequency,
        gracePeriodDays: product.gracePeriodDays,
        currency: "RWF",
      },
      select: { id: true, reference: true },
    });

    await tx.loanApplication.update({
      where: { id: application.id },
      data: {
        status: "APPROVED",
        approvedAmount: toMoneyString(approvedAmount),
        approvedRate: rate,
        approvedTermMonths: termMonths,
        approvedFrequency: frequency,
        decidedById: params.actorId,
        decidedAt: new Date(),
        reviewNotes: params.note ?? undefined,
      },
    });

    await tx.loanApplicationEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: "APPROVED",
        actorId: params.actorId,
        note: params.note ?? null,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.ADMIN_APPROVED_LOAN,
        entityType: "Loan",
        entityId: loan.id,
        associationId: application.associationId,
        newValue: {
          reference: loan.reference,
          approvedAmount: toMoneyString(approvedAmount),
          requestedAmount: toMoneyString(requested),
          interestRate: rate,
          termMonths,
        },
        severity: "NOTICE",
      },
      { id: params.actorId },
      tx
    );

    return loan;
  });

  loanLogger.info(
    { loanId: result.id, reference: result.reference, amount: toMoneyString(approvedAmount) },
    "loan approved"
  );

  return { loanId: result.id, reference: result.reference };
}

// ---------------------------------------------------------------------------
// Disbursement
// ---------------------------------------------------------------------------

/**
 * Disburses an approved loan.
 *
 * In one transaction: generates the repayment schedule, writes the loan ledger
 * entry, credits the member's savings account with the net proceeds, and
 * records the audit. Either all of it happens or none of it does — a loan
 * marked disbursed with no schedule, or a schedule with no money, are both
 * states nobody can reconcile later.
 */
export async function disburseLoan(params: {
  loanId: string;
  actorId: string;
  /// Where the money went. Defaults to crediting the member's savings account.
  channel?: "SAVINGS_ACCOUNT" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CASH";
  externalReference?: string;
  disbursementDate?: Date;
}): Promise<{ netDisbursement: string; instalments: number; maturityDate: Date }> {
  return withFinancialTransaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: params.loanId },
      include: {
        loanProduct: true,
        member: {
          select: {
            id: true,
            savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
          },
        },
      },
    });

    if (loan.status !== "PENDING_DISBURSEMENT") {
      throw new LoanError(
        `This loan is ${loan.status} and cannot be disbursed`,
        "ALREADY_DISBURSED"
      );
    }

    const disbursementDate = params.disbursementDate ?? new Date();

    // LOAN_NO_EXTRA_CHARGES: "No processing fee, no insurance fee, no file
    // charge." Read from the rulebook rather than trusting the product to have
    // been configured for it. The product restates the rule today, but a fee
    // added back onto it would otherwise reintroduce a charge the rules forbid
    // and nothing would catch it.
    const feePolicy = await getPolicyWithin(tx, loan.associationId);
    const feesAllowed = !feePolicy.loanNoExtraCharges;

    const schedule = generateSchedule({
      principal: loan.principal,
      annualRate: loan.interestRate,
      method: loan.interestMethod,
      termMonths: loan.termMonths,
      frequency: loan.frequency,
      gracePeriodDays: loan.gracePeriodDays,
      disbursementDate,
      processingFeeType: loan.loanProduct.processingFeeType,
      processingFeeValue: feesAllowed ? loan.loanProduct.processingFeeValue : 0,
      insuranceFeeType: loan.loanProduct.insuranceFeeType,
      insuranceFeeValue: feesAllowed ? loan.loanProduct.insuranceFeeValue : 0,
    });

    await tx.loanInstallment.createMany({
      data: schedule.instalments.map((instalment) => ({
        loanId: loan.id,
        installmentNumber: instalment.installmentNumber,
        dueDate: instalment.dueDate,
        status: "UPCOMING" as const,
        principalDue: instalment.principalDue,
        interestDue: instalment.interestDue,
        feesDue: instalment.feesDue,
        totalDue: instalment.totalDue,
        balanceAfter: instalment.balanceAfter,
      })),
    });

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: "ACTIVE",
        totalInterest: schedule.totalInterest,
        processingFee: schedule.processingFee,
        insuranceFee: schedule.insuranceFee,
        totalFees: schedule.totalFees,
        totalPayable: schedule.totalPayable,
        principalOutstanding: schedule.principal,
        interestOutstanding: schedule.totalInterest,
        feesOutstanding: schedule.totalFees,
        disbursedAmount: schedule.netDisbursement,
        disbursedAt: disbursementDate,
        disbursedById: params.actorId,
        disbursementChannel:
          params.channel === "BANK_TRANSFER"
            ? "BANK_TRANSFER"
            : params.channel === "MOBILE_MONEY"
              ? "MOBILE_MONEY"
              : params.channel === "CASH"
                ? "CASH"
                : "INTERNAL_TRANSFER",
        disbursementReference: params.externalReference ?? null,
        firstRepaymentDate: schedule.instalments[0].dueDate,
        maturityDate: schedule.maturityDate,
      },
    });

    const loanTransaction = await tx.loanTransaction.create({
      data: {
        associationId: loan.associationId,
        loanId: loan.id,
        sequence: 1,
        reference: buildTransactionReference("LDS"),
        type: "DISBURSEMENT",
        amount: schedule.principal,
        balanceAfter: schedule.totalPayable,
        description: `Loan ${loan.reference} disbursed`,
        externalReference: params.externalReference ?? null,
        postedById: params.actorId,
        valueDate: disbursementDate,
      },
      select: { id: true },
    });

    // Crediting the member's savings account is the default: it leaves a
    // ledger trail on both sides, so the money can be followed from the loan
    // to the member's balance and out again.
    const savingsAccountId = loan.member.savingsAccounts[0]?.id;

    if (savingsAccountId && params.channel !== "CASH" && params.channel !== "BANK_TRANSFER") {
      await postSavingsTransaction(
        {
          savingsAccountId,
          type: "LOAN_DISBURSEMENT",
          direction: "CREDIT",
          amount: schedule.netDisbursement,
          channel: "INTERNAL_TRANSFER",
          description: `Loan ${loan.reference} disbursed (net of ${toMoneyString(schedule.totalFees)} fees)`,
          loanId: loan.id,
          loanTransactionId: loanTransaction.id,
          postedById: params.actorId,
        },
        tx
      );
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.LOAN_DISBURSED,
        entityType: "Loan",
        entityId: loan.id,
        associationId: loan.associationId,
        newValue: {
          reference: loan.reference,
          principal: schedule.principal,
          netDisbursement: schedule.netDisbursement,
          totalPayable: schedule.totalPayable,
          instalments: schedule.instalments.length,
          maturityDate: schedule.maturityDate,
        },
        severity: "NOTICE",
      },
      { id: params.actorId },
      tx
    );

    loanLogger.info(
      {
        loanId: loan.id,
        reference: loan.reference,
        net: schedule.netDisbursement,
        instalments: schedule.instalments.length,
      },
      "loan disbursed"
    );

    return {
      netDisbursement: schedule.netDisbursement,
      instalments: schedule.instalments.length,
      maturityDate: schedule.maturityDate,
    };
  });
}

// ---------------------------------------------------------------------------
// Repayment
// ---------------------------------------------------------------------------

export interface RepaymentResult {
  reference: string;
  allocated: {
    penalty: string;
    fees: string;
    interest: string;
    principal: string;
  };
  totalOutstanding: string;
  loanCompleted: boolean;
  instalmentsSettled: number;
  /// How the interest in this repayment was divided under the interest-sharing
  /// rule. Null when the repayment cleared no interest — an early payment that
  /// went entirely to principal, or an association that shares nothing.
  interestShared: {
    memberShare: string;
    associationShare: string;
    balanceAfter: string | null;
  } | null;
}

/**
 * Records a repayment and allocates it across instalments.
 *
 * ALLOCATION ORDER: penalties → fees → interest → principal, oldest instalment
 * first. Stated explicitly because it is a policy decision, not a technical
 * one: it determines how much interest a member ultimately pays, and any two
 * systems that disagree about it will disagree about the balance.
 *
 * INTEREST IS SPLIT AS IT IS COLLECTED. Under the association's rules half of
 * every point of interest goes back into the borrower's own savings, so a
 * repayment does not merely reduce a debt — it also credits an account. Both
 * happen inside this one transaction; see lib/services/interest-sharing.ts for
 * why that is not negotiable.
 */
export async function recordLoanRepayment(params: {
  loanId: string;
  amount: string;
  actorId?: string | null;
  /// Debit the member's savings account rather than recording an external payment.
  fromSavings?: boolean;
  channel?: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "JENGA_EQUITY";
  externalReference?: string;
  description?: string;
}): Promise<RepaymentResult> {
  const amount = toMoney(params.amount);

  if (!isPositive(amount)) {
    throw new LoanError("A repayment must be greater than zero", "INVALID_STATE");
  }

  const result = await withFinancialTransaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: params.loanId },
      include: {
        member: {
          select: {
            id: true,
            userId: true,
            savingsAccounts: { where: { isActive: true }, take: 1, select: { id: true } },
          },
        },
        installments: {
          where: { status: { not: "PAID" } },
          orderBy: { installmentNumber: "asc" },
        },
      },
    });

    if (!["ACTIVE", "DISBURSED", "OVERDUE"].includes(loan.status)) {
      throw new LoanError(
        `A loan with status ${loan.status} cannot receive repayments`,
        "INVALID_STATE"
      );
    }

    const totalOwed = add(
      loan.principalOutstanding,
      loan.interestOutstanding,
      loan.feesOutstanding,
      loan.penaltyOutstanding
    );

    if (gt(amount, totalOwed)) {
      throw new LoanError(
        `The repayment of ${toMoneyString(amount)} exceeds the ${toMoneyString(totalOwed)} outstanding`,
        "OVERPAYMENT"
      );
    }

    // Allocate across instalments, oldest first, in the stated bucket order.
    let remaining = amount;
    let penaltyPaid = toMoney(0);
    let feesPaid = toMoney(0);
    let interestPaid = toMoney(0);
    let principalPaid = toMoney(0);
    let instalmentsSettled = 0;

    const allocations: {
      installmentId: string;
      principal: string;
      interest: string;
      fees: string;
      penalty: string;
      total: string;
    }[] = [];

    for (const instalment of loan.installments) {
      if (!isPositive(remaining)) break;

      const buckets = [
        { key: "penalty", due: subtract(instalment.penaltyDue, instalment.penaltyPaid) },
        { key: "fees", due: subtract(instalment.feesDue, instalment.feesPaid) },
        { key: "interest", due: subtract(instalment.interestDue, instalment.interestPaid) },
        { key: "principal", due: subtract(instalment.principalDue, instalment.principalPaid) },
      ] as const;

      const taken = { penalty: toMoney(0), fees: toMoney(0), interest: toMoney(0), principal: toMoney(0) };

      for (const bucket of buckets) {
        if (!isPositive(remaining) || !isPositive(bucket.due)) continue;
        const applied = min(remaining, bucket.due);
        taken[bucket.key] = applied;
        remaining = subtract(remaining, applied);
      }

      const appliedTotal = add(taken.penalty, taken.fees, taken.interest, taken.principal);
      if (!isPositive(appliedTotal)) continue;

      penaltyPaid = add(penaltyPaid, taken.penalty);
      feesPaid = add(feesPaid, taken.fees);
      interestPaid = add(interestPaid, taken.interest);
      principalPaid = add(principalPaid, taken.principal);

      const newTotalPaid = add(instalment.totalPaid, appliedTotal);
      const fullySettled = lte(subtract(instalment.totalDue, newTotalPaid), 0);
      if (fullySettled) instalmentsSettled++;

      await tx.loanInstallment.update({
        where: { id: instalment.id },
        data: {
          penaltyPaid: toMoneyString(add(instalment.penaltyPaid, taken.penalty)),
          feesPaid: toMoneyString(add(instalment.feesPaid, taken.fees)),
          interestPaid: toMoneyString(add(instalment.interestPaid, taken.interest)),
          principalPaid: toMoneyString(add(instalment.principalPaid, taken.principal)),
          totalPaid: toMoneyString(newTotalPaid),
          status: fullySettled ? "PAID" : "PARTIALLY_PAID",
          paidAt: fullySettled ? new Date() : null,
        },
      });

      allocations.push({
        installmentId: instalment.id,
        principal: toMoneyString(taken.principal),
        interest: toMoneyString(taken.interest),
        fees: toMoneyString(taken.fees),
        penalty: toMoneyString(taken.penalty),
        total: toMoneyString(appliedTotal),
      });
    }

    const newOutstanding = subtract(totalOwed, amount);
    const completed = lte(newOutstanding, 0);

    const lastSequence = await tx.loanTransaction.count({ where: { loanId: loan.id } });

    const loanTransaction = await tx.loanTransaction.create({
      data: {
        associationId: loan.associationId,
        loanId: loan.id,
        sequence: lastSequence + 1,
        reference: buildTransactionReference("LRP"),
        type: "REPAYMENT",
        amount: toMoneyString(amount),
        principalPortion: toMoneyString(principalPaid),
        interestPortion: toMoneyString(interestPaid),
        feesPortion: toMoneyString(feesPaid),
        penaltyPortion: toMoneyString(penaltyPaid),
        balanceAfter: toMoneyString(newOutstanding),
        channel: params.channel ?? "INTERNAL_TRANSFER",
        description: params.description ?? `Repayment on loan ${loan.reference}`,
        externalReference: params.externalReference ?? null,
        postedById: params.actorId ?? null,
        allocations: {
          create: allocations.map((a) => ({
            installmentId: a.installmentId,
            principalAmount: a.principal,
            interestAmount: a.interest,
            feesAmount: a.fees,
            penaltyAmount: a.penalty,
            totalAmount: a.total,
          })),
        },
      },
      select: { id: true, reference: true },
    });

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        principalOutstanding: toMoneyString(subtract(loan.principalOutstanding, principalPaid)),
        interestOutstanding: toMoneyString(subtract(loan.interestOutstanding, interestPaid)),
        feesOutstanding: toMoneyString(subtract(loan.feesOutstanding, feesPaid)),
        penaltyOutstanding: toMoneyString(subtract(loan.penaltyOutstanding, penaltyPaid)),
        principalPaid: toMoneyString(add(loan.principalPaid, principalPaid)),
        interestPaid: toMoneyString(add(loan.interestPaid, interestPaid)),
        feesPaid: toMoneyString(add(loan.feesPaid, feesPaid)),
        penaltyPaid: toMoneyString(add(loan.penaltyPaid, penaltyPaid)),
        totalPaid: toMoneyString(add(loan.totalPaid, amount)),
        lastRepaymentAt: new Date(),
        ...(completed
          ? { status: "COMPLETED" as const, completedAt: new Date(), daysOverdue: 0, overdueAmount: "0" }
          : {}),
      },
    });

    // When repaying from savings, the member's balance must move too — and in
    // the same transaction, so the loan can never be reduced without the
    // corresponding debit.
    if (params.fromSavings) {
      const savingsAccountId = loan.member.savingsAccounts[0]?.id;
      if (!savingsAccountId) {
        throw new LoanError("This member has no active savings account", "NOT_FOUND");
      }

      await postSavingsTransaction(
        {
          savingsAccountId,
          type: "LOAN_REPAYMENT",
          direction: "DEBIT",
          amount: toMoneyString(amount),
          channel: params.channel ?? "INTERNAL_TRANSFER",
          description: `Repayment on loan ${loan.reference}`,
          loanId: loan.id,
          loanTransactionId: loanTransaction.id,
          postedById: params.actorId ?? null,
        },
        tx
      );
    }

    // The borrower's own half of the interest, credited back to their savings.
    //
    // AFTER the repayment debit above, deliberately: when a member repays from
    // savings, their statement should read as the money leaving and their
    // share returning, in that order. Reversing it would briefly credit
    // interest against a debt not yet paid, which reads as an error to anyone
    // reconciling the account by eye.
    const interestShared = isPositive(interestPaid)
      ? await distributeInterest(tx, {
          policy: await getPolicyWithin(tx, loan.associationId),
          associationId: loan.associationId,
          loanId: loan.id,
          memberId: loan.member.id,
          loanTransactionId: loanTransaction.id,
          savingsAccountId: loan.member.savingsAccounts[0]?.id ?? null,
          interestCollected: toMoneyString(interestPaid),
          loanReference: loan.reference,
          currency: loan.currency,
          actorId: params.actorId ?? null,
        })
      : null;

    await recordAudit(
      {
        action: AUDIT_ACTIONS.LOAN_REPAYMENT_POSTED,
        entityType: "Loan",
        entityId: loan.id,
        associationId: loan.associationId,
        newValue: {
          reference: loanTransaction.reference,
          amount: toMoneyString(amount),
          principal: toMoneyString(principalPaid),
          interest: toMoneyString(interestPaid),
          fees: toMoneyString(feesPaid),
          penalty: toMoneyString(penaltyPaid),
          outstandingAfter: toMoneyString(newOutstanding),
          completed,
        },
      },
      params.actorId ? { id: params.actorId } : null,
      tx
    );

    return {
      reference: loanTransaction.reference,
      allocated: {
        penalty: toMoneyString(penaltyPaid),
        fees: toMoneyString(feesPaid),
        interest: toMoneyString(interestPaid),
        principal: toMoneyString(principalPaid),
      },
      totalOutstanding: toMoneyString(newOutstanding),
      loanCompleted: completed,
      instalmentsSettled,
      interestShared,
      borrowerUserId: loan.member.userId,
    };
  });

  // Told after the money has moved, never before. `notify` swallows its own
  // failures, so a messaging outage cannot roll back a posted repayment.
  if (result.interestShared && gt(result.interestShared.memberShare, 0)) {
    await notify({
      userId: result.borrowerUserId,
      event: NOTIFICATION_EVENTS.INTEREST_SHARE_CREDITED,
      context: {
        amount: result.interestShared.memberShare,
        balance: result.interestShared.balanceAfter ?? undefined,
        reference: result.reference,
      },
      entityType: "Loan",
      entityId: params.loanId,
    });
  }

  // The borrower's user id is carried out of the transaction only so the
  // notification above can be sent after it commits. It is not part of the
  // repayment result every caller sees.
  const { borrowerUserId, ...repayment } = result;
  void borrowerUserId;
  return repayment;
}

/**
 * Marks overdue instalments and updates loan arrears figures.
 * Run nightly by the worker.
 */
export async function refreshOverdueStatus(associationId?: string): Promise<{
  instalmentsMarked: number;
  loansMarked: number;
}> {
  const now = new Date();

  const overdue = await prisma.loanInstallment.updateMany({
    where: {
      dueDate: { lt: now },
      status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID"] },
      ...(associationId ? { loan: { associationId } } : {}),
    },
    data: { status: "OVERDUE" },
  });

  const loansWithArrears = await prisma.loan.findMany({
    where: {
      status: { in: ["ACTIVE", "DISBURSED", "OVERDUE"] },
      ...(associationId ? { associationId } : {}),
      installments: { some: { status: "OVERDUE" } },
    },
    select: {
      id: true,
      installments: {
        where: { status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true, totalDue: true, totalPaid: true },
      },
    },
  });

  for (const loan of loansWithArrears) {
    const oldest = loan.installments[0];
    const daysOverdue = Math.floor(
      (now.getTime() - oldest.dueDate.getTime()) / 86_400_000
    );

    const overdueAmount = loan.installments.reduce(
      (total, i) => add(total, subtract(i.totalDue, i.totalPaid)),
      toMoney(0)
    );

    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: "OVERDUE",
        daysOverdue,
        overdueAmount: toMoneyString(overdueAmount),
      },
    });
  }

  return {
    instalmentsMarked: overdue.count,
    loansMarked: loansWithArrears.length,
  };
}
