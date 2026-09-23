import { z } from "zod";

/**
 * Input rules for amending the rulebook and acting on a member's arrears.
 *
 * Shared by the admin dialogs and the route handlers, so the browser and the
 * server apply the same rules. The server copy is the one that decides.
 *
 * WHY A REASON IS MANDATORY EVERYWHERE HERE. Every action these schemas cover
 * changes what a member owes, or forgives something they owed. Six months later
 * somebody will ask why the fine rate went from 7% to 10%, or why one member's
 * fine was waived and another's was not. "Because an administrator clicked a
 * button in September" is not an answer an association survives being given.
 * The minimum length is low enough to type quickly and high enough to rule out
 * a single character typed to get past the form.
 */

const reason = z
  .string()
  .trim()
  .min(10, "Give a reason — it is recorded and members can be shown it")
  .max(500, "Keep the reason under 500 characters");

/** Both languages, because members read the rules in their own. */
const ruleTitle = z
  .string()
  .trim()
  .min(4, "Give the rule a short title")
  .max(120, "Keep the title under 120 characters");

const ruleBody = z
  .string()
  .trim()
  .min(
    20,
    "Explain the rule in a sentence or two a member would understand"
  )
  .max(2000, "Keep the explanation under 2000 characters");

export const ruleCategorySchema = z.enum([
  "CONTRIBUTIONS",
  "PLATFORM_FEE",
  "PENALTIES",
  "LENDING_ELIGIBILITY",
  "LOAN_TERMS",
  "INTEREST_SHARING",
  "GOVERNANCE",
  "OTHER",
]);

export const ruleValueTypeSchema = z.enum([
  "MONEY",
  "PERCENT",
  "DAYS",
  "MONTHS",
  "COUNT",
  "BOOLEAN",
  "TEXT",
]);

/**
 * Amending an existing rule.
 *
 * `value` is validated as a string and normalised server-side against the
 * rule's own type, which the client does not get to choose — a request that
 * claimed a percentage rule was a text rule could otherwise store prose where
 * a loan calculation expects a number.
 */
export const updateRuleSchema = z.object({
  value: z
    .string()
    .trim()
    .max(60, "That value is too long")
    .optional()
    .nullable(),
  titleEn: ruleTitle.optional(),
  titleRw: ruleTitle.optional(),
  bodyEn: ruleBody.optional(),
  bodyRw: ruleBody.optional(),
  isActive: z.boolean().optional(),
  changeReason: reason,
  /// Tell every member that this rule changed. Defaults to true: a rule the
  /// members live under changing quietly is the thing this feature exists to
  /// prevent.
  notifyMembers: z.boolean().default(true),
  effectiveFrom: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine(
      (value) => value === undefined || !Number.isNaN(Date.parse(value)),
      "Enter a valid date"
    )
    .transform((value) => (value ? new Date(value) : undefined)),
});

/** A rule the committee wrote themselves. Always informational. */
export const createRuleSchema = z.object({
  category: ruleCategorySchema,
  valueType: ruleValueTypeSchema,
  value: z.string().trim().max(60).optional().nullable(),
  titleEn: ruleTitle,
  titleRw: ruleTitle,
  bodyEn: ruleBody,
  bodyRw: ruleBody,
  notifyMembers: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Acting on a member's standing
// ---------------------------------------------------------------------------

export const fineActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SETTLE") }),
  z.object({ action: z.literal("WAIVE"), reason }),
]);

export const exemptionSchema = z.object({
  isExempt: z.boolean(),
  reason,
  until: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine(
      (value) => value === undefined || !Number.isNaN(Date.parse(value)),
      "Enter a valid date"
    )
    .transform((value) => (value ? new Date(value) : undefined)),
});

export const obligationStartSchema = z.object({
  startDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date")
    .transform((value) => new Date(value)),
  reason,
});

/**
 * Running the nightly work by hand.
 *
 * Exposed so an officer can charge fees or assess fines on demand — the
 * evening before a meeting, or after the worker has been down. Idempotent
 * either way, which is what makes it safe to offer as a button.
 */
export const complianceRunSchema = z.object({
  tasks: z
    .array(z.enum(["FEES", "FINES", "REMINDERS"]))
    .min(1, "Choose at least one task"),
});

export const remitFeesSchema = z.object({
  upTo: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine(
      (value) => value === undefined || !Number.isNaN(Date.parse(value)),
      "Enter a valid date"
    )
    .transform((value) => (value ? new Date(value) : new Date())),
  reference: z.string().trim().max(120).optional(),
});

/** Deleting a rule. The reason is written to the audit log. */
export const deleteRuleSchema = z.object({ reason });

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type FineActionInput = z.infer<typeof fineActionSchema>;
export type ExemptionInput = z.infer<typeof exemptionSchema>;
export type ComplianceRunInput = z.infer<typeof complianceRunSchema>;
