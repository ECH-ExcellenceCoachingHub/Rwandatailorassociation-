import "server-only";
import { prisma, Prisma } from "@/lib/db/prisma";
import { add, toMoneyString } from "@/lib/money";
import type { AssociationStatus } from "@/lib/generated/prisma/enums";
import { DEFAULT_ASSOCIATION_CODE } from "@/lib/brand";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import type { AuthContext } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { SAVINGS_RULE_DEFAULTS, STANDARD_LOAN_PRODUCT } from "@/lib/rules/association-defaults";
import { generateTemporaryPassword } from "@/lib/services/members";
import { ensureRulebook } from "@/lib/services/rulebook";
import type { CreateAssociationInput } from "@/lib/validation/associations";

/**
 * Tenant directory for the super admin.
 *
 * Every figure here is an aggregate over one association's data, and there is
 * no association scope applied — this is the one screen that deliberately
 * crosses tenant boundaries, which is why the only caller is behind
 * `requireSuperAdmin`.
 *
 * The aggregates are computed as one grouped query per metric and then joined
 * in memory by associationId, rather than a per-association dashboard call.
 * Thirty tenants would otherwise mean thirty round trips of twenty queries
 * each, and the page would get slower with every association onboarded.
 */

export interface AssociationSummary {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  status: AssociationStatus;
  currency: string;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  members: {
    total: number;
    active: number;
    pendingApproval: number;
  };
  /// Decimal strings — never numbers. See lib/money.ts.
  savingsBalance: string;
  loans: {
    activeCount: number;
    outstanding: string;
    overdueCount: number;
  };
  unmatchedPayments: number;
  admins: number;
}

export interface AssociationDirectory {
  associations: AssociationSummary[];
  /// Totals across the rows returned, i.e. after any filter is applied.
  totals: {
    associations: number;
    active: number;
    members: number;
    savingsBalance: string;
    loansOutstanding: string;
    unmatchedPayments: number;
  };
}

/** Loan statuses that still carry a balance the association is owed. */
const OPEN_LOAN_STATUSES = ["ACTIVE", "DISBURSED", "OVERDUE"] as const;

export async function listAssociations(
  options: { search?: string; status?: AssociationStatus } = {}
): Promise<AssociationDirectory> {
  const { search, status } = options;

  const where: Prisma.AssociationWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { legalName: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const associations = await prisma.association.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
      status: true,
      currency: true,
      city: true,
      country: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  });

  if (associations.length === 0) {
    return {
      associations: [],
      totals: {
        associations: 0,
        active: 0,
        members: 0,
        savingsBalance: toMoneyString(0),
        loansOutstanding: toMoneyString(0),
        unmatchedPayments: 0,
      },
    };
  }

  const ids = associations.map((a) => a.id);
  const scope = { associationId: { in: ids } };

  const [memberCounts, savings, openLoans, overdueLoans, unmatched, admins] =
    await Promise.all([
      prisma.member.groupBy({
        by: ["associationId", "status"],
        where: scope,
        _count: true,
      }),

      prisma.savingsAccount.groupBy({
        by: ["associationId"],
        where: { ...scope, isActive: true },
        _sum: { balance: true },
      }),

      prisma.loan.groupBy({
        by: ["associationId"],
        where: { ...scope, status: { in: [...OPEN_LOAN_STATUSES] } },
        _count: true,
        _sum: {
          principalOutstanding: true,
          interestOutstanding: true,
          feesOutstanding: true,
          penaltyOutstanding: true,
        },
      }),

      prisma.loan.groupBy({
        by: ["associationId"],
        where: { ...scope, status: "OVERDUE" },
        _count: true,
      }),

      prisma.payment.groupBy({
        by: ["associationId"],
        where: { ...scope, status: "UNMATCHED" },
        _count: true,
      }),

      prisma.user.groupBy({
        by: ["associationId"],
        where: { ...scope, role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
        _count: true,
      }),
    ]);

  // Member counts arrive one row per (association, status) pair.
  const membersByAssociation = new Map<
    string,
    { total: number; active: number; pendingApproval: number }
  >();

  for (const row of memberCounts) {
    const bucket = membersByAssociation.get(row.associationId) ?? {
      total: 0,
      active: 0,
      pendingApproval: 0,
    };
    bucket.total += row._count;
    if (row.status === "ACTIVE") bucket.active += row._count;
    if (row.status === "PENDING_APPROVAL") bucket.pendingApproval += row._count;
    membersByAssociation.set(row.associationId, bucket);
  }

  const savingsByAssociation = new Map(
    savings.map((row) => [row.associationId, row._sum.balance ?? 0])
  );

  const loansByAssociation = new Map(
    openLoans.map((row) => [
      row.associationId,
      {
        count: row._count,
        outstanding: add(
          row._sum.principalOutstanding ?? 0,
          row._sum.interestOutstanding ?? 0,
          row._sum.feesOutstanding ?? 0,
          row._sum.penaltyOutstanding ?? 0
        ),
      },
    ])
  );

  const overdueByAssociation = new Map(
    overdueLoans.map((row) => [row.associationId, row._count])
  );

  // Payment.associationId and User.associationId are both nullable — an
  // unattributed payment or a super admin with no tenant groups under null,
  // which simply never matches an association id below.
  const unmatchedByAssociation = new Map(
    unmatched.map((row) => [row.associationId, row._count])
  );

  const adminsByAssociation = new Map(
    admins.map((row) => [row.associationId, row._count])
  );

  const rows: AssociationSummary[] = associations.map((association) => {
    const members = membersByAssociation.get(association.id) ?? {
      total: 0,
      active: 0,
      pendingApproval: 0,
    };
    const loans = loansByAssociation.get(association.id);

    return {
      ...association,
      members,
      savingsBalance: toMoneyString(savingsByAssociation.get(association.id) ?? 0),
      loans: {
        activeCount: loans?.count ?? 0,
        outstanding: toMoneyString(loans?.outstanding ?? 0),
        overdueCount: overdueByAssociation.get(association.id) ?? 0,
      },
      unmatchedPayments: unmatchedByAssociation.get(association.id) ?? 0,
      admins: adminsByAssociation.get(association.id) ?? 0,
    };
  });

  return {
    associations: rows,
    totals: {
      associations: rows.length,
      active: rows.filter((row) => row.status === "ACTIVE").length,
      members: rows.reduce((sum, row) => sum + row.members.total, 0),
      savingsBalance: toMoneyString(
        rows.reduce((sum, row) => add(sum, row.savingsBalance), add(0))
      ),
      loansOutstanding: toMoneyString(
        rows.reduce((sum, row) => add(sum, row.loans.outstanding), add(0))
      ),
      unmatchedPayments: rows.reduce((sum, row) => sum + row.unmatchedPayments, 0),
    },
  };
}

/**
 * The association a public registration enrols into.
 *
 * Each association shares its own join link, /register?association=CODE; a
 * bare /register — every link handed out while RTA was the only tenant — means
 * DEFAULT_ASSOCIATION_CODE. Only an ACTIVE association can be joined, so a
 * pending or suspended tenant's code resolves to null and registration is
 * refused rather than quietly enrolling the applicant somewhere else.
 *
 * The code is public — it is printed in every member's payment reference — and
 * naming it grants nothing: the applicant still lands as PENDING_VERIFICATION
 * until that association's own administrator approves them.
 */
export async function findRegistrationAssociation(
  code: string | null | undefined
): Promise<{ id: string; code: string; name: string } | null> {
  const wanted = code?.trim().toUpperCase() || DEFAULT_ASSOCIATION_CODE;

  return prisma.association.findFirst({
    where: { code: wanted, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
  });
}

// Onboarding ------------------------------------------------------------------

export interface CreatedAssociation {
  associationId: string;
  code: string;
  name: string;
  admin: {
    userId: string;
    phone: string;
    email: string | null;
    /// Shown to the super admin ONCE to hand over. Only its hash is stored, and
    /// the administrator must replace it at first sign-in.
    temporaryPassword: string;
  };
}

/**
 * Creates an association ready to use, with its first administrator.
 *
 * Everything an association needs to run is created in one transaction — the
 * association, its savings rule and standard loan product (on the same terms
 * RTA was seeded with; see lib/rules/association-defaults.ts) and the admin
 * account — so a half-created tenant can never exist. The rulebook follows
 * straight after: `ensureRulebook` writes through its own client, and a miss
 * there heals itself, because `getPolicyEnsured` re-seeds any rule it finds
 * missing on first read.
 *
 * Created ACTIVE: the super admin onboarding it has already decided it should
 * exist, and an association nobody can register into or sign in to is no use
 * to anyone.
 */
export async function createAssociation(
  input: CreateAssociationInput,
  actor: AuthContext
): Promise<{ ok: true; created: CreatedAssociation } | { ok: false; field: string; message: string }> {
  // Checked first for a usable message; the unique constraints enforce it again.
  const [existingCode, existingPhone, existingEmail] = await Promise.all([
    prisma.association.findUnique({ where: { code: input.code }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone: input.adminPhone }, select: { id: true } }),
    input.adminEmail
      ? prisma.user.findUnique({ where: { email: input.adminEmail }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (existingCode) {
    return { ok: false, field: "code", message: "Another association already uses this code" };
  }
  if (existingPhone) {
    return {
      ok: false,
      field: "adminPhone",
      message: "An account with this phone number already exists",
    };
  }
  if (existingEmail) {
    return {
      ok: false,
      field: "adminEmail",
      message: "An account with this email address already exists",
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const created = await prisma.$transaction(async (tx) => {
    const association = await tx.association.create({
      data: {
        code: input.code,
        name: input.name,
        legalName: input.legalName ?? input.name,
        status: "ACTIVE",
        email: input.email ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        savingsRule: { create: SAVINGS_RULE_DEFAULTS },
        loanProducts: { create: STANDARD_LOAN_PRODUCT },
      },
      select: { id: true, code: true, name: true },
    });

    const admin = await tx.user.create({
      data: {
        associationId: association.id,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        phone: input.adminPhone,
        email: input.adminEmail ?? null,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
        createdById: actor.user.id,
      },
      select: { id: true },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.ASSOCIATION_CREATED,
        entityType: "Association",
        entityId: association.id,
        associationId: association.id,
        newValue: { code: association.code, name: association.name },
        severity: "CRITICAL",
      },
      actor,
      tx
    );
    await recordAudit(
      {
        action: AUDIT_ACTIONS.SUPER_ADMIN_CREATED_ADMIN,
        entityType: "User",
        entityId: admin.id,
        associationId: association.id,
        newValue: { role: "ADMIN", phone: input.adminPhone, email: input.adminEmail ?? null },
        severity: "CRITICAL",
      },
      actor,
      tx
    );

    return { association, adminId: admin.id };
  });

  try {
    await ensureRulebook(created.association.id, actor.user.id);
  } catch (error) {
    logger.warn(
      { err: error, associationId: created.association.id },
      "Rulebook not seeded at onboarding; it will be on first read"
    );
  }

  return {
    ok: true,
    created: {
      associationId: created.association.id,
      code: created.association.code,
      name: created.association.name,
      admin: {
        userId: created.adminId,
        phone: input.adminPhone,
        email: input.adminEmail ?? null,
        temporaryPassword,
      },
    },
  };
}

/**
 * The association whose site /abc is, or null for a 404.
 *
 * Only an ACTIVE association has a public site: a pending one is not open yet
 * and a suspended one should not be taking applications. The format is checked
 * before the database is asked, because every unmatched top-level path lands
 * here — a scanner probing /wp-admin should not cost a query.
 */
export async function findSiteAssociation(slug: string) {
  if (!/^[a-z]{2,8}$/i.test(slug)) return null;

  return prisma.association.findFirst({
    where: { code: slug.toUpperCase(), status: "ACTIVE" },
    select: {
      id: true,
      code: true,
      name: true,
      logoUrl: true,
      email: true,
      phone: true,
      website: true,
      city: true,
      district: true,
      currency: true,
    },
  });
}

/**
 * The public directory on the platform's home page: every association that is
 * open, with just enough to link to its site. No figures — those are for the
 * super admin's directory above, behind sign-in.
 */
export async function listPublicAssociations() {
  return prisma.association.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { code: true, name: true, logoUrl: true, city: true, district: true },
  });
}

/**
 * The counts in the platform home page's stats band: open associations, and
 * the active members of those associations. Counts only — no money figure is
 * ever shown publicly.
 */
export async function getPlatformStats(): Promise<{ associations: number; members: number }> {
  const [associations, members] = await Promise.all([
    prisma.association.count({ where: { status: "ACTIVE" } }),
    prisma.member.count({ where: { status: "ACTIVE", association: { status: "ACTIVE" } } }),
  ]);
  return { associations, members };
}
