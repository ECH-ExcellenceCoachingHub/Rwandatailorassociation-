import "server-only";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, toMoney, toMoneyString } from "@/lib/money";
import {
  RULE_CATALOGUE,
  RULE_BY_KEY,
  RULE_KEYS,
  customRuleKey,
  type RuleDefinition,
} from "@/lib/rules/catalogue";
import type {
  RuleCategory,
  RuleEnforcement,
  RuleValueType,
} from "@/lib/generated/prisma/enums";

/**
 * READING AND AMENDING THE RULEBOOK.
 *
 * Two audiences, one source. `getPolicy` returns the numbers the services
 * enforce; `listRules` returns the same rows as sentences a member reads. They
 * cannot disagree, because there is only one row behind each.
 *
 * WHY A BAD VALUE NEVER CRASHES A PAGE. Rule values are strings written by
 * administrators. Someone will eventually type "7%" into a percentage field
 * that wanted "7", or empty a field that a loan calculation divides by. Every
 * read below falls back to the catalogue default and logs it, because the
 * alternative — a member's savings page throwing a 500 because a rule was
 * mistyped last night — is a far worse failure than quietly applying the
 * documented default until someone fixes it. The admin screen shows a warning
 * on any rule whose stored value did not parse, so it is never silent.
 *
 * WHY AMENDMENTS ARE AUDITED TWICE. Every change writes both an
 * AssociationRuleRevision (the member-visible history of the policy) and an
 * AuditLog entry (the officer-visible record of who touched what). They answer
 * different questions: one is "what was the rule in March", the other is "what
 * has this administrator been changing".
 */

// ---------------------------------------------------------------------------
// The resolved policy
// ---------------------------------------------------------------------------

/**
 * Every rule the code enforces, resolved to a usable value.
 *
 * Money and percentages stay strings — see lib/money.ts. Counts of days and
 * months are numbers, because they are counts and never arithmetic on money.
 */
export interface AssociationPolicy {
  // What a member owes each day.
  dailySavings: string;
  platformFeePerDay: string;
  /// The two added: what one day of membership actually costs to pay.
  dailyTotal: string;

  // Falling behind.
  graceDays: number;
  /// The fine for each share a member holds, charged once per stretch missed.
  penaltyPerShare: string;
  penaltyRepeatDays: number;
  reminderLeadDays: number;

  // Who may borrow.
  lendingUnlockMonths: number;
  memberMinimumMonths: number;
  ownSavingsPercent: string;
  collateralRequiredAboveShare: boolean;
  collateralCoveragePercent: string;
  arrearsBlockBorrowing: boolean;

  // On what terms.
  loanMonthlyInterest: string;
  loanMaxTermMonths: number;
  loanNoExtraCharges: boolean;

  // Where the interest goes.
  interestMemberPoints: string;
  interestAssociationPoints: string;

  // Goods bought out of the store and paid for over months.
  warehouseCreditInterest: string;
  warehouseCreditTermMonths: number;
  warehouseCreditFineRate: string;
  warehouseCreditFineGraceDays: number;

  /// Keys whose stored value could not be read and fell back to the default.
  /// Surfaced on the admin rulebook so a typo is visible rather than silent.
  invalidKeys: string[];
}

/** The catalogue's own defaults, for tests and for an association with no rows. */
export const DEFAULT_POLICY: AssociationPolicy = buildPolicy(new Map());

/**
 * Resolves an association's enforceable policy.
 *
 * One indexed query over at most a few dozen rows. Called by page renders and
 * by the nightly worker alike, so it deliberately does no caching of its own:
 * a rule changed at 09:00 must bind at 09:01, not after a cache expires.
 */
export async function getPolicy(
  associationId: string | null
): Promise<AssociationPolicy> {
  if (!associationId) return DEFAULT_POLICY;

  const rows = await prisma.associationRule.findMany({
    where: { associationId, isSystem: true, isActive: true },
    select: { key: true, value: true },
  });

  return buildPolicy(new Map(rows.map((row) => [row.key, row.value])));
}

function buildPolicy(values: Map<string, string | null>): AssociationPolicy {
  const invalidKeys: string[] = [];

  /** The catalogue default for a key, which is what a bad value falls back to. */
  const fallback = (key: string): string =>
    RULE_BY_KEY.get(key)?.defaultValue ?? "0";

  const raw = (key: string): string => values.get(key) ?? fallback(key);

  const money = (key: string): string => {
    try {
      const parsed = toMoney(raw(key));
      if (parsed.isNegative()) throw new RangeError("negative");
      return toMoneyString(parsed);
    } catch {
      invalidKeys.push(key);
      return toMoneyString(fallback(key));
    }
  };

  /** A percentage, kept at the 4dp the NUMERIC(9,4) columns store. */
  const percent = (key: string): string => {
    try {
      const parsed = toMoney(raw(key));
      if (parsed.isNegative() || parsed.greaterThan(1000)) {
        throw new RangeError("out of range");
      }
      return parsed.toFixed(4);
    } catch {
      invalidKeys.push(key);
      return toMoney(fallback(key)).toFixed(4);
    }
  };

  const count = (key: string, max = 1200): number => {
    const parsed = Number.parseInt(raw(key), 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
      invalidKeys.push(key);
      return Number.parseInt(fallback(key), 10) || 0;
    }
    return parsed;
  };

  const boolean = (key: string): boolean => {
    const value = raw(key);
    if (value === "true") return true;
    if (value === "false") return false;
    invalidKeys.push(key);
    return fallback(key) === "true";
  };

  const dailySavings = money(RULE_KEYS.DAILY_SAVINGS);
  const platformFeePerDay = money(RULE_KEYS.PLATFORM_FEE_DAILY);

  return {
    dailySavings,
    platformFeePerDay,
    dailyTotal: toMoneyString(add(dailySavings, platformFeePerDay)),

    // A grace of zero would fine a member the first day they were late, and a
    // repeat of zero would fine them again every night forever. Both are
    // floored at one rather than trusted, because either is a runaway.
    graceDays: Math.max(1, count(RULE_KEYS.PENALTY_GRACE_DAYS, 365)),
    penaltyPerShare: money(RULE_KEYS.PENALTY_PER_SHARE),
    penaltyRepeatDays: Math.max(1, count(RULE_KEYS.PENALTY_REPEAT_DAYS, 365)),
    reminderLeadDays: count(RULE_KEYS.REMINDER_LEAD_DAYS, 90),

    lendingUnlockMonths: count(RULE_KEYS.LENDING_UNLOCK_MONTHS, 240),
    memberMinimumMonths: count(RULE_KEYS.MEMBER_MINIMUM_MONTHS, 240),
    ownSavingsPercent: percent(RULE_KEYS.OWN_SAVINGS_PERCENT),
    collateralRequiredAboveShare: boolean(RULE_KEYS.COLLATERAL_REQUIRED_ABOVE_SHARE),
    collateralCoveragePercent: percent(RULE_KEYS.COLLATERAL_COVERAGE_PERCENT),
    arrearsBlockBorrowing: boolean(RULE_KEYS.ARREARS_BLOCK_BORROWING),

    loanMonthlyInterest: percent(RULE_KEYS.LOAN_MONTHLY_INTEREST),
    // A zero-month term would divide by zero in the schedule generator.
    loanMaxTermMonths: Math.max(1, count(RULE_KEYS.LOAN_MAX_TERM_MONTHS, 120)),
    loanNoExtraCharges: boolean(RULE_KEYS.LOAN_NO_EXTRA_CHARGES),

    interestMemberPoints: percent(RULE_KEYS.INTEREST_MEMBER_POINTS),
    interestAssociationPoints: percent(RULE_KEYS.INTEREST_ASSOCIATION_POINTS),

    warehouseCreditInterest: percent(RULE_KEYS.WAREHOUSE_CREDIT_INTEREST),
    // Floored at one for the same reason the loan term is: a zero-month term
    // divides by zero when the instalments are cut.
    warehouseCreditTermMonths: Math.max(
      1,
      count(RULE_KEYS.WAREHOUSE_CREDIT_TERM_MONTHS, 60)
    ),
    warehouseCreditFineRate: percent(RULE_KEYS.WAREHOUSE_CREDIT_FINE_RATE),
    // Zero is legitimate here, unlike the contribution grace: the fine falls
    // the day after a missed instalment unless the committee says otherwise.
    warehouseCreditFineGraceDays: count(
      RULE_KEYS.WAREHOUSE_CREDIT_FINE_GRACE_DAYS,
      90
    ),

    invalidKeys,
  };
}

/**
 * The fraction of collected interest that belongs to the borrower, as a
 * Decimal between 0 and 1.
 *
 * Derived from the two point values rather than assumed to be a half, so an
 * association that resolves to split 1.5/0.5 gets what it resolved. When both
 * are zero — which only a deliberate edit can produce — nothing is credited
 * back and the whole of the interest stays with the association, because the
 * alternative is a division by zero in the middle of a repayment.
 */
export function memberInterestShare(policy: AssociationPolicy) {
  const member = toMoney(policy.interestMemberPoints);
  const total = add(policy.interestMemberPoints, policy.interestAssociationPoints);
  if (!total.greaterThan(0)) return toMoney(0);
  return member.dividedBy(total);
}

// ---------------------------------------------------------------------------
// Reading the rulebook as text
// ---------------------------------------------------------------------------

export interface RuleRecord {
  id: string;
  key: string;
  category: RuleCategory;
  valueType: RuleValueType;
  enforcement: RuleEnforcement;
  value: string | null;
  isSystem: boolean;
  isActive: boolean;
  displayOrder: number;
  title: { en: string; rw: string };
  body: { en: string; rw: string };
  version: number;
  effectiveFrom: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Every rule the association has, in reading order.
 *
 * `includeInactive` is false for the member-facing page and true for the admin
 * rulebook — a withdrawn rule must stay findable by the officer who withdrew
 * it, and by anyone auditing a fine issued under it.
 */
export async function listRules(
  associationId: string,
  options: { includeInactive?: boolean } = {}
): Promise<RuleRecord[]> {
  const rows = await prisma.associationRule.findMany({
    where: {
      associationId,
      ...(options.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      key: true,
      category: true,
      valueType: true,
      enforcement: true,
      value: true,
      isSystem: true,
      isActive: true,
      displayOrder: true,
      titleEn: true,
      titleRw: true,
      bodyEn: true,
      bodyRw: true,
      version: true,
      effectiveFrom: true,
      updatedAt: true,
      updatedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    category: row.category,
    valueType: row.valueType,
    enforcement: row.enforcement,
    value: row.value,
    isSystem: row.isSystem,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    title: { en: row.titleEn, rw: row.titleRw },
    body: { en: row.bodyEn, rw: row.bodyRw },
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy
      ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}`
      : null,
  }));
}

export interface RuleRevisionRecord {
  version: number;
  value: string | null;
  title: { en: string; rw: string };
  isActive: boolean;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: Date;
}

/** The amendment history of one rule, newest first. */
export async function getRuleHistory(
  associationId: string,
  ruleId: string
): Promise<RuleRevisionRecord[]> {
  const rows = await prisma.associationRuleRevision.findMany({
    // Scoped through the parent rule so an id from another tenant returns
    // nothing rather than another association's policy history.
    where: { ruleId, rule: { associationId } },
    orderBy: { version: "desc" },
    take: 50,
    select: {
      version: true,
      value: true,
      titleEn: true,
      titleRw: true,
      isActive: true,
      changeReason: true,
      createdAt: true,
      changedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((row) => ({
    version: row.version,
    value: row.value,
    title: { en: row.titleEn, rw: row.titleRw },
    isActive: row.isActive,
    changedBy: row.changedBy
      ? `${row.changedBy.firstName} ${row.changedBy.lastName}`
      : null,
    changeReason: row.changeReason,
    createdAt: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Makes sure every catalogue rule exists for this association.
 *
 * Idempotent and additive: it creates what is missing and never touches what
 * is there, so a committee's edited wording and retuned figures survive every
 * deployment that adds a new rule to the catalogue.
 *
 * Called lazily when a rules screen is opened rather than on a migration,
 * because a migration cannot know which associations exist on a customer's
 * database and a half-seeded tenant is worse than an unseeded one.
 */
export async function ensureRulebook(
  associationId: string,
  actorId?: string | null
): Promise<{ created: number }> {
  const existing = await prisma.associationRule.findMany({
    where: { associationId, isSystem: true },
    select: { key: true },
  });

  const have = new Set(existing.map((row) => row.key));
  const missing = RULE_CATALOGUE.filter((rule) => !have.has(rule.key));

  if (missing.length === 0) return { created: 0 };

  // ONE statement, not one per rule.
  //
  // This was `$transaction(missing.map(... create ...))`, which is two dozen
  // separate INSERTs sent one after another inside a single transaction. On a
  // hosted database each one carries a round trip, and the batch reliably ran
  // past Prisma's five-second transaction budget — surfacing as P2028 ("a
  // rollback cannot be executed on an expired transaction"), failing the seed,
  // and taking every rules page down with it. `createMany` is a single INSERT,
  // so there is no multi-statement transaction left to expire.
  //
  // `skipDuplicates` also closes a race the read-then-write above cannot: two
  // people opening a rules screen at the same moment both compute the same
  // `missing` list, and the slower insert used to die on the unique constraint
  // over (associationId, key). Now it inserts nothing and moves on, which is
  // exactly what "make sure these exist" should do.
  //
  // Version 1 gets no revision row: there is no prior wording to record, and
  // an empty "changed from nothing" entry would only make the history harder
  // to read.
  const { count } = await prisma.associationRule.createMany({
    data: missing.map((rule) => ({
      associationId,
      key: rule.key,
      category: rule.category,
      valueType: rule.valueType,
      enforcement: rule.enforcement,
      value: rule.defaultValue,
      isSystem: true,
      displayOrder: rule.displayOrder,
      titleEn: rule.title.en,
      titleRw: rule.title.rw,
      bodyEn: rule.body.en,
      bodyRw: rule.body.rw,
      createdById: actorId ?? null,
    })),
    skipDuplicates: true,
  });

  // `count` rather than `missing.length`: with skipDuplicates they differ
  // whenever another request seeded the same rows a moment earlier, and the
  // log should say what this call actually wrote.
  logger.info({ associationId, created: count }, "seeded association rulebook");

  return { created: count };
}

// ---------------------------------------------------------------------------
// Amending
// ---------------------------------------------------------------------------

export class RuleError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "IMMUTABLE" | "INVALID_VALUE"
  ) {
    super(message);
    this.name = "RuleError";
  }
}

export interface UpdateRuleInput {
  associationId: string;
  ruleId: string;
  actorId: string;
  value?: string | null;
  titleEn?: string;
  titleRw?: string;
  bodyEn?: string;
  bodyRw?: string;
  isActive?: boolean;
  /// Why the committee changed it. Required — a rule that changed for no
  /// stated reason is the one a member will dispute.
  changeReason: string;
  effectiveFrom?: Date;
}

/**
 * Amends a rule, recording the version it replaced.
 *
 * The revision row captures the OLD state, not the new one: it is the answer
 * to "what did this rule say before today", and writing the new values there
 * would make the history a duplicate of the current row.
 */
export async function updateRule(input: UpdateRuleInput): Promise<RuleRecord> {
  const rule = await prisma.associationRule.findFirst({
    where: { id: input.ruleId, associationId: input.associationId },
  });

  if (!rule) throw new RuleError("That rule does not exist", "NOT_FOUND");

  // A system rule may be retuned, reworded and even switched off, but never
  // rekeyed or removed — a service asking for it must always get an answer.
  if (rule.isSystem && input.isActive === false) {
    const definition = RULE_BY_KEY.get(rule.key);
    if (definition?.enforcement === "AUTOMATIC") {
      throw new RuleError(
        "This rule is applied automatically by the system and cannot be switched off. Change its value instead.",
        "IMMUTABLE"
      );
    }
  }

  const value =
    input.value === undefined
      ? rule.value
      : normaliseValue(rule.valueType, input.value);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.associationRuleRevision.create({
      data: {
        ruleId: rule.id,
        version: rule.version,
        value: rule.value,
        titleEn: rule.titleEn,
        titleRw: rule.titleRw,
        bodyEn: rule.bodyEn,
        bodyRw: rule.bodyRw,
        isActive: rule.isActive,
        changedById: input.actorId,
        changeReason: input.changeReason,
      },
    });

    return tx.associationRule.update({
      where: { id: rule.id },
      data: {
        value,
        titleEn: input.titleEn ?? rule.titleEn,
        titleRw: input.titleRw ?? rule.titleRw,
        bodyEn: input.bodyEn ?? rule.bodyEn,
        bodyRw: input.bodyRw ?? rule.bodyRw,
        isActive: input.isActive ?? rule.isActive,
        effectiveFrom: input.effectiveFrom ?? new Date(),
        version: rule.version + 1,
        updatedById: input.actorId,
      },
      select: {
        id: true,
        key: true,
        category: true,
        valueType: true,
        enforcement: true,
        value: true,
        isSystem: true,
        isActive: true,
        displayOrder: true,
        titleEn: true,
        titleRw: true,
        bodyEn: true,
        bodyRw: true,
        version: true,
        effectiveFrom: true,
        updatedAt: true,
      },
    });
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.RULE_AMENDED,
      entityType: "AssociationRule",
      entityId: rule.id,
      associationId: input.associationId,
      oldValue: {
        value: rule.value,
        titleEn: rule.titleEn,
        isActive: rule.isActive,
        version: rule.version,
      },
      newValue: {
        value: updated.value,
        titleEn: updated.titleEn,
        isActive: updated.isActive,
        version: updated.version,
      },
      reason: input.changeReason,
      metadata: { key: rule.key, category: rule.category },
      // Retuning a fine rate or a borrowing limit changes what every member
      // owes tomorrow. Never routine.
      severity: rule.isSystem ? "WARNING" : "NOTICE",
    },
    { id: input.actorId }
  );

  return {
    id: updated.id,
    key: updated.key,
    category: updated.category,
    valueType: updated.valueType,
    enforcement: updated.enforcement,
    value: updated.value,
    isSystem: updated.isSystem,
    isActive: updated.isActive,
    displayOrder: updated.displayOrder,
    title: { en: updated.titleEn, rw: updated.titleRw },
    body: { en: updated.bodyEn, rw: updated.bodyRw },
    version: updated.version,
    effectiveFrom: updated.effectiveFrom,
    updatedAt: updated.updatedAt,
    updatedBy: null,
  };
}

export interface CreateCustomRuleInput {
  associationId: string;
  actorId: string;
  category: RuleCategory;
  valueType: RuleValueType;
  value?: string | null;
  titleEn: string;
  titleRw: string;
  bodyEn: string;
  bodyRw: string;
  effectiveFrom?: Date;
}

/**
 * Adds a rule the committee wrote themselves.
 *
 * Custom rules are always INFORMATIONAL. Nothing in the code reads them, and
 * the screens say so plainly — an association must not be able to write a rule
 * that looks enforced and is not, because a member would rely on it.
 */
export async function createCustomRule(
  input: CreateCustomRuleInput
): Promise<{ id: string; key: string }> {
  const baseKey = customRuleKey(input.titleEn);

  // Two rules called "Meeting attendance" would collide on the unique key.
  // Suffix rather than reject: the committee named them, and refusing a title
  // because a similarly named rule exists is not their problem to solve.
  let key = baseKey;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const clash = await prisma.associationRule.findUnique({
      where: { associationId_key: { associationId: input.associationId, key } },
      select: { id: true },
    });
    if (!clash) break;
    key = `${baseKey}_${attempt}`;
  }

  // Drawn after the catalogue, in the order the committee added them.
  const last = await prisma.associationRule.aggregate({
    where: { associationId: input.associationId },
    _max: { displayOrder: true },
  });

  const created = await prisma.associationRule.create({
    data: {
      associationId: input.associationId,
      key,
      category: input.category,
      valueType: input.valueType,
      enforcement: "INFORMATIONAL",
      value:
        input.valueType === "TEXT"
          ? null
          : normaliseValue(input.valueType, input.value ?? null),
      isSystem: false,
      displayOrder: (last._max.displayOrder ?? 0) + 10,
      titleEn: input.titleEn,
      titleRw: input.titleRw,
      bodyEn: input.bodyEn,
      bodyRw: input.bodyRw,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      createdById: input.actorId,
      updatedById: input.actorId,
    },
    select: { id: true, key: true },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.RULE_ADDED,
      entityType: "AssociationRule",
      entityId: created.id,
      associationId: input.associationId,
      newValue: {
        key: created.key,
        category: input.category,
        titleEn: input.titleEn,
        value: input.value ?? null,
      },
      severity: "NOTICE",
    },
    { id: input.actorId }
  );

  return created;
}

/**
 * Removes a rule the committee wrote.
 *
 * System rules are never deletable — see the note on `AssociationRule.isSystem`.
 * A custom rule that members have been living under is withdrawn rather than
 * deleted, which is what `updateRule({ isActive: false })` is for; deletion is
 * for the one typed in error five minutes ago.
 */
export async function deleteCustomRule(
  associationId: string,
  ruleId: string,
  actorId: string
): Promise<void> {
  const rule = await prisma.associationRule.findFirst({
    where: { id: ruleId, associationId },
    select: { id: true, key: true, isSystem: true, titleEn: true, value: true },
  });

  if (!rule) throw new RuleError("That rule does not exist", "NOT_FOUND");

  if (rule.isSystem) {
    throw new RuleError(
      "This rule is part of the system rulebook and cannot be deleted. Switch it off or change its value instead.",
      "IMMUTABLE"
    );
  }

  await prisma.associationRule.delete({ where: { id: rule.id } });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.RULE_REMOVED,
      entityType: "AssociationRule",
      entityId: rule.id,
      associationId,
      // The row is gone, so the audit entry is the only surviving record of
      // what it said.
      oldValue: { key: rule.key, titleEn: rule.titleEn, value: rule.value },
      severity: "WARNING",
    },
    { id: actorId }
  );
}

/**
 * Coerces an administrator's typed value into the canonical form for its type.
 *
 * Accepts what a person actually types — "7%", "1,000", " true " — and stores
 * the exact form the policy reader expects, so a stray percent sign becomes a
 * correct rule rather than an invalid one that silently falls back to default.
 */
function normaliseValue(type: RuleValueType, value: string | null): string | null {
  if (type === "TEXT") return null;
  if (value === null) return null;

  const trimmed = value.trim().replace(/,/g, "").replace(/%$/, "").trim();

  if (trimmed === "") {
    throw new RuleError("This rule needs a value", "INVALID_VALUE");
  }

  switch (type) {
    case "MONEY": {
      const parsed = toMoney(trimmed);
      if (parsed.isNegative()) {
        throw new RuleError("An amount cannot be negative", "INVALID_VALUE");
      }
      return toMoneyString(parsed);
    }
    case "PERCENT": {
      const parsed = toMoney(trimmed);
      if (parsed.isNegative() || parsed.greaterThan(1000)) {
        throw new RuleError("Enter a percentage between 0 and 1000", "INVALID_VALUE");
      }
      return parsed.toFixed(4);
    }
    case "DAYS":
    case "MONTHS":
    case "COUNT": {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== trimmed) {
        throw new RuleError("Enter a whole number", "INVALID_VALUE");
      }
      return String(parsed);
    }
    case "BOOLEAN": {
      const lowered = trimmed.toLowerCase();
      if (["true", "yes", "1"].includes(lowered)) return "true";
      if (["false", "no", "0"].includes(lowered)) return "false";
      throw new RuleError("Choose yes or no", "INVALID_VALUE");
    }
    default:
      return trimmed;
  }
}

/** Re-exported so route handlers can validate a catalogue key without a DB hit. */
export { RULE_KEYS, RULE_CATALOGUE, type RuleDefinition };

/**
 * Ensures the rulebook exists and returns the policy in one call.
 *
 * The combination every admin screen wants: an association that has never
 * opened the rules page still renders a complete rulebook the first time
 * somebody looks at it, rather than an empty screen that implies no rules.
 */
export async function getPolicyEnsured(
  associationId: string | null,
  actorId?: string | null
): Promise<AssociationPolicy> {
  if (!associationId) return DEFAULT_POLICY;

  // One read answers both questions — which system rules exist, and what the
  // active ones say — so the everyday case, a rulebook that is already
  // complete, costs a single round trip instead of two. Only an association
  // that is actually missing rules takes the longer seed-then-read path.
  const rows = await prisma.associationRule.findMany({
    where: { associationId, isSystem: true },
    select: { key: true, value: true, isActive: true },
  });

  const have = new Set(rows.map((row) => row.key));
  if (RULE_CATALOGUE.some((rule) => !have.has(rule.key))) {
    await ensureRulebook(associationId, actorId);
    return getPolicy(associationId);
  }

  return policyFromRules(rows.filter((row) => row.isActive));
}

/**
 * Builds the policy from an association's active system rules that the caller
 * has already loaded — for a query that fetches them alongside other data
 * instead of paying a separate round trip in `getPolicy`.
 */
export function policyFromRules(
  rules: { key: string; value: string | null }[]
): AssociationPolicy {
  return buildPolicy(new Map(rules.map((row) => [row.key, row.value])));
}

/** Used by the contribution service inside an open transaction. */
export async function getPolicyWithin(
  tx: TxClient,
  associationId: string
): Promise<AssociationPolicy> {
  const rows = await tx.associationRule.findMany({
    where: { associationId, isSystem: true, isActive: true },
    select: { key: true, value: true },
  });
  return buildPolicy(new Map(rows.map((row) => [row.key, row.value])));
}
