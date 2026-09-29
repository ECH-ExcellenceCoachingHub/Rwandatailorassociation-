import "server-only";
import { prisma, Prisma } from "@/lib/db/prisma";
import { add, subtract, toMoneyString } from "@/lib/money";
import { renderNotification, type TemplateContext } from "@/lib/notifications/templates";
import type { NotificationEvent } from "@/lib/notifications/types";
import type {
  LoanStatus,
  NotificationStatus,
  PaymentStatus,
  TransactionType,
  UserRole,
  UserStatus,
} from "@/lib/generated/prisma/enums";

/**
 * Association-scoped read queries shared by the admin and super-admin screens.
 *
 * SCOPE CONVENTION, used by every function here: `associationId` of `null`
 * means "no tenant filter — platform wide", and only ever reaches these
 * functions from `resolveAssociationScope` for a SUPER_ADMIN. An association
 * admin always arrives with their own id, so the same query powers
 * /admin/payments and /super-admin/payments without either page being able to
 * widen its own scope.
 *
 * Amounts leave here as decimal strings, never numbers — see lib/money.ts.
 */

function scopeOf(associationId: string | null) {
  return associationId ? { associationId } : {};
}

function paginate(page?: number, pageSize?: number, max = 100) {
  const size = Math.min(max, Math.max(1, pageSize ?? 25));
  return { page: Math.max(1, page ?? 1), pageSize: size };
}

function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

const OPEN_LOAN_STATUSES = ["ACTIVE", "DISBURSED", "OVERDUE"] as const;

// ---------------------------------------------------------------------------
// Savings accounts
// ---------------------------------------------------------------------------

export async function listSavingsAccounts(
  associationId: string | null,
  filters: { search?: string; page?: number; pageSize?: number } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);

  const where: Prisma.SavingsAccountWhereInput = {
    ...scopeOf(associationId),
    ...(filters.search
      ? {
          OR: [
            { accountNumber: { contains: filters.search, mode: "insensitive" } },
            { member: { memberNumber: { contains: filters.search, mode: "insensitive" } } },
            {
              member: {
                paymentReference: { contains: filters.search, mode: "insensitive" },
              },
            },
            {
              member: {
                user: { firstName: { contains: filters.search, mode: "insensitive" } },
              },
            },
            {
              member: {
                user: { lastName: { contains: filters.search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.savingsAccount.count({ where }),
    prisma.savingsAccount.findMany({
      where,
      orderBy: { balance: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        accountNumber: true,
        balance: true,
        lockedBalance: true,
        totalDeposits: true,
        totalWithdrawals: true,
        currency: true,
        isActive: true,
        lastTransactionAt: true,
        lastSequence: true,
        member: {
          select: {
            id: true,
            memberNumber: true,
            paymentReference: true,
            status: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.savingsAccount.aggregate({
      where,
      _sum: { balance: true, lockedBalance: true },
    }),
  ]);

  return {
    ...pageMeta(total, page, pageSize),
    totalBalance: toMoneyString(totals._sum.balance ?? 0),
    totalLocked: toMoneyString(totals._sum.lockedBalance ?? 0),
    accounts: rows.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      balance: a.balance.toFixed(2),
      lockedBalance: a.lockedBalance.toFixed(2),
      available: toMoneyString(
        subtract(a.balance, a.lockedBalance).lessThan(0)
          ? 0
          : subtract(a.balance, a.lockedBalance)
      ),
      totalDeposits: a.totalDeposits.toFixed(2),
      totalWithdrawals: a.totalWithdrawals.toFixed(2),
      currency: a.currency,
      isActive: a.isActive,
      lastTransactionAt: a.lastTransactionAt,
      transactionCount: a.lastSequence,
      memberId: a.member.id,
      memberNumber: a.member.memberNumber,
      paymentReference: a.member.paymentReference,
      memberStatus: a.member.status,
      memberName: `${a.member.user.firstName} ${a.member.user.lastName}`.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Savings transactions
// ---------------------------------------------------------------------------

export async function listTransactions(
  associationId: string | null,
  filters: {
    type?: TransactionType;
    from?: Date;
    to?: Date;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);

  const where: Prisma.SavingsTransactionWhereInput = {
    ...scopeOf(associationId),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { reference: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
            { externalReference: { contains: filters.search, mode: "insensitive" } },
            { member: { memberNumber: { contains: filters.search, mode: "insensitive" } } },
            {
              member: {
                paymentReference: { contains: filters.search, mode: "insensitive" },
              },
            },
            {
              member: {
                user: { firstName: { contains: filters.search, mode: "insensitive" } },
              },
            },
            {
              member: {
                user: { lastName: { contains: filters.search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.savingsTransaction.count({ where }),
    prisma.savingsTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        type: true,
        direction: true,
        status: true,
        channel: true,
        amount: true,
        balanceAfter: true,
        description: true,
        externalReference: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.savingsTransaction.groupBy({
      by: ["direction"],
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    ...pageMeta(total, page, pageSize),
    totalIn: toMoneyString(
      totals.find((t) => t.direction === "CREDIT")?._sum.amount ?? 0
    ),
    totalOut: toMoneyString(
      totals.find((t) => t.direction === "DEBIT")?._sum.amount ?? 0
    ),
    transactions: rows.map((t) => ({
      id: t.id,
      reference: t.reference,
      type: t.type,
      direction: t.direction,
      status: t.status,
      channel: t.channel,
      amount: t.amount.toFixed(2),
      balanceAfter: t.balanceAfter.toFixed(2),
      description: t.description,
      externalReference: t.externalReference,
      createdAt: t.createdAt,
      memberId: t.member.id,
      memberNumber: t.member.memberNumber,
      memberName: `${t.member.user.firstName} ${t.member.user.lastName}`.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(
  associationId: string | null,
  filters: {
    status?: PaymentStatus;
    search?: string;
    suspiciousOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);

  const where: Prisma.PaymentWhereInput = {
    ...scopeOf(associationId),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.suspiciousOnly ? { isSuspicious: true } : {}),
    ...(filters.search
      ? {
          OR: [
            { externalTransactionId: { contains: filters.search, mode: "insensitive" } },
            { transactionReference: { contains: filters.search, mode: "insensitive" } },
            { payerName: { contains: filters.search, mode: "insensitive" } },
            { payerPhone: { contains: filters.search, mode: "insensitive" } },
            { narration: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows, sum, byStatus] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        externalTransactionId: true,
        transactionReference: true,
        amount: true,
        currency: true,
        status: true,
        channel: true,
        provider: true,
        payerName: true,
        payerPhone: true,
        narration: true,
        transactionDate: true,
        processedAt: true,
        verifiedAt: true,
        isSuspicious: true,
        suspicionReason: true,
        matchStrategy: true,
        matchConfidence: true,
        matchedMember: {
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
    // Status mix for the whole scope, not just the current page — the tiles
    // above the table describe the queue, and a page-local count would change
    // meaning as the reader pages through it.
    prisma.payment.groupBy({
      by: ["status"],
      where: scopeOf(associationId),
      _count: true,
    }),
  ]);

  return {
    ...pageMeta(total, page, pageSize),
    totalAmount: toMoneyString(sum._sum.amount ?? 0),
    statusCounts: Object.fromEntries(
      byStatus.map((row) => [row.status, row._count])
    ) as Partial<Record<PaymentStatus, number>>,
    payments: rows.map((p) => ({
      id: p.id,
      externalTransactionId: p.externalTransactionId,
      transactionReference: p.transactionReference,
      amount: p.amount.toFixed(2),
      currency: p.currency,
      status: p.status,
      channel: p.channel,
      provider: p.provider,
      payerName: p.payerName,
      payerPhone: p.payerPhone,
      narration: p.narration,
      transactionDate: p.transactionDate,
      processedAt: p.processedAt,
      verified: Boolean(p.verifiedAt),
      isSuspicious: p.isSuspicious,
      suspicionReason: p.suspicionReason,
      matchStrategy: p.matchStrategy,
      matchConfidence: p.matchConfidence,
      memberId: p.matchedMember?.id ?? null,
      memberNumber: p.matchedMember?.memberNumber ?? null,
      memberName: p.matchedMember
        ? `${p.matchedMember.user.firstName} ${p.matchedMember.user.lastName}`.trim()
        : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Loan portfolio
// ---------------------------------------------------------------------------

export async function listLoans(
  associationId: string | null,
  filters: {
    status?: LoanStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);

  const where: Prisma.LoanWhereInput = {
    ...scopeOf(associationId),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { reference: { contains: filters.search, mode: "insensitive" } },
            { member: { memberNumber: { contains: filters.search, mode: "insensitive" } } },
            {
              member: {
                user: { firstName: { contains: filters.search, mode: "insensitive" } },
              },
            },
            {
              member: {
                user: { lastName: { contains: filters.search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows, portfolio, overdue, disbursedTotal, statusMix] =
    await Promise.all([
      prisma.loan.count({ where }),
      prisma.loan.findMany({
        where,
        orderBy: [{ status: "asc" }, { disbursedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          principal: true,
          interestRate: true,
          termMonths: true,
          currency: true,
          totalPayable: true,
          totalPaid: true,
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
          daysOverdue: true,
          overdueAmount: true,
          disbursedAt: true,
          maturityDate: true,
          loanProduct: { select: { name: true } },
          member: {
            select: {
              id: true,
              memberNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),

      prisma.loan.aggregate({
        where: { ...scopeOf(associationId), status: { in: [...OPEN_LOAN_STATUSES] } },
        _count: true,
        _sum: {
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
        },
      }),

      prisma.loan.aggregate({
        where: { ...scopeOf(associationId), status: "OVERDUE" },
        _count: true,
        _sum: { overdueAmount: true },
      }),

      prisma.loan.aggregate({
        where: { ...scopeOf(associationId), disbursedAt: { not: null } },
        _sum: { principal: true },
      }),

      prisma.loan.groupBy({
        by: ["status"],
        where: scopeOf(associationId),
        _count: true,
      }),
    ]);

  return {
    ...pageMeta(total, page, pageSize),
    portfolio: {
      openCount: portfolio._count,
      outstanding: toMoneyString(
        add(
          portfolio._sum.principalOutstanding ?? 0,
          portfolio._sum.interestOutstanding ?? 0,
          portfolio._sum.feesOutstanding ?? 0,
          portfolio._sum.penaltyOutstanding ?? 0
        )
      ),
      overdueCount: overdue._count,
      overdueAmount: toMoneyString(overdue._sum.overdueAmount ?? 0),
      totalDisbursed: toMoneyString(disbursedTotal._sum.principal ?? 0),
    },
    statusCounts: Object.fromEntries(
      statusMix.map((row) => [row.status, row._count])
    ) as Partial<Record<LoanStatus, number>>,
    loans: rows.map((loan) => ({
      id: loan.id,
      reference: loan.reference,
      status: loan.status,
      productName: loan.loanProduct.name,
      principal: loan.principal.toFixed(2),
      interestRate: loan.interestRate.toFixed(2),
      termMonths: loan.termMonths,
      currency: loan.currency,
      totalPayable: loan.totalPayable.toFixed(2),
      totalPaid: loan.totalPaid.toFixed(2),
      outstanding: toMoneyString(
        add(
          loan.principalOutstanding,
          loan.interestOutstanding,
          loan.feesOutstanding,
          loan.penaltyOutstanding
        )
      ),
      daysOverdue: loan.daysOverdue,
      overdueAmount: loan.overdueAmount.toFixed(2),
      disbursedAt: loan.disbursedAt,
      maturityDate: loan.maturityDate,
      progressPercent: loan.totalPayable.greaterThan(0)
        ? Math.min(
            100,
            Math.round(loan.totalPaid.dividedBy(loan.totalPayable).times(100).toNumber())
          )
        : 0,
      memberId: loan.member.id,
      memberNumber: loan.member.memberNumber,
      memberName: `${loan.member.user.firstName} ${loan.member.user.lastName}`.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Loan products
// ---------------------------------------------------------------------------

export async function listLoanProducts(associationId: string | null) {
  const products = await prisma.loanProduct.findMany({
    where: scopeOf(associationId),
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      association: { select: { name: true, code: true } },
      _count: { select: { loans: true, applications: true } },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    isActive: p.isActive,
    associationName: p.association.name,
    interestRate: p.interestRate.toFixed(2),
    interestMethod: p.interestMethod,
    interestPeriod: p.interestPeriod,
    minAmount: p.minAmount.toFixed(2),
    maxAmount: p.maxAmount.toFixed(2),
    absoluteMaxAmount: p.absoluteMaxAmount?.toFixed(2) ?? null,
    minimumSavings: p.minimumSavings.toFixed(2),
    savingsMultiplier: p.savingsMultiplier.toFixed(2),
    minimumMembershipMonths: p.minimumMembershipMonths,
    minTermMonths: p.minTermMonths,
    maxTermMonths: p.maxTermMonths,
    allowedFrequencies: p.allowedFrequencies,
    defaultFrequency: p.defaultFrequency,
    processingFeeType: p.processingFeeType,
    processingFeeValue: p.processingFeeValue.toFixed(2),
    insuranceFeeType: p.insuranceFeeType,
    insuranceFeeValue: p.insuranceFeeValue.toFixed(2),
    penaltyType: p.penaltyType,
    penaltyValue: p.penaltyValue.toFixed(2),
    penaltyGraceDays: p.penaltyGraceDays,
    requiresGuarantors: p.requiresGuarantors,
    minimumGuarantors: p.minimumGuarantors,
    requiresCollateral: p.requiresCollateral,
    singleActiveLoan: p.singleActiveLoan,
    loanCount: p._count.loans,
    applicationCount: p._count.applications,
  }));
}

// ---------------------------------------------------------------------------
// Administrator accounts
// ---------------------------------------------------------------------------

export async function listAdminUsers(
  associationId: string | null,
  filters: {
    search?: string;
    role?: UserRole;
    status?: UserStatus;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);

  const where: Prisma.UserWhereInput = {
    role: filters.role ? filters.role : { in: ["ADMIN", "SUPER_ADMIN"] },
    // A super admin is not attached to any one tenant, so a platform-scoped
    // caller must not filter them out by associationId.
    ...(associationId ? { associationId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: "insensitive" } },
            { lastName: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "desc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        twoFactorEnabled: true,
        mustChangePassword: true,
        lockedUntil: true,
        createdAt: true,
        association: { select: { id: true, name: true, code: true } },
        _count: { select: { permissions: true } },
      },
    }),
  ]);

  return {
    ...pageMeta(total, page, pageSize),
    admins: rows.map((u) => ({
      id: u.id,
      fullName: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      twoFactorEnabled: u.twoFactorEnabled,
      mustChangePassword: u.mustChangePassword,
      locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      createdAt: u.createdAt,
      associationName: u.association?.name ?? null,
      associationCode: u.association?.code ?? null,
      overrideCount: u._count.permissions,
    })),
  };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * The permission catalogue as stored, with the role grants and any per-user
 * overrides that are actually in force.
 *
 * Read from the database rather than from lib/auth/permissions.ts: the
 * catalogue in code is the intended state, and this screen exists to show
 * what is really being enforced. A drift between the two is exactly the thing
 * a super admin needs to be able to see.
 */
export async function getPermissionMatrix() {
  const [permissions, rolePermissions, overrides] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
    prisma.rolePermission.findMany({ select: { role: true, permissionId: true } }),
    prisma.userPermission.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        granted: true,
        expiresAt: true,
        createdAt: true,
        permission: { select: { code: true, name: true, category: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            association: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const rolesByPermission = new Map<string, UserRole[]>();
  for (const row of rolePermissions) {
    const list = rolesByPermission.get(row.permissionId) ?? [];
    list.push(row.role);
    rolesByPermission.set(row.permissionId, list);
  }

  const now = new Date();

  return {
    permissions: permissions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.category,
      roles: rolesByPermission.get(p.id) ?? [],
    })),
    overrides: overrides.map((o) => ({
      id: o.id,
      granted: o.granted,
      expiresAt: o.expiresAt,
      expired: Boolean(o.expiresAt && o.expiresAt < now),
      createdAt: o.createdAt,
      code: o.permission.code,
      permissionName: o.permission.name,
      category: o.permission.category,
      userId: o.user.id,
      userName: `${o.user.firstName} ${o.user.lastName}`.trim(),
      userRole: o.user.role,
      associationName: o.user.association?.name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

export async function listJobRuns(
  filters: { jobName?: string; page?: number; pageSize?: number } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize, 200);

  const where: Prisma.JobRunWhereInput = filters.jobName
    ? { jobName: filters.jobName }
    : {};

  const [total, runs, names, since24h] = await Promise.all([
    prisma.jobRun.count({ where }),
    prisma.jobRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jobRun.groupBy({ by: ["jobName"], _count: true }),
    prisma.jobRun.groupBy({
      by: ["status"],
      where: { startedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      _count: true,
    }),
  ]);

  // Latest run per job name, which is what "is this job healthy right now"
  // actually depends on — an old success does not offset a recent failure.
  const latest = await prisma.jobRun.findMany({
    where: { jobName: { in: names.map((n) => n.jobName) } },
    orderBy: { startedAt: "desc" },
    distinct: ["jobName"],
  });

  return {
    ...pageMeta(total, page, pageSize),
    jobNames: names.map((n) => ({ jobName: n.jobName, runs: n._count })).sort((a, b) => a.jobName.localeCompare(b.jobName)),
    last24h: Object.fromEntries(since24h.map((row) => [row.status, row._count])) as Record<
      string,
      number
    >,
    latestByJob: latest.map((job) => ({
      id: job.id,
      jobName: job.jobName,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      itemsProcessed: job.itemsProcessed,
      itemsSucceeded: job.itemsSucceeded,
      itemsFailed: job.itemsFailed,
      errorMessage: job.errorMessage,
    })),
    runs: runs.map((job) => ({
      id: job.id,
      jobName: job.jobName,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      itemsProcessed: job.itemsProcessed,
      itemsSucceeded: job.itemsSucceeded,
      itemsFailed: job.itemsFailed,
      cursor: job.cursor,
      errorMessage: job.errorMessage,
    })),
  };
}

// ---------------------------------------------------------------------------
// Notifications sent by the association
// ---------------------------------------------------------------------------

export async function listSentNotifications(
  associationId: string | null,
  filters: {
    eventType?: string;
    /// Name, member number, email or phone of the recipient.
    search?: string;
    /// One member's history, as linked from their profile.
    memberId?: string;
    /// A delivery outcome, e.g. FAILED, to find the members not reached.
    deliveryStatus?: NotificationStatus;
    read?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { page, pageSize } = paginate(filters.page, filters.pageSize);
  const search = filters.search?.trim();

  const where: Prisma.NotificationWhereInput = {
    ...scopeOf(associationId),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.memberId ? { user: { member: { id: filters.memberId } } } : {}),
    ...(filters.deliveryStatus
      ? { deliveries: { some: { status: filters.deliveryStatus } } }
      : {}),
    ...(filters.read === undefined
      ? {}
      : { readAt: filters.read ? { not: null } : null }),
    ...(search
      ? {
          AND: [
            {
              user: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search } },
                  {
                    member: {
                      memberNumber: { contains: search, mode: "insensitive" },
                    },
                  },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows, eventTypes, unread, deliveries] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        title: true,
        body: true,
        severity: true,
        readAt: true,
        createdAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            member: { select: { memberNumber: true } },
          },
        },
        deliveries: {
          select: { channel: true, status: true, errorMessage: true, sentAt: true },
        },
      },
    }),
    prisma.notification.groupBy({ by: ["eventType"], where: scopeOf(associationId), _count: true }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
    // Counted over the same filter as the list, so a page filtered to one
    // member shows that member's deliveries rather than everyone's.
    prisma.notificationDelivery.groupBy({
      by: ["status"],
      where: { notification: where },
      _count: true,
    }),
  ]);

  return {
    ...pageMeta(total, page, pageSize),
    unread,
    eventTypes: eventTypes
      .map((e) => ({ eventType: e.eventType, count: e._count }))
      .sort((a, b) => b.count - a.count),
    deliveryStatus: Object.fromEntries(
      deliveries.map((d) => [d.status, d._count])
    ) as Record<string, number>,
    notifications: rows.map((n) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      severity: n.severity,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
      recipient: `${n.user.firstName} ${n.user.lastName}`.trim(),
      memberNumber: n.user.member?.memberNumber ?? null,
      deliveries: n.deliveries.map((d) => ({
        channel: d.channel,
        status: d.status,
        errorMessage: d.errorMessage,
        sentAt: d.sentAt,
      })),
    })),
  };
}

/**
 * One notification, with everything the member was shown on each channel.
 *
 * Deliveries sent before the content was stored have none on the row; those
 * are re-rendered from the template and the context saved with the
 * notification, and flagged `reconstructed` so the page can say the wording
 * is today's template rather than a copy of what went out.
 */
export async function getSentNotification(associationId: string | null, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, ...scopeOf(associationId) },
    include: {
      deliveries: { orderBy: { createdAt: "asc" } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          association: { select: { name: true } },
          member: { select: { id: true, memberNumber: true, paymentReference: true } },
        },
      },
    },
  });

  if (!notification) return null;

  const rendered = (() => {
    try {
      return renderNotification(notification.eventType as NotificationEvent, {
        firstName: notification.user.firstName,
        associationName: notification.user.association?.name ?? "RTA",
        paymentReference: notification.user.member?.paymentReference,
        ...((notification.metadata as TemplateContext | null) ?? {}),
      });
    } catch {
      return null;
    }
  })();

  return {
    id: notification.id,
    eventType: notification.eventType,
    title: notification.title,
    body: notification.body,
    severity: notification.severity,
    actionUrl: notification.actionUrl,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    recipient: `${notification.user.firstName} ${notification.user.lastName}`.trim(),
    email: notification.user.email,
    phone: notification.user.phone,
    memberId: notification.user.member?.id ?? null,
    memberNumber: notification.user.member?.memberNumber ?? null,
    deliveries: notification.deliveries.map((d) => {
      const stored = d.content !== null;
      return {
        id: d.id,
        channel: d.channel,
        status: d.status,
        provider: d.provider,
        destination: d.destination,
        providerMessageId: d.providerMessageId,
        errorMessage: d.errorMessage,
        attempts: d.attempts,
        createdAt: d.createdAt,
        sentAt: d.sentAt,
        deliveredAt: d.deliveredAt,
        nextRetryAt: d.nextRetryAt,
        subject:
          d.channel === "EMAIL"
            ? stored
              ? d.subject
              : (rendered?.emailSubject ?? null)
            : null,
        content: stored
          ? d.content
          : d.channel === "EMAIL"
            ? (rendered?.emailText ?? null)
            : (rendered?.sms ?? null),
        reconstructed: !stored,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(
  scope: "PLATFORM" | "ASSOCIATION",
  associationId: string | null
) {
  const settings = await prisma.systemSetting.findMany({
    where:
      scope === "PLATFORM"
        ? { scope: "PLATFORM" }
        : { scope: "ASSOCIATION", ...(associationId ? { associationId } : {}) },
    orderBy: [{ category: "asc" }, { key: "asc" }],
    select: {
      id: true,
      key: true,
      value: true,
      valueType: true,
      category: true,
      label: true,
      description: true,
      isSecret: true,
      isEditable: true,
      updatedAt: true,
      updatedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return settings.map((s) => ({
    id: s.id,
    key: s.key,
    // A secret's value never leaves the server, not even to a super admin's
    // browser. Whether it is configured is the only thing the screen needs.
    value: s.isSecret ? null : s.value,
    configured: s.isSecret ? s.value.length > 0 : true,
    valueType: s.valueType,
    category: s.category,
    label: s.label,
    description: s.description,
    isSecret: s.isSecret,
    isEditable: s.isEditable,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy
      ? `${s.updatedBy.firstName} ${s.updatedBy.lastName}`.trim()
      : null,
  }));
}

/** Association profile, savings rules and counts, for the settings screen. */
export async function getAssociationSettings(associationId: string) {
  const [association, savingsRule] = await Promise.all([
    prisma.association.findUnique({
      where: { id: associationId },
      include: {
        _count: {
          select: { members: true, loanProducts: true, users: true },
        },
      },
    }),
    prisma.savingsRule.findUnique({ where: { associationId } }),
  ]);

  if (!association) return null;

  return {
    association,
    savingsRule: savingsRule
      ? {
          minimumDeposit: savingsRule.minimumDeposit.toFixed(2),
          maximumDeposit: savingsRule.maximumDeposit?.toFixed(2) ?? null,
          minimumBalance: savingsRule.minimumBalance.toFixed(2),
          allowWithdrawals: savingsRule.allowWithdrawals,
          withdrawalRequiresApproval: savingsRule.withdrawalRequiresApproval,
          minimumWithdrawal: savingsRule.minimumWithdrawal.toFixed(2),
          maximumWithdrawal: savingsRule.maximumWithdrawal?.toFixed(2) ?? null,
          withdrawalFeeType: savingsRule.withdrawalFeeType,
          withdrawalFeeValue: savingsRule.withdrawalFeeValue.toFixed(2),
          withdrawalNoticeDays: savingsRule.withdrawalNoticeDays,
          monthlyContribution: savingsRule.monthlyContribution?.toFixed(2) ?? null,
          contributionDueDay: savingsRule.contributionDueDay,
          annualInterestRate: savingsRule.annualInterestRate.toFixed(2),
          interestPostingDay: savingsRule.interestPostingDay,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Integration health
// ---------------------------------------------------------------------------

/**
 * Live state of the outside world: the payment provider, the notification
 * channels, and whether anything has actually arrived recently.
 *
 * "Configured" is reported without ever reading a credential's value. A
 * screen that can display an API key is a screen that can leak one.
 */
export async function getIntegrationHealth() {
  const dayAgo = new Date(Date.now() - 24 * 3_600_000);

  const [
    byStatus,
    byIngestSource,
    lastPayment,
    lastWebhook,
    reconciliationRuns,
    deliveriesByChannel,
    failedDeliveries,
    suspicious,
    unverified,
  ] = await Promise.all([
    prisma.payment.groupBy({ by: ["status"], _count: true }),
    prisma.payment.groupBy({ by: ["ingestSource"], _count: true }),

    prisma.payment.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, transactionDate: true, provider: true },
    }),

    prisma.payment.findFirst({
      where: { ingestSource: "WEBHOOK" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),

    prisma.jobRun.findMany({
      where: { jobName: { contains: "reconcil" } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        jobName: true,
        status: true,
        startedAt: true,
        durationMs: true,
        itemsProcessed: true,
        itemsFailed: true,
        errorMessage: true,
      },
    }),

    prisma.notificationDelivery.groupBy({
      by: ["channel", "status"],
      _count: true,
    }),

    prisma.notificationDelivery.count({
      where: { status: "FAILED", createdAt: { gte: dayAgo } },
    }),

    prisma.payment.count({ where: { isSuspicious: true } }),

    // Received but never confirmed with the provider — these can never be
    // posted to the ledger, so a growing number means the verify step is down.
    prisma.payment.count({
      where: { verifiedAt: null, status: { in: ["RECEIVED", "PENDING"] } },
    }),
  ]);

  const channels = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const row of deliveriesByChannel) {
    const bucket = channels.get(row.channel) ?? { sent: 0, failed: 0, pending: 0 };
    if (row.status === "SENT" || row.status === "DELIVERED") bucket.sent += row._count;
    else if (row.status === "FAILED") bucket.failed += row._count;
    else bucket.pending += row._count;
    channels.set(row.channel, bucket);
  }

  return {
    paymentStatus: Object.fromEntries(
      byStatus.map((row) => [row.status, row._count])
    ) as Record<string, number>,
    ingestSource: Object.fromEntries(
      byIngestSource.map((row) => [row.ingestSource, row._count])
    ) as Record<string, number>,
    lastPaymentAt: lastPayment?.createdAt ?? null,
    lastPaymentProvider: lastPayment?.provider ?? null,
    lastWebhookAt: lastWebhook?.createdAt ?? null,
    reconciliationRuns,
    channels: [...channels.entries()].map(([channel, counts]) => ({
      channel,
      ...counts,
    })),
    failedDeliveries24h: failedDeliveries,
    suspiciousPayments: suspicious,
    unverifiedPayments: unverified,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportBundle {
  membersByStatus: { label: string; count: number }[];
  loansByStatus: { label: string; count: number; amount: string }[];
  paymentsByChannel: { label: string; count: number; amount: string }[];
  transactionsByType: { label: string; count: number; amount: string }[];
  topSavers: {
    memberId: string;
    memberName: string;
    memberNumber: string;
    balance: string;
  }[];
  arrears: {
    memberId: string;
    memberName: string;
    memberNumber: string;
    reference: string;
    daysOverdue: number;
    overdueAmount: string;
  }[];
  monthly: { month: string; deposits: string; withdrawals: string }[];
}

/**
 * The reporting bundle behind /admin/reports and /super-admin/reports.
 *
 * Every figure is a database aggregate. Nothing here loads a full table into
 * memory to sum it — a report that stops working once the association grows is
 * not a report.
 */
export async function getReportBundle(
  associationId: string | null
): Promise<ReportBundle> {
  const scope = scopeOf(associationId);

  const [
    membersByStatus,
    loansByStatus,
    paymentsByChannel,
    transactionsByType,
    topSavers,
    arrears,
    monthly,
  ] = await Promise.all([
    prisma.member.groupBy({ by: ["status"], where: scope, _count: true }),

    prisma.loan.groupBy({
      by: ["status"],
      where: scope,
      _count: true,
      _sum: { principal: true },
    }),

    prisma.payment.groupBy({
      by: ["channel"],
      where: scope,
      _count: true,
      _sum: { amount: true },
    }),

    prisma.savingsTransaction.groupBy({
      by: ["type"],
      where: scope,
      _count: true,
      _sum: { amount: true },
    }),

    prisma.savingsAccount.findMany({
      where: { ...scope, isActive: true },
      orderBy: { balance: "desc" },
      take: 10,
      select: {
        balance: true,
        member: {
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),

    prisma.loan.findMany({
      where: { ...scope, status: "OVERDUE" },
      orderBy: { daysOverdue: "desc" },
      take: 15,
      select: {
        reference: true,
        daysOverdue: true,
        overdueAmount: true,
        member: {
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),

    associationId
      ? prisma.$queryRaw<{ month: string; deposits: string; withdrawals: string }[]>`
          SELECT
            to_char(date_trunc('month', "createdAt"), 'YYYY-MM')             AS month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0)::text    AS deposits,
            COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0)::text AS withdrawals
          FROM savings_transactions
          WHERE "associationId" = ${associationId}
            AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY date_trunc('month', "createdAt") ASC
        `
      : prisma.$queryRaw<{ month: string; deposits: string; withdrawals: string }[]>`
          SELECT
            to_char(date_trunc('month', "createdAt"), 'YYYY-MM')             AS month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0)::text    AS deposits,
            COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0)::text AS withdrawals
          FROM savings_transactions
          WHERE "createdAt" >= date_trunc('month', now()) - interval '11 months'
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY date_trunc('month', "createdAt") ASC
        `,
  ]);

  return {
    membersByStatus: membersByStatus.map((r) => ({
      label: r.status,
      count: r._count,
    })),
    loansByStatus: loansByStatus.map((r) => ({
      label: r.status,
      count: r._count,
      amount: toMoneyString(r._sum.principal ?? 0),
    })),
    paymentsByChannel: paymentsByChannel.map((r) => ({
      label: r.channel,
      count: r._count,
      amount: toMoneyString(r._sum.amount ?? 0),
    })),
    transactionsByType: transactionsByType.map((r) => ({
      label: r.type,
      count: r._count,
      amount: toMoneyString(r._sum.amount ?? 0),
    })),
    topSavers: topSavers.map((a) => ({
      memberId: a.member.id,
      memberNumber: a.member.memberNumber,
      memberName: `${a.member.user.firstName} ${a.member.user.lastName}`.trim(),
      balance: a.balance.toFixed(2),
    })),
    arrears: arrears.map((l) => ({
      memberId: l.member.id,
      memberNumber: l.member.memberNumber,
      memberName: `${l.member.user.firstName} ${l.member.user.lastName}`.trim(),
      reference: l.reference,
      daysOverdue: l.daysOverdue,
      overdueAmount: l.overdueAmount.toFixed(2),
    })),
    monthly: monthly.map((m) => ({
      month: m.month,
      deposits: toMoneyString(m.deposits),
      withdrawals: toMoneyString(m.withdrawals),
    })),
  };
}
