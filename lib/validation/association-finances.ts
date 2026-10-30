import { z } from "zod";
import { MONEY_SCALE, parseMoneyInput } from "@/lib/money";

/**
 * Input rules for the association's own borrowing and investment records.
 *
 * Shared by the admin forms and the route handlers, so the browser and the
 * server apply the same rules and disagree about nothing. The server copy is
 * the one that decides.
 *
 * WHY THE PROSE FIELDS HAVE MINIMUM LENGTHS. `purpose`, `summary` and
 * `benefitSummary` are the only parts of these records a member actually reads.
 * A facility recorded with a purpose of "loan" tells them nothing, and the
 * screen it feeds becomes a wall of figures with no explanation — the exact
 * thing this feature exists to replace. The minimum is low enough to type in a
 * hurry and high enough to rule out a placeholder.
 */

/**
 * A monetary amount arriving from a form.
 *
 * Kept as a string end to end — see lib/money.ts. `parseMoneyInput` already
 * carries the messages, so its failure is passed straight through rather than
 * being restated here in different words.
 */
function money(options: { allowZero?: boolean } = {}) {
  return z.string().trim().superRefine((value, ctx) => {
    const parsed = parseMoneyInput(value, { allowZero: options.allowZero ?? false });
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
    }
  });
}

/** Optional money: an untouched form field arrives as "". */
const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .superRefine((value, ctx) => {
    if (value === undefined) return;
    const parsed = parseMoneyInput(value, { allowZero: true });
    if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
  });

/** Optional free text; blank folds to undefined rather than reaching the row as "". */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((value) => value || undefined);
}

/** An `<input type="date">` value, or nothing. */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(Date.parse(value)),
    "Enter a valid date"
  )
  .transform((value) => (value ? new Date(value) : undefined));

export const lenderTypeSchema = z.enum([
  "BANK",
  "MICROFINANCE",
  "SACCO",
  "GOVERNMENT_PROGRAMME",
  "NGO",
  "COOPERATIVE_UNION",
  "OTHER",
]);

export const borrowingStatusSchema = z.enum([
  "PENDING_DISBURSEMENT",
  "ACTIVE",
  "OVERDUE",
  "COMPLETED",
  "DEFAULTED",
  "CANCELLED",
  "WRITTEN_OFF",
]);

export const investmentCategorySchema = z.enum([
  "EQUIPMENT",
  "WORKSHOP_SPACE",
  "BULK_MATERIALS",
  "TRAINING",
  "MARKET_ACCESS",
  "PROPERTY",
  "MEMBER_LENDING",
  "EMERGENCY_FUND",
  "OTHER",
]);

export const fundingSourceSchema = z.enum([
  "MEMBER_SAVINGS",
  "BANK_LOAN",
  "RETAINED_SURPLUS",
  "GRANT",
  "MIXED",
]);

export const investmentStatusSchema = z.enum([
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "CANCELLED",
]);

export const createBorrowingSchema = z.object({
  lenderName: z.string().trim().min(2, "Name the lender").max(160),
  lenderType: lenderTypeSchema,
  lenderReference: optionalText(120),
  lenderContact: optionalText(160),
  purpose: z
    .string()
    .trim()
    .min(
      15,
      "Explain what this facility is for, in a sentence a member would understand"
    )
    .max(600),
  principal: money(),
  // A rate is a percentage, not money, so it is not parsed by parseMoneyInput.
  // Four decimals matches the NUMERIC(9,4) column; a lender quoting more
  // precision than that is quoting noise.
  interestRate: z.coerce
    .number()
    .min(0, "A rate cannot be negative")
    .max(200, "Check the rate — that is over 200%"),
  interestMethod: z.enum(["FLAT", "REDUCING_BALANCE"]),
  termMonths: z.coerce
    .number()
    .int("Enter whole months")
    .min(1, "At least one month")
    .max(600, "That is over fifty years — check the term"),
  totalInterest: optionalMoney,
  totalFees: optionalMoney,
  collateralDescription: optionalText(600),
  collateralAmount: optionalMoney,
  status: borrowingStatusSchema.optional(),
  disbursedAt: optionalDate,
  firstPaymentDue: optionalDate,
  maturityDate: optionalDate,
  isPublic: z.boolean().default(true),
});

export const updateBorrowingSchema = z.object({
  lenderName: z.string().trim().min(2).max(160).optional(),
  lenderReference: optionalText(120),
  lenderContact: optionalText(160),
  purpose: z.string().trim().min(15).max(600).optional(),
  collateralDescription: optionalText(600),
  status: borrowingStatusSchema.optional(),
  nextPaymentDue: optionalDate,
  maturityDate: optionalDate,
  isPublic: z.boolean().optional(),
});

export const recordRepaymentSchema = z.object({
  amount: money(),
  interestPortion: optionalMoney,
  feesPortion: optionalMoney,
  channel: z
    .enum([
      "JENGA_EQUITY",
      "MOBILE_MONEY",
      "BANK_TRANSFER",
      "CASH",
      "CHEQUE",
      "INTERNAL_TRANSFER",
      "OTHER",
    ])
    .optional(),
  description: optionalText(300),
  externalReference: optionalText(120),
  paidAt: optionalDate,
  nextPaymentDue: optionalDate,
});

export const createInvestmentSchema = z.object({
  title: z.string().trim().min(3, "Give it a name").max(160),
  category: investmentCategorySchema,
  status: investmentStatusSchema.optional(),
  summary: z
    .string()
    .trim()
    .min(15, "Describe it in a sentence members will understand")
    .max(600),
  description: optionalText(4000),
  benefitSummary: z
    .string()
    .trim()
    .min(10, "Say what members get from it")
    .max(600)
    .optional()
    .transform((value) => value || undefined),
  membersBenefited: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  fundingSource: fundingSourceSchema,
  fundedByLoanId: optionalText(40),
  amountInvested: money(),
  amountReturned: optionalMoney,
  startedAt: optionalDate,
  completedAt: optionalDate,
  isPublic: z.boolean().default(true),
});

export const updateInvestmentSchema = createInvestmentSchema.partial();

export type CreateBorrowingInput = z.infer<typeof createBorrowingSchema>;
export type UpdateBorrowingInput = z.infer<typeof updateBorrowingSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;

/** Exposed so a form can cap its own decimal input to the storage scale. */
export const AMOUNT_STEP = `0.${"0".repeat(MONEY_SCALE - 1)}1`;

export const poolDeductionPurposeSchema = z.enum([
  "MEMBER_LOAN",
  "ASSOCIATION_PROJECT",
  "ASSOCIATION_EXPENSE",
  "OTHER",
]);

export const poolDeductionAllocationSchema = z.enum(["BY_BALANCE", "BY_SHARES", "EQUAL"]);

/** Working out the split, before anything is posted. */
export const previewPoolDeductionSchema = z.object({
  totalAmount: money(),
  allocation: poolDeductionAllocationSchema,
});

/**
 * Taking money out of the members' pool. The reason has a real minimum: it is
 * sent to every member whose balance goes down, and "expense" tells none of
 * them anything.
 */
export const postPoolDeductionSchema = previewPoolDeductionSchema.extend({
  purpose: poolDeductionPurposeSchema,
  title: z.string().trim().min(3, "Say in a few words what the money was for").max(120),
  reason: z
    .string()
    .trim()
    .min(15, "Explain to members why the money was taken — at least 15 characters")
    .max(1000),
  beneficiaryMemberId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null),
});
