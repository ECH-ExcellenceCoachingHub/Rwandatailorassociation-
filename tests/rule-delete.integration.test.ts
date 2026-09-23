import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createCustomRule,
  deleteRule,
  ensureRulebook,
  listRules,
  RuleError,
} from "@/lib/services/rulebook";
import { RULE_CATALOGUE, RULE_KEYS } from "@/lib/rules/catalogue";

/**
 * Deleting rules from the rulebook.
 *
 * The case that matters most is the system rule the code never reads: it has
 * to stay deleted, which means surviving `ensureRulebook`, the lazy seeder
 * that re-creates any catalogue key it cannot find.
 */

const RUN = `RULE${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `Rule Delete ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@rule.test`,
      firstName: "Rule",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminId = admin.id;

  await ensureRulebook(associationId, adminId);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.associationRule.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

async function ruleByKey(key: string) {
  return prisma.associationRule.findFirstOrThrow({ where: { associationId, key } });
}

const informational = RULE_CATALOGUE.find((rule) => rule.enforcement === "INFORMATIONAL")!;

describe("deleting a rule", () => {
  it("hides a written-policy system rule, keeps its history, and does not re-seed it", async () => {
    const rule = await ruleByKey(informational.key);

    await deleteRule({
      associationId,
      ruleId: rule.id,
      actorId: adminId,
      reason: "Dropped by the general assembly",
    });

    const after = await ruleByKey(informational.key);
    expect(after.deletedAt).not.toBeNull();
    expect(after.isActive).toBe(false);

    const listed = await listRules(associationId, { includeInactive: true });
    expect(listed.some((r) => r.id === rule.id)).toBe(false);

    // Opening the rules screen again must not bring it back.
    expect((await ensureRulebook(associationId, adminId)).created).toBe(0);

    const revision = await prisma.associationRuleRevision.findFirst({ where: { ruleId: rule.id } });
    expect(revision?.changeReason).toBe("Dropped by the general assembly");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: rule.id, action: "RULE_REMOVED" },
    });
    expect(audit?.reason).toBe("Dropped by the general assembly");
  });

  it("refuses to delete a rule the system enforces", async () => {
    const rule = await ruleByKey(RULE_KEYS.DAILY_SAVINGS);

    await expect(
      deleteRule({ associationId, ruleId: rule.id, actorId: adminId, reason: "Trying to remove it" })
    ).rejects.toMatchObject({ code: "IMMUTABLE" });

    expect((await ruleByKey(RULE_KEYS.DAILY_SAVINGS)).deletedAt).toBeNull();
  });

  it("removes a committee's own rule outright, and audits what it said", async () => {
    const created = await createCustomRule({
      associationId,
      actorId: adminId,
      category: "OTHER",
      valueType: "TEXT",
      titleEn: "Typed in error",
      titleRw: "Ryanditswe nabi",
      bodyEn: "This rule was added by mistake.",
      bodyRw: "Iri tegeko ryongewemo ku makosa.",
    });

    await deleteRule({
      associationId,
      ruleId: created.id,
      actorId: adminId,
      reason: "Added by mistake a minute ago",
    });

    expect(await prisma.associationRule.findUnique({ where: { id: created.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "RULE_REMOVED" },
    });
    expect(audit?.oldValue).toMatchObject({ titleEn: "Typed in error", isSystem: false });
  });

  it("requires a reason, and cannot delete the same rule twice", async () => {
    const rule = await ruleByKey(informational.key);

    await expect(
      deleteRule({ associationId, ruleId: rule.id, actorId: adminId, reason: "  " })
    ).rejects.toBeInstanceOf(RuleError);
    await expect(
      deleteRule({ associationId, ruleId: rule.id, actorId: adminId, reason: "Deleting it again" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
