import { z } from "zod";
import { MONEY_SCALE, parseMoneyInput } from "@/lib/money";
import { QUANTITY_SCALE, parseQuantityInput } from "@/lib/quantity";

/**
 * Input rules for the warehouse.
 *
 * Shared by the admin forms and the route handlers, so the browser and the
 * server apply the same rules and disagree about nothing. The server copy is
 * the one that decides.
 *
 * WHY THE REASONS HAVE MINIMUM LENGTHS. A stock adjustment and a write-off are
 * the two acts that can make a shortfall disappear, and the only thing
 * standing between an honest correction and a covered-up loss is the sentence
 * the officer typed. "fix" is not that sentence. The minimum is low enough to
 * type at a stock take and high enough to rule out a keystroke.
 */

/** A monetary amount arriving from a form. Kept as a string end to end. */
function money(options: { allowZero?: boolean } = {}) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const parsed = parseMoneyInput(value, {
        allowZero: options.allowZero ?? false,
      });
      if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
    });
}

/** A stock quantity arriving from a form. Three decimals, see lib/quantity.ts. */
function quantity(options: { allowZero?: boolean } = {}) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const parsed = parseQuantityInput(value, {
        allowZero: options.allowZero ?? false,
      });
      if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
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

const optionalQuantity = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .superRefine((value, ctx) => {
    if (value === undefined) return;
    const parsed = parseQuantityInput(value, { allowZero: true });
    if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
  });

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

/**
 * The sentence an officer has to write before the system will let them change
 * a count or write stock off.
 */
const reason = z
  .string()
  .trim()
  .min(10, "Say what happened, in a sentence someone auditing this could follow")
  .max(500);

export const warehouseItemCategorySchema = z.enum([
  "FABRIC",
  "THREAD_AND_TRIM",
  "MACHINE",
  "MACHINE_PART",
  "TOOL",
  "PACKAGING",
  "CONSUMABLE",
  "FINISHED_GOODS",
  "OTHER",
]);

export const warehouseIssueTermsSchema = z.enum([
  "PURCHASE",
  "CREDIT",
  "LOAN_OUT",
  "AGAINST_LOAN",
  "FREE_ISSUE",
]);

export const warehouseIssuanceStatusSchema = z.enum([
  "ISSUED",
  "PARTIALLY_RETURNED",
  "RETURNED",
  "CHARGED",
  "SETTLED",
  "WRITTEN_OFF",
  "CANCELLED",
]);

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const createWarehouseItemSchema = z.object({
  // Uppercased on write so "fab-01" and "FAB-01" cannot become two lines for
  // the same roll of cloth.
  sku: z
    .string()
    .trim()
    .min(2, "Give the item a stock code")
    .max(40)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "Use letters, numbers, dots, dashes and underscores only"
    )
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Name the item").max(160),
  nameRw: optionalText(160),
  category: warehouseItemCategorySchema,
  unit: z
    .string()
    .trim()
    .min(1, "Say what it is counted in — metre, piece, roll, kg")
    .max(24),
  unitCost: money({ allowZero: true }),
  unitPrice: money({ allowZero: true }),
  reorderLevel: optionalQuantity,
  openingQuantity: optionalQuantity,
  notes: optionalText(600),
});

export const updateWarehouseItemSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  nameRw: optionalText(160),
  category: warehouseItemCategorySchema.optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  unitCost: optionalMoney,
  unitPrice: optionalMoney,
  reorderLevel: optionalQuantity,
  notes: optionalText(600),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export const receiveStockSchema = z.object({
  quantity: quantity(),
  unitCost: optionalMoney,
  supplierName: optionalText(160),
  deliveryNoteRef: optionalText(80),
  note: optionalText(500),
  occurredAt: optionalDate,
});

export const adjustStockSchema = z.object({
  // What is actually on the shelf, not the difference — an officer should not
  // have to do mental arithmetic against a figure they are disputing.
  countedQuantity: quantity({ allowZero: true }),
  reason,
  occurredAt: optionalDate,
});

export const writeOffStockSchema = z.object({
  quantity: quantity(),
  reason,
  occurredAt: optionalDate,
});

// ---------------------------------------------------------------------------
// Issuing to a member
// ---------------------------------------------------------------------------

export const issueGoodsSchema = z
  .object({
    memberId: z.string().trim().min(1, "Choose a member"),
    terms: warehouseIssueTermsSchema,
    loanId: optionalText(40),
    dueBackAt: optionalDate,
    note: optionalText(500),
    issuedAt: optionalDate,
    lines: z
      .array(
        z.object({
          itemId: z.string().trim().min(1, "Choose an item"),
          quantity: quantity(),
          unitValue: optionalMoney,
        })
      )
      .min(1, "Add at least one item")
      .max(50, "Split an issue this large across more than one record"),
  })
  .superRefine((value, ctx) => {
    // Goods issued against a loan have to name the loan, or the collateral
    // link this terms setting exists to create is not made and the value ends
    // up secured by nothing.
    if (value.terms === "AGAINST_LOAN" && !value.loanId) {
      ctx.addIssue({
        code: "custom",
        path: ["loanId"],
        message: "Choose the loan these goods are issued against",
      });
    }
    // Something lent out with no date is something nobody will ever chase.
    if (value.terms === "LOAN_OUT" && !value.dueBackAt) {
      ctx.addIssue({
        code: "custom",
        path: ["dueBackAt"],
        message: "Say when these goods are due back",
      });
    }
  });

export const returnGoodsSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().trim().min(1),
        quantity: quantity({ allowZero: true }),
      })
    )
    .min(1, "Say what came back"),
  note: optionalText(500),
  occurredAt: optionalDate,
});

export const settleIssuanceSchema = z.object({
  amount: money(),
  /// True takes it out of the member's savings; false records a cash payment.
  fromSavings: z.boolean(),
  note: optionalText(500),
});

export const cancelIssuanceSchema = z.object({ reason });

// ---------------------------------------------------------------------------
// Goods bought on credit
// ---------------------------------------------------------------------------

/**
 * A payment against a credit.
 *
 * No instalment is named. The service allocates oldest-first, deliberately: an
 * officer choosing which month a payment lands on is how arrears get hidden
 * behind an up-to-date-looking final instalment.
 */
export const creditPaymentSchema = z.object({
  amount: money(),
  /// True takes it out of the member's savings; false records a cash payment.
  fromSavings: z.boolean(),
  channel: z
    .enum([
      "CASH",
      "BANK_TRANSFER",
      "MOBILE_MONEY",
      "CHEQUE",
      "INTERNAL_TRANSFER",
      "OTHER",
    ])
    .optional(),
  note: optionalText(500),
  occurredAt: optionalDate,
});

export const waiveCreditFineSchema = z.object({ reason });
export const writeOffCreditSchema = z.object({ reason });

export type CreditPaymentInput = z.infer<typeof creditPaymentSchema>;
export type WaiveCreditFineInput = z.infer<typeof waiveCreditFineSchema>;
export type WriteOffCreditInput = z.infer<typeof writeOffCreditSchema>;

export type CreateWarehouseItemInput = z.infer<typeof createWarehouseItemSchema>;
export type UpdateWarehouseItemInput = z.infer<typeof updateWarehouseItemSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type WriteOffStockInput = z.infer<typeof writeOffStockSchema>;
export type IssueGoodsInput = z.infer<typeof issueGoodsSchema>;
export type ReturnGoodsInput = z.infer<typeof returnGoodsSchema>;
export type SettleIssuanceInput = z.infer<typeof settleIssuanceSchema>;

// Re-exported so a form can show the same scale limits the parser enforces
// without importing two modules to find out.
export { MONEY_SCALE, QUANTITY_SCALE };
