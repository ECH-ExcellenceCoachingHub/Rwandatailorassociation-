import "server-only";
import { Prisma, prisma, withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { loanLogger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, isPositive, toMoney, toMoneyString } from "@/lib/money";
import { normalisePhone } from "@/lib/phone";
import { availableBalance } from "@/lib/services/ledger";
import { MAX_GUARANTORS } from "@/lib/rules/borrowing";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import type {
  GuarantorStatus,
  LoanApplicationStatus,
  LoanStatus,
} from "@/lib/generated/prisma/enums";

/**
 * GUARANTORS: OTHER MEMBERS STANDING BEHIND THE PART OF A LOAN ABOVE A
 * BORROWER'S OWN SHARE.
 *
 * A member may borrow their own share (80% of their available savings, by
 * default) on their savings alone. Anything above that is other members' money,
 * so other members back it. The borrower names one or more guarantors and says
 * how much each covers; together the pledges must reach the part above the own
 * share.
 *
 *   named → accepted (savings held) → released when the loan is repaid
 *         ↘ declined (nothing held)
 *
 * WHAT ACCEPTING DOES. The pledged amount is added to the guarantor's
 * `lockedBalance`, the same hold a pending withdrawal places. It stays in their
 * balance and on their statement, but it leaves their AVAILABLE balance: they
 * cannot withdraw it, and it no longer counts toward what they may borrow
 * themselves. The borrower repays the loan, not the guarantor. When it is
 * repaid in full the hold is lifted and the money is theirs to use again.
 *
 * WHY THE HOLD IS TAKEN AT ACCEPTANCE, NOT AT APPROVAL. A guarantor who accepts
 * is saying "that money is there for this loan". Holding it from that moment
 * means a committee approving the loan is relying on money that cannot be
 * withdrawn behind its back between the two events.
 *
 * WHY A BORROWER NEVER SEES A GUARANTOR'S BALANCE. The capacity check happens
 * when the guarantor accepts, on the guarantor's own screen. Checking it when
 * the borrower submits would let anyone learn another member's balance by
 * submitting applications with different amounts and reading the refusals.
 */

export class GuaranteeError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "INSUFFICIENT_FUNDS" | "REASON_REQUIRED"
  ) {
    super(message);
    this.name = "GuaranteeError";
  }
}

/// Application states in which a guarantor may still answer. Once a decision
/// is made the request is closed, whichever way it went.
const OPEN_APPLICATION_STATUSES: LoanApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
];

/// Loan states during which accepted pledges stay held. DEFAULTED is included
/// on purpose: a loan that stopped being repaid is exactly the loan the pledge
/// was for, and the committee — not this code — decides what happens next.
const HELD_LOAN_STATUSES: LoanStatus[] = [
  "PENDING_DISBURSEMENT",
  "DISBURSED",
  "ACTIVE",
  "OVERDUE",
  "DEFAULTED",
];

// ---------------------------------------------------------------------------
// Finding a guarantor
// ---------------------------------------------------------------------------

export interface GuarantorCandidate {
  memberId: string;
  fullName: string;
  memberNumber: string;
}

/**
 * Finds the member a borrower means, by member number or phone number.
 *
 * EXACT MATCHES ONLY, and name and number only. A borrower needs to confirm
 * they have the right person; they do not need a directory of the association,
 * and they never get anybody's balance.
 */
export async function findGuarantorCandidate(params: {
  associationId: string;
  borrowerMemberId: string;
  query: string;
}): Promise<GuarantorCandidate | null> {
  const query = params.query.trim();
  if (query.length < 3) return null;

  const phone = normalisePhone(query);

  const member = await prisma.member.findFirst({
    where: {
      associationId: params.associationId,
      status: "ACTIVE",
      id: { not: params.borrowerMemberId },
      OR: [
        { memberNumber: { equals: query, mode: "insensitive" } },
        ...(phone ? [{ user: { phone } }] : []),
      ],
    },
    select: {
      id: true,
      memberNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  if (!member) return null;

  return {
    memberId: member.id,
    fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
    memberNumber: member.memberNumber,
  };
}

// ---------------------------------------------------------------------------
// Naming guarantors on an application
// ---------------------------------------------------------------------------

export interface NamedGuarantor {
  memberId: string;
  amount: string;
}

export interface ResolvedGuarantor {
  guarantorMemberId: string;
  userId: string;
  fullName: string;
  phone: string | null;
  guaranteedAmount: string;
}

/**
 * Checks the guarantors a borrower named and turns them into rows to store.
 *
 * Every guarantor must be an active member of the same association, other than
 * the borrower, named once. Whether they have saved enough is NOT checked here
 * — see the note at the top of this file.
 */
export async function resolveGuarantors(params: {
  associationId: string;
  borrowerMemberId: string;
  guarantors: NamedGuarantor[];
}): Promise<
  | { ok: true; guarantors: ResolvedGuarantor[]; total: string }
  | { ok: false; failures: { rule: string; message: string }[] }
> {
  const failures: { rule: string; message: string }[] = [];

  if (params.guarantors.length > MAX_GUARANTORS) {
    failures.push({
      rule: "GUARANTORS",
      message: `You can name at most ${MAX_GUARANTORS} guarantors.`,
    });
  }

  const ids = params.guarantors.map((g) => g.memberId);

  if (new Set(ids).size !== ids.length) {
    failures.push({
      rule: "GUARANTORS",
      message: "The same guarantor is named twice. Name each person once, with the whole amount they cover.",
    });
  }

  if (ids.includes(params.borrowerMemberId)) {
    failures.push({
      rule: "GUARANTORS",
      message: "You cannot be your own guarantor.",
    });
  }

  for (const guarantor of params.guarantors) {
    if (!isPositive(toMoney(guarantor.amount))) {
      failures.push({
        rule: "GUARANTORS",
        message: "Every guarantor must cover an amount greater than zero.",
      });
      break;
    }
  }

  if (failures.length > 0) return { ok: false, failures };

  const members = await prisma.member.findMany({
    where: {
      id: { in: ids },
      associationId: params.associationId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });

  const byId = new Map(members.map((m) => [m.id, m]));

  if (members.length !== ids.length) {
    return {
      ok: false,
      failures: [
        {
          rule: "GUARANTORS",
          message: "Every guarantor must be an active, registered member of the association.",
        },
      ],
    };
  }

  const guarantors = params.guarantors.map((g) => {
    const member = byId.get(g.memberId)!;
    return {
      guarantorMemberId: member.id,
      userId: member.user.id,
      fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
      phone: member.user.phone,
      guaranteedAmount: toMoneyString(g.amount),
    };
  });

  return {
    ok: true,
    guarantors,
    total: toMoneyString(add(0, ...guarantors.map((g) => g.guaranteedAmount))),
  };
}

// ---------------------------------------------------------------------------
// The guarantor answers
// ---------------------------------------------------------------------------

/**
 * A guarantor accepts or declines, from their own account.
 *
 * Accepting holds the pledged amount out of their available balance in the
 * same transaction that records the answer, so there is never an accepted
 * guarantee with nothing held behind it.
 */
export async function respondToGuarantee(params: {
  guaranteeId: string;
  /// The member answering. Must be the guarantor named on the row.
  memberId: string;
  accept: boolean;
  reason?: string | null;
  actorUserId: string;
}): Promise<{ status: GuarantorStatus }> {
  const outcome = await withFinancialTransaction(async (tx) => {
    const guarantee = await tx.guarantor.findUnique({
      where: { id: params.guaranteeId },
      select: {
        id: true,
        status: true,
        guarantorMemberId: true,
        guaranteedAmount: true,
        fullName: true,
        application: {
          select: {
            id: true,
            status: true,
            reference: true,
            associationId: true,
            member: { select: { userId: true } },
          },
        },
      },
    });

    // Somebody else's guarantee is reported as missing, not as forbidden, so
    // the endpoint does not confirm which ids exist.
    if (!guarantee || guarantee.guarantorMemberId !== params.memberId || !guarantee.application) {
      throw new GuaranteeError("This guarantee request was not found", "NOT_FOUND");
    }

    if (guarantee.status !== "PENDING") {
      throw new GuaranteeError("You have already answered this request", "INVALID_STATE");
    }

    const application = guarantee.application;

    if (!OPEN_APPLICATION_STATUSES.includes(application.status)) {
      throw new GuaranteeError(
        "This loan application has already been decided, so it no longer needs an answer",
        "INVALID_STATE"
      );
    }

    const amount = toMoney(guarantee.guaranteedAmount ?? 0);

    if (params.accept) {
      await holdSavings(tx, params.memberId, amount);
    }

    await tx.guarantor.update({
      where: { id: guarantee.id },
      data: {
        status: params.accept ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
        declineReason: params.accept ? null : params.reason?.trim() || null,
      },
    });

    await recordAudit(
      {
        action: params.accept
          ? AUDIT_ACTIONS.GUARANTEE_ACCEPTED
          : AUDIT_ACTIONS.GUARANTEE_DECLINED,
        entityType: "Guarantor",
        entityId: guarantee.id,
        associationId: application.associationId,
        oldValue: { status: guarantee.status },
        newValue: {
          status: params.accept ? "ACCEPTED" : "DECLINED",
          amountHeld: params.accept ? toMoneyString(amount) : "0.00",
          application: application.reference,
        },
        reason: params.accept ? null : params.reason?.trim() || null,
        severity: params.accept ? "NOTICE" : "INFO",
      },
      { id: params.actorUserId },
      tx
    );

    return {
      borrowerUserId: application.member.userId,
      guarantorName: guarantee.fullName,
      amount: toMoneyString(amount),
      reference: application.reference,
      applicationId: application.id,
    };
  });

  // Told after the hold is committed, never before.
  await notify({
    userId: outcome.borrowerUserId,
    event: params.accept
      ? NOTIFICATION_EVENTS.GUARANTEE_ACCEPTED
      : NOTIFICATION_EVENTS.GUARANTEE_DECLINED,
    context: {
      amount: outcome.amount,
      reference: outcome.reference,
      counterpartyName: outcome.guarantorName,
      reason: params.accept ? undefined : params.reason?.trim() || undefined,
    },
    entityType: "LoanApplication",
    entityId: outcome.applicationId,
  });

  loanLogger.info(
    { guaranteeId: params.guaranteeId, accepted: params.accept, amount: outcome.amount },
    "guarantee answered"
  );

  return { status: params.accept ? "ACCEPTED" : "DECLINED" };
}

/**
 * Moves `amount` of a member's savings from available to held.
 *
 * ONE GUARDED STATEMENT, for the reason the ledger gives for its own: the check
 * that the money is available and the hold that spends it are indivisible. Two
 * guarantees accepted at the same moment, or a guarantee and a withdrawal
 * request, cannot both see the same available balance and both succeed.
 */
async function holdSavings(tx: TxClient, memberId: string, amount: Prisma.Decimal) {
  const account = await tx.savingsAccount.findFirst({
    where: { memberId, isActive: true },
    orderBy: { openedAt: "asc" },
    select: { id: true, balance: true, lockedBalance: true },
  });

  if (!account) {
    throw new GuaranteeError(
      "You have no active savings account, so you cannot guarantee a loan",
      "INSUFFICIENT_FUNDS"
    );
  }

  const held = await tx.$queryRaw<{ id: string }[]>`
    UPDATE savings_accounts
    SET "lockedBalance" = "lockedBalance" + ${toMoneyString(amount)}::numeric,
        "updatedAt" = now()
    WHERE id = ${account.id}
      AND "isActive" = true
      AND balance - "lockedBalance" >= ${toMoneyString(amount)}::numeric
    RETURNING id
  `;

  if (held.length === 0) {
    // Re-read for the message only; the decision was the UPDATE's.
    const current = await tx.savingsAccount.findUnique({
      where: { id: account.id },
      select: { balance: true, lockedBalance: true },
    });
    const available = current
      ? availableBalance(current.balance, current.lockedBalance)
      : "0.00";

    throw new GuaranteeError(
      `You are asked to cover ${toMoneyString(amount)}, but your available balance is ${available}. You can only guarantee money you have saved and is not already held.`,
      "INSUFFICIENT_FUNDS"
    );
  }
}

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export interface ReleasedGuarantee {
  guaranteeId: string;
  guarantorUserId: string | null;
  amount: string;
  /// True when savings had actually been held and are now released. False for
  /// a request that was never answered and has simply been closed.
  wasHeld: boolean;
  borrowerName: string;
  reference: string;
}

/**
 * Ends every open guarantee on an application or loan, returning held savings
 * to the guarantors' available balance.
 *
 * Called inside the transaction that ends the thing they guaranteed — a
 * rejected or cancelled application, or a loan repaid in full — so the loan can
 * never be closed while its guarantors' money stays held, or the other way
 * round.
 *
 * Unanswered requests are closed too, but nothing was held for them and their
 * member is not told their money was released.
 */
export async function releaseGuarantees(
  tx: TxClient,
  params: {
    applicationId?: string | null;
    loanId?: string | null;
    actorId?: string | null;
    reason: string;
  }
): Promise<ReleasedGuarantee[]> {
  const scope: Prisma.GuarantorWhereInput[] = [];
  if (params.applicationId) scope.push({ applicationId: params.applicationId });
  if (params.loanId) scope.push({ loanId: params.loanId });
  if (scope.length === 0) return [];

  const open = await tx.guarantor.findMany({
    where: { OR: scope, status: { in: ["PENDING", "ACCEPTED"] } },
    select: {
      id: true,
      status: true,
      guaranteedAmount: true,
      guarantorMemberId: true,
      guarantorMember: { select: { userId: true } },
      application: {
        select: {
          reference: true,
          associationId: true,
          member: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
      loan: { select: { reference: true, associationId: true } },
    },
  });

  const released: ReleasedGuarantee[] = [];

  for (const guarantee of open) {
    const amount = toMoney(guarantee.guaranteedAmount ?? 0);
    const wasHeld = guarantee.status === "ACCEPTED" && isPositive(amount);

    if (wasHeld && guarantee.guarantorMemberId) {
      const account = await tx.savingsAccount.findFirst({
        where: { memberId: guarantee.guarantorMemberId },
        orderBy: [{ isActive: "desc" }, { openedAt: "asc" }],
        select: { id: true },
      });

      if (account) {
        // Floored at zero, as the withdrawal release is: a hold must never be
        // able to drive the held figure negative and inflate what is available.
        await tx.$executeRaw`
          UPDATE savings_accounts
          SET "lockedBalance" = GREATEST("lockedBalance" - ${toMoneyString(amount)}::numeric, 0),
              "updatedAt" = now()
          WHERE id = ${account.id}
        `;
      }
    }

    await tx.guarantor.update({
      where: { id: guarantee.id },
      data: { status: "RELEASED" },
    });

    const associationId =
      guarantee.application?.associationId ?? guarantee.loan?.associationId ?? null;
    const reference = guarantee.loan?.reference ?? guarantee.application?.reference ?? "";

    await recordAudit(
      {
        action: AUDIT_ACTIONS.GUARANTEE_RELEASED,
        entityType: "Guarantor",
        entityId: guarantee.id,
        associationId,
        oldValue: { status: guarantee.status },
        newValue: {
          status: "RELEASED",
          amountReleased: wasHeld ? toMoneyString(amount) : "0.00",
          reference,
        },
        reason: params.reason,
      },
      params.actorId ? { id: params.actorId } : null,
      tx
    );

    const borrower = guarantee.application?.member.user;

    released.push({
      guaranteeId: guarantee.id,
      guarantorUserId: guarantee.guarantorMember?.userId ?? null,
      amount: toMoneyString(amount),
      wasHeld,
      borrowerName: borrower ? `${borrower.firstName} ${borrower.lastName}`.trim() : "",
      reference,
    });
  }

  return released;
}

/** Tells each guarantor whose savings were held that they are free again. */
export async function notifyReleasedGuarantors(released: ReleasedGuarantee[]): Promise<void> {
  await Promise.all(
    released
      .filter((r) => r.wasHeld && r.guarantorUserId)
      .map((r) =>
        notify({
          userId: r.guarantorUserId!,
          event: NOTIFICATION_EVENTS.GUARANTEE_RELEASED,
          context: {
            amount: r.amount,
            reference: r.reference,
            counterpartyName: r.borrowerName,
          },
          entityType: "Guarantor",
          entityId: r.guaranteeId,
        })
      )
  );
}

/** Tells each named guarantor that they have been asked. */
export async function notifyGuarantorsRequested(params: {
  applicationId: string;
  reference: string;
  borrowerName: string;
  guarantors: { id: string; userId: string; amount: string }[];
}): Promise<void> {
  await Promise.all(
    params.guarantors.map((g) =>
      notify({
        userId: g.userId,
        event: NOTIFICATION_EVENTS.GUARANTEE_REQUESTED,
        context: {
          amount: g.amount,
          reference: params.reference,
          counterpartyName: params.borrowerName,
        },
        entityType: "Guarantor",
        entityId: g.id,
      })
    )
  );
}

// ---------------------------------------------------------------------------
// What a member sees
// ---------------------------------------------------------------------------

export interface GuaranteeRequestRow {
  id: string;
  borrowerName: string;
  borrowerMemberNumber: string;
  reference: string;
  /// The whole loan asked for, so the guarantor sees what they are part of.
  loanAmount: string;
  termMonths: number;
  purpose: string;
  /// What is asked of this guarantor.
  amount: string;
  askedAt: Date;
}

export interface GuaranteeGivenRow {
  id: string;
  borrowerName: string;
  reference: string;
  amount: string;
  status: GuarantorStatus;
  /// Where the guaranteed loan stands, once there is one.
  loanStatus: LoanStatus | null;
  /// What is still owed on it, so the guarantor can see how close release is.
  loanOutstanding: string | null;
  respondedAt: Date | null;
  /// When a released guarantee was released.
  releasedAt: Date | null;
}

export interface MyGuarantorRow {
  id: string;
  guarantorName: string;
  memberNumber: string | null;
  amount: string;
  status: GuarantorStatus;
  declineReason: string | null;
  reference: string;
}

export interface MemberGuarantees {
  /// Waiting for this member to accept or decline.
  requests: GuaranteeRequestRow[];
  /// This member's savings held for other people's loans, and recent history.
  given: GuaranteeGivenRow[];
  /// Total currently held for others. Part of `lockedBalance`.
  heldForOthers: string;
  /// The guarantors on this member's own open application or live loan.
  mine: MyGuarantorRow[];
}

/// How many finished guarantees are listed beside the live ones.
const HISTORY_SHOWN = 5;

export async function getMemberGuarantees(memberId: string): Promise<MemberGuarantees> {
  const [requests, held, history, mine] = await Promise.all([
    prisma.guarantor.findMany({
      where: {
        guarantorMemberId: memberId,
        status: "PENDING",
        application: { status: { in: OPEN_APPLICATION_STATUSES } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        guaranteedAmount: true,
        createdAt: true,
        application: {
          select: {
            reference: true,
            requestedAmount: true,
            termMonths: true,
            purpose: true,
            member: {
              select: {
                memberNumber: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    }),

    prisma.guarantor.findMany({
      where: { guarantorMemberId: memberId, status: "ACCEPTED" },
      orderBy: { respondedAt: "desc" },
      select: givenSelect,
    }),

    prisma.guarantor.findMany({
      where: { guarantorMemberId: memberId, status: { in: ["RELEASED", "DECLINED"] } },
      orderBy: { updatedAt: "desc" },
      take: HISTORY_SHOWN,
      select: givenSelect,
    }),

    prisma.guarantor.findMany({
      where: {
        application: {
          memberId,
          OR: [
            { status: { in: OPEN_APPLICATION_STATUSES } },
            { loan: { status: { in: HELD_LOAN_STATUSES } } },
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fullName: true,
        guaranteedAmount: true,
        status: true,
        declineReason: true,
        guarantorMember: { select: { memberNumber: true } },
        application: { select: { reference: true, loan: { select: { reference: true } } } },
      },
    }),
  ]);

  return {
    requests: requests
      .filter((r) => r.application)
      .map((r) => {
        const application = r.application!;
        return {
          id: r.id,
          borrowerName: `${application.member.user.firstName} ${application.member.user.lastName}`.trim(),
          borrowerMemberNumber: application.member.memberNumber,
          reference: application.reference,
          loanAmount: toMoneyString(application.requestedAmount),
          termMonths: application.termMonths,
          purpose: application.purpose,
          amount: toMoneyString(r.guaranteedAmount ?? 0),
          askedAt: r.createdAt,
        };
      }),

    given: [...held, ...history].map(toGivenRow),

    heldForOthers: toMoneyString(add(0, ...held.map((g) => g.guaranteedAmount ?? 0))),

    mine: mine.map((g) => ({
      id: g.id,
      guarantorName: g.fullName,
      memberNumber: g.guarantorMember?.memberNumber ?? null,
      amount: toMoneyString(g.guaranteedAmount ?? 0),
      status: g.status,
      declineReason: g.declineReason,
      reference: g.application?.loan?.reference ?? g.application?.reference ?? "",
    })),
  };
}

const givenSelect = {
  id: true,
  guaranteedAmount: true,
  status: true,
  respondedAt: true,
  updatedAt: true,
  application: {
    select: {
      reference: true,
      member: { select: { user: { select: { firstName: true, lastName: true } } } },
      loan: {
        select: {
          reference: true,
          status: true,
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
        },
      },
    },
  },
} satisfies Prisma.GuarantorSelect;

function toGivenRow(
  g: Prisma.GuarantorGetPayload<{ select: typeof givenSelect }>
): GuaranteeGivenRow {
  const borrower = g.application?.member.user;
  const loan = g.application?.loan ?? null;

  return {
    id: g.id,
    borrowerName: borrower ? `${borrower.firstName} ${borrower.lastName}`.trim() : "",
    reference: loan?.reference ?? g.application?.reference ?? "",
    amount: toMoneyString(g.guaranteedAmount ?? 0),
    status: g.status,
    loanStatus: loan?.status ?? null,
    loanOutstanding: loan
      ? toMoneyString(
          add(
            loan.principalOutstanding,
            loan.interestOutstanding,
            loan.feesOutstanding,
            loan.penaltyOutstanding
          )
        )
      : null,
    respondedAt: g.respondedAt,
    releasedAt: g.status === "RELEASED" ? g.updatedAt : null,
  };
}

// ---------------------------------------------------------------------------
// What the committee sees
// ---------------------------------------------------------------------------

/** Accepted pledges on an application, added up, and how many are unanswered. */
export async function guaranteeCoverage(
  client: TxClient | typeof prisma,
  applicationId: string
): Promise<{ accepted: string; pendingCount: number; declinedCount: number }> {
  const rows = await client.guarantor.findMany({
    where: { applicationId },
    select: { status: true, guaranteedAmount: true },
  });

  return {
    accepted: toMoneyString(
      add(0, ...rows.filter((r) => r.status === "ACCEPTED").map((r) => r.guaranteedAmount ?? 0))
    ),
    pendingCount: rows.filter((r) => r.status === "PENDING").length,
    declinedCount: rows.filter((r) => r.status === "DECLINED").length,
  };
}
