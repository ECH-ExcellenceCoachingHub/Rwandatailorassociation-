import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { AuthContext } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { createAssociation, findRegistrationAssociation } from "@/lib/services/associations";
import { getPolicy } from "@/lib/services/rulebook";
import { createAssociationSchema } from "@/lib/validation/associations";
import { STANDARD_LOAN_PRODUCT } from "@/lib/rules/association-defaults";

/**
 * Onboarding a new association, against a real database.
 *
 * A super admin's one form must leave behind an association that works without
 * anyone touching the database: active, with a savings rule, a loan product, a
 * complete rulebook and an administrator who can sign in — and the public join
 * link must find it.
 */

// Letters only, as the schema demands: base-36 digits mapped onto A–J.
const RUN = Date.now().toString(36).toUpperCase().replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]);
const CODE = `T${RUN}`.slice(0, 8);
const PHONE = `+25078${String(Date.now()).slice(-7)}`;

let superAdmin: AuthContext;
const createdAssociationIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `super-${CODE.toLowerCase()}@onboarding.test`,
      firstName: "Super",
      lastName: "Admin",
      passwordHash: "x",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);

  superAdmin = {
    user: {
      id: user.id,
      email: user.email,
      phone: null,
      firstName: "Super",
      lastName: "Admin",
      fullName: "Super Admin",
      avatarUrl: null,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      associationId: null,
      emailVerified: true,
      phoneVerified: false,
      mustChangePassword: false,
    },
    member: null,
    association: null,
    session: { id: "test", expiresAt: new Date(Date.now() + 3_600_000) },
    permissions: new Set(),
  };
});

afterAll(async () => {
  const ids = createdAssociationIds;
  const adminIds = (
    await prisma.user.findMany({ where: { associationId: { in: ids } }, select: { id: true } })
  ).map((u) => u.id);
  const userIds = [...adminIds, ...createdUserIds];

  await prisma.auditLog.deleteMany({
    where: { OR: [{ associationId: { in: ids } }, { actorId: { in: userIds } }] },
  });
  await prisma.associationRuleRevision.deleteMany({ where: { rule: { associationId: { in: ids } } } });
  await prisma.associationRule.deleteMany({ where: { associationId: { in: ids } } });
  await prisma.loanProduct.deleteMany({ where: { associationId: { in: ids } } });
  await prisma.savingsRule.deleteMany({ where: { associationId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.association.deleteMany({ where: { id: { in: ids } } });
});

describe("createAssociationSchema", () => {
  it("normalises the code to upper case", () => {
    const parsed = createAssociationSchema.parse({
      code: " abc ",
      name: "ABC Savers",
      adminFirstName: "A",
      adminLastName: "B",
      adminPhone: "0788123456",
    });
    expect(parsed.code).toBe("ABC");
    expect(parsed.adminPhone).toBe("+250788123456");
  });

  it.each(["A", "ABCDEFGHI", "AB1", "A B", "LOGIN", "admin", "sspsg"])(
    "refuses the code %s",
    (code) => {
      const parsed = createAssociationSchema.safeParse({
        code,
        name: "Some Association",
        adminFirstName: "A",
        adminLastName: "B",
        adminPhone: "0788123456",
      });
      expect(parsed.success).toBe(false);
    }
  );
});

describe("createAssociation", () => {
  it("creates a working association with its first administrator", async () => {
    const input = createAssociationSchema.parse({
      code: CODE,
      name: `Onboarding Test ${RUN}`,
      district: "Kicukiro",
      adminFirstName: "First",
      adminLastName: "Admin",
      adminPhone: PHONE,
    });

    const result = await createAssociation(input, superAdmin);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdAssociationIds.push(result.created.associationId);

    const association = await prisma.association.findUniqueOrThrow({
      where: { id: result.created.associationId },
      include: { savingsRule: true, loanProducts: true },
    });
    expect(association.code).toBe(CODE);
    expect(association.status).toBe("ACTIVE");
    expect(association.legalName).toBe(association.name);
    expect(association.savingsRule?.minimumDeposit.toString()).toBe("500");
    expect(association.loanProducts).toHaveLength(1);
    expect(association.loanProducts[0].code).toBe(STANDARD_LOAN_PRODUCT.code);

    // The rulebook is seeded, so the policy reads real rows, not just defaults.
    const rules = await prisma.associationRule.count({
      where: { associationId: association.id, isSystem: true },
    });
    expect(rules).toBeGreaterThan(0);
    const policy = await getPolicy(association.id);
    expect(policy.dailySavings).toBeTruthy();

    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: result.created.admin.userId },
    });
    expect(admin.role).toBe("ADMIN");
    expect(admin.status).toBe("ACTIVE");
    expect(admin.associationId).toBe(association.id);
    expect(admin.phone).toBe(PHONE);
    expect(admin.mustChangePassword).toBe(true);
    expect(await verifyPassword(result.created.admin.temporaryPassword, admin.passwordHash)).toBe(
      true
    );

    const audits = await prisma.auditLog.findMany({
      where: { associationId: association.id },
      select: { action: true },
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      "ASSOCIATION_CREATED",
      "SUPER_ADMIN_CREATED_ADMIN",
    ]);
  });

  it("refuses a code that is already taken", async () => {
    const result = await createAssociation(
      createAssociationSchema.parse({
        code: CODE,
        name: "Duplicate",
        adminFirstName: "A",
        adminLastName: "B",
        adminPhone: "0788000001",
      }),
      superAdmin
    );
    expect(result).toMatchObject({ ok: false, field: "code" });
  });

  it("refuses an administrator phone that already has an account", async () => {
    const result = await createAssociation(
      createAssociationSchema.parse({
        code: "ZZONBRD",
        name: "Second",
        adminFirstName: "A",
        adminLastName: "B",
        adminPhone: PHONE,
      }),
      superAdmin
    );
    expect(result).toMatchObject({ ok: false, field: "adminPhone" });
    expect(await prisma.association.findUnique({ where: { code: "ZZONBRD" } })).toBeNull();
  });
});

describe("findRegistrationAssociation", () => {
  it("finds an active association by its code, in any case", async () => {
    const found = await findRegistrationAssociation(CODE.toLowerCase());
    expect(found?.code).toBe(CODE);
  });

  it("does not open registration into an association that is not active", async () => {
    await prisma.association.update({ where: { code: CODE }, data: { status: "SUSPENDED" } });
    expect(await findRegistrationAssociation(CODE)).toBeNull();
    await prisma.association.update({ where: { code: CODE }, data: { status: "ACTIVE" } });
  });

  it("returns null for a code nobody uses", async () => {
    expect(await findRegistrationAssociation("NOSUCHAS")).toBeNull();
  });
});
