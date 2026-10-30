/**
 * What every association starts with — the savings rule and the standard loan
 * product — shared by the database seed (RTA) and super-admin onboarding (every
 * association after it), so a new association is provisioned on exactly the
 * terms RTA runs on and the two can never drift apart.
 *
 * Plain data, no database access, so the seed script can import it.
 */

/** The SavingsRule row an association is created with. */
export const SAVINGS_RULE_DEFAULTS = {
  minimumDeposit: "500",
  minimumBalance: "0",
  allowWithdrawals: true,
  withdrawalRequiresApproval: true,
  minimumWithdrawal: "5000",
  withdrawalFeeType: "FIXED" as const,
  withdrawalFeeValue: "0",
  withdrawalNoticeDays: 0,
  monthlyContribution: "10000",
  contributionDueDay: 5,
  annualInterestRate: "0",
};

/**
 * THE PRODUCT, EXPRESSED SO THAT ONLY THE RULEBOOK BINDS.
 *
 * Every value here either restates a rule from lib/rules/catalogue.ts or is
 * deliberately made NON-BINDING so the rulebook is the only thing deciding.
 * Where a product column would otherwise impose a second limit the rulebook
 * does not have — a minimum savings balance, a savings multiple, a tenure
 * gate, a guarantor requirement — it is opened up and `assessBorrowing` does
 * the work. RULES_PUBLISHED promises members "there is no second set of
 * rules held anywhere else"; this is what keeping that promise looks like in
 * the product table.
 *
 * Shared between `create` and `update` so that re-running the seed converges
 * an existing row instead of leaving it on the old terms. The previous
 * `update: {}` meant a deployed association kept 18% and its fees forever.
 */
export const LOAN_PRODUCT_RULEBOOK_TERMS = {
  description:
    "Borrow against your own savings, up to three times what you have " +
    "saved. Interest is 2% a month on the amount borrowed, half of which " +
    "is credited back into your savings as you repay. No processing fee, " +
    "no insurance fee. Repaid within three months; whatever is still owed " +
    "after that is charged 7% a month. Up to 80% of your savings needs " +
    "nothing pledged; above that, guarantors or collateral.",

  // LOAN_MONTHLY_INTEREST — "2% a month, worked out on the amount borrowed".
  //
  // Expressed as 24% FLAT a year because `generateSchedule` always reads the
  // rate as annual and IGNORES `interestPeriod` (a plain String column, not
  // an enum). The two are exactly equal, not approximately:
  //     principal × 0.24 × months/12  ≡  principal × 0.02 × months
  // Do NOT "correct" this to interestRate 2 + interestPeriod MONTHLY — the
  // generator would charge a twelfth of the rule and nothing would catch it.
  interestRate: "24",
  interestMethod: "FLAT" as const,
  interestPeriod: "ANNUAL",

  // LOAN_NO_EXTRA_CHARGES — "No processing fee, no insurance fee, no file
  // charge. What you repay is what you borrowed plus the interest above it."
  processingFeeType: "FIXED" as const,
  processingFeeValue: "0",
  insuranceFeeType: "FIXED" as const,
  insuranceFeeValue: "0",

  // LOAN_MAX_TERM_MONTHS — three months (STGT Art. 33). The rulebook value
  // binds in assessBorrowing; this keeps the product from advertising a
  // longer one.
  minTermMonths: 1,
  maxTermMonths: 3,

  // LOAN_REPAYMENT_FREQUENCY — "Repayment is monthly, on the same date each
  // month."
  // Not `as const`: Prisma's update input wants a mutable RepaymentFrequency[]
  // and rejects a readonly tuple.
  allowedFrequencies: ["MONTHLY" as const],
  defaultFrequency: "MONTHLY" as const,

  // NON-BINDING ON PURPOSE. OWN_SAVINGS_PERCENT caps the no-collateral
  // portion at 80% of savings, and COLLATERAL_REQUIRED_ABOVE_SHARE allows
  // more against pledged items. A savingsMultiplier of 0.8 here would cap
  // the product AT the own-share limit and make collateralised borrowing
  // impossible — re-creating the very bug this change exists to fix. It is
  // left wide so that the rulebook, not the product, draws the line.
  minimumSavings: "0",
  savingsMultiplier: "10",
  minimumMembershipMonths: 0,
  minAmount: "0",

  // Nothing in the rulebook requires a guarantor. OWN_SAVINGS_PERCENT says
  // the own-share portion needs "no collateral and no guarantor", and no
  // rule imposes one above it either — that tier asks for collateral.
  requiresGuarantors: false,
  minimumGuarantors: 0,
};

/**
 * The standard loan product. The terms above are converged on every re-seed;
 * these are set once, when the product is created.
 */
export const STANDARD_LOAN_PRODUCT = {
  code: "STD",
  name: "Standard Member Loan",
  isActive: true,
  maxAmount: "5000000",
  penaltyType: "PERCENTAGE" as const,
  penaltyValue: "2",
  penaltyGraceDays: 3,
  gracePeriodDays: 0,
  requiresCollateral: false,
  singleActiveLoan: true,
  ...LOAN_PRODUCT_RULEBOOK_TERMS,
};
