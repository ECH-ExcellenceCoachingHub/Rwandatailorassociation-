import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * The permission catalogue.
 *
 * Deliberately NOT server-only — the dashboard imports it to decide which nav
 * items and buttons to render. That is a convenience, never a control: hiding
 * a button stops nobody who can open devtools. Every permission listed here is
 * re-checked on the server inside the route handler that performs the action.
 * See lib/auth/guards.ts, which is where the decision actually binds.
 */

export const PERMISSIONS = {
  // Members ----------------------------------------------------------------
  MEMBERS_VIEW: "members.view",
  MEMBERS_CREATE: "members.create",
  MEMBERS_UPDATE: "members.update",
  MEMBERS_APPROVE: "members.approve",
  MEMBERS_SUSPEND: "members.suspend",
  MEMBERS_VERIFY_KYC: "members.verify_kyc",
  MEMBERS_EXPORT: "members.export",
  /// Taking somebody off the register: closing a membership, or erasing a
  /// record that never held money. Kept apart from MEMBERS_SUSPEND because
  /// suspension is a pause and this is an ending.
  MEMBERS_DELETE: "members.delete",

  // Savings ----------------------------------------------------------------
  SAVINGS_VIEW_OWN: "savings.view_own",
  SAVINGS_VIEW_ALL: "savings.view_all",
  SAVINGS_DEPOSIT: "savings.deposit",
  SAVINGS_POST_MANUAL: "savings.post_manual",
  /// The most dangerous permission in the system: it moves a balance by hand.
  /// Separated from ordinary posting so it can be granted to almost nobody.
  SAVINGS_ADJUST: "savings.adjust",
  SAVINGS_REVERSE: "savings.reverse",
  SAVINGS_EXPORT: "savings.export",

  // Withdrawals ------------------------------------------------------------
  WITHDRAWALS_REQUEST: "withdrawals.request",
  WITHDRAWALS_VIEW_OWN: "withdrawals.view_own",
  WITHDRAWALS_VIEW_ALL: "withdrawals.view_all",
  WITHDRAWALS_REVIEW: "withdrawals.review",
  WITHDRAWALS_APPROVE: "withdrawals.approve",
  WITHDRAWALS_PROCESS: "withdrawals.process",

  // Loans ------------------------------------------------------------------
  LOANS_APPLY: "loans.apply",
  LOANS_VIEW_OWN: "loans.view_own",
  LOANS_VIEW_ALL: "loans.view_all",
  LOANS_REVIEW: "loans.review",
  LOANS_APPROVE: "loans.approve",
  LOANS_REJECT: "loans.reject",
  LOANS_DISBURSE: "loans.disburse",
  LOANS_RESTRUCTURE: "loans.restructure",
  LOANS_WRITE_OFF: "loans.write_off",
  LOANS_RECORD_REPAYMENT: "loans.record_repayment",
  LOANS_WAIVE: "loans.waive",
  /// Correct a loan's outstanding figures by hand when the automatic
  /// bookkeeping got them wrong. Always with a written reason, always audited.
  LOANS_ADJUST: "loans.adjust",
  LOAN_PRODUCTS_MANAGE: "loan_products.manage",

  // Payments ---------------------------------------------------------------
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_RECONCILE: "payments.reconcile",
  PAYMENTS_MATCH_MANUAL: "payments.match_manual",
  PAYMENTS_RETRY: "payments.retry",
  PAYMENTS_FLAG: "payments.flag",

  // BK Transactions --------------------------------------------------------
  BK_VIEW: "bk.view",
  BK_SYNC: "bk.sync",
  BK_MATCH_MANUAL: "bk.match_manual",
  BK_CLAIM: "bk.claim",
  BK_CONFIGURE: "bk.configure",

  // Reports ----------------------------------------------------------------
  REPORTS_VIEW_OWN: "reports.view_own",
  REPORTS_VIEW_ASSOCIATION: "reports.view_association",
  REPORTS_VIEW_PLATFORM: "reports.view_platform",
  REPORTS_EXPORT: "reports.export",

  // Notifications ----------------------------------------------------------
  NOTIFICATIONS_VIEW_OWN: "notifications.view_own",
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATIONS_BROADCAST: "notifications.broadcast",

  // Association finances ---------------------------------------------------
  // The association's OWN money: what it borrowed from a bank and what it put
  // the money into. No `_own` counterpart exists because there is nothing
  // personal here — the member-facing view of these records is open to every
  // member by virtue of membership, not by a grant. These control who may see
  // the unpublished ones and who may write them.
  BORROWINGS_VIEW: "borrowings.view",
  BORROWINGS_MANAGE: "borrowings.manage",
  INVESTMENTS_VIEW: "investments.view",
  INVESTMENTS_MANAGE: "investments.manage",

  // The warehouse ----------------------------------------------------------
  // Association property held in a form that is not cash. Split four ways
  // rather than two because the acts differ in what they can cost: seeing the
  // stock book is routine, handing goods to a member creates a debt on their
  // file, and correcting the count is how a shortfall gets papered over.
  WAREHOUSE_VIEW: "warehouse.view",
  /// The catalogue and incoming stock: adding an item, recording a delivery.
  WAREHOUSE_MANAGE: "warehouse.manage",
  /// Handing goods to a member, and taking them back.
  WAREHOUSE_ISSUE: "warehouse.issue",
  /// Correcting the count, and writing stock off to loss. Kept apart for the
  /// same reason as SAVINGS_ADJUST: this is the permission that can make a
  /// discrepancy disappear.
  WAREHOUSE_ADJUST: "warehouse.adjust",

  // The rulebook and contribution discipline --------------------------------
  // No `_own` counterpart for RULES_VIEW: the rules are open to every member
  // by virtue of membership, not by a grant, and the member-facing page has no
  // permission check at all. These control who may AMEND the rules everyone
  // lives under, and who may act on a member's arrears.
  RULES_MANAGE: "rules.manage",
  COMPLIANCE_VIEW: "compliance.view",
  /// Charging a fine to somebody's savings, or forgiving one. Kept apart from
  /// COMPLIANCE_VIEW because seeing who is behind and taking money from them
  /// are different levels of trust.
  COMPLIANCE_ACT: "compliance.act",
  /// The platform's service fee: seeing what has been collected on the
  /// operator's behalf, and recording that it has been paid over.
  PLATFORM_FEES_VIEW: "platform_fees.view",
  PLATFORM_FEES_REMIT: "platform_fees.remit",

  // Association / platform administration -----------------------------------
  ASSOCIATION_VIEW: "association.view",
  ASSOCIATION_UPDATE: "association.update",
  ASSOCIATION_SETTINGS: "association.settings",
  ASSOCIATIONS_MANAGE_ALL: "associations.manage_all",

  ADMINS_VIEW: "admins.view",
  ADMINS_CREATE: "admins.create",
  ADMINS_UPDATE: "admins.update",
  ADMINS_SUSPEND: "admins.suspend",
  PERMISSIONS_MANAGE: "permissions.manage",

  // System -----------------------------------------------------------------
  AUDIT_VIEW: "audit.view",
  AUDIT_VIEW_PLATFORM: "audit.view_platform",
  SETTINGS_PLATFORM: "settings.platform",
  INTEGRATIONS_MANAGE: "integrations.manage",
  JOBS_VIEW: "jobs.view",
  JOBS_TRIGGER: "jobs.trigger",
  DOCUMENTS_VIEW: "documents.view",
  DOCUMENTS_UPLOAD: "documents.upload",
  DOCUMENTS_VERIFY: "documents.verify",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];

/** Human-readable metadata, used by the super-admin permissions screen. */
export const PERMISSION_METADATA: Record<
  PermissionCode,
  { name: string; category: string; description: string }
> = {
  [PERMISSIONS.MEMBERS_VIEW]: { name: "View members", category: "Members", description: "See the member register and individual member files" },
  [PERMISSIONS.MEMBERS_CREATE]: { name: "Create members", category: "Members", description: "Register a new member directly" },
  [PERMISSIONS.MEMBERS_UPDATE]: { name: "Edit members", category: "Members", description: "Change member details" },
  [PERMISSIONS.MEMBERS_APPROVE]: { name: "Approve registrations", category: "Members", description: "Admit a pending applicant into the association" },
  [PERMISSIONS.MEMBERS_SUSPEND]: { name: "Suspend members", category: "Members", description: "Suspend or reactivate a member account" },
  [PERMISSIONS.MEMBERS_VERIFY_KYC]: { name: "Verify identity", category: "Members", description: "Mark a member's identity documents as verified" },
  [PERMISSIONS.MEMBERS_EXPORT]: { name: "Export members", category: "Members", description: "Download the member register" },
  [PERMISSIONS.MEMBERS_DELETE]: { name: "Remove members", category: "Members", description: "Close a membership, or permanently delete a member with their login and every record against them — always with a written reason" },

  [PERMISSIONS.SAVINGS_VIEW_OWN]: { name: "View own savings", category: "Savings", description: "See your own balance and transactions" },
  [PERMISSIONS.SAVINGS_VIEW_ALL]: { name: "View all savings", category: "Savings", description: "See every member's savings in the association" },
  [PERMISSIONS.SAVINGS_DEPOSIT]: { name: "Make deposits", category: "Savings", description: "Initiate a savings contribution" },
  [PERMISSIONS.SAVINGS_POST_MANUAL]: { name: "Post manual transactions", category: "Savings", description: "Record a cash or offline deposit" },
  [PERMISSIONS.SAVINGS_ADJUST]: { name: "Adjust balances", category: "Savings", description: "Post a corrective adjustment — requires a written reason and is always audited" },
  [PERMISSIONS.SAVINGS_REVERSE]: { name: "Reverse transactions", category: "Savings", description: "Reverse a posted transaction by contra entry" },
  [PERMISSIONS.SAVINGS_EXPORT]: { name: "Export transactions", category: "Savings", description: "Download transaction data" },

  [PERMISSIONS.WITHDRAWALS_REQUEST]: { name: "Request withdrawal", category: "Withdrawals", description: "Submit a withdrawal request" },
  [PERMISSIONS.WITHDRAWALS_VIEW_OWN]: { name: "View own withdrawals", category: "Withdrawals", description: "Track your own withdrawal requests" },
  [PERMISSIONS.WITHDRAWALS_VIEW_ALL]: { name: "View all withdrawals", category: "Withdrawals", description: "See every withdrawal request" },
  [PERMISSIONS.WITHDRAWALS_REVIEW]: { name: "Review withdrawals", category: "Withdrawals", description: "Assess a withdrawal request" },
  [PERMISSIONS.WITHDRAWALS_APPROVE]: { name: "Approve withdrawals", category: "Withdrawals", description: "Approve or reject a withdrawal" },
  [PERMISSIONS.WITHDRAWALS_PROCESS]: { name: "Process payouts", category: "Withdrawals", description: "Mark an approved withdrawal as paid out" },

  [PERMISSIONS.LOANS_APPLY]: { name: "Apply for loans", category: "Loans", description: "Submit a loan application" },
  [PERMISSIONS.LOANS_VIEW_OWN]: { name: "View own loans", category: "Loans", description: "See your loans and repayment schedule" },
  [PERMISSIONS.LOANS_VIEW_ALL]: { name: "View all loans", category: "Loans", description: "See the whole loan portfolio" },
  [PERMISSIONS.LOANS_REVIEW]: { name: "Review applications", category: "Loans", description: "Assess applications and request more information" },
  [PERMISSIONS.LOANS_APPROVE]: { name: "Approve loans", category: "Loans", description: "Approve an application and set final terms" },
  [PERMISSIONS.LOANS_REJECT]: { name: "Reject loans", category: "Loans", description: "Decline a loan application" },
  [PERMISSIONS.LOANS_DISBURSE]: { name: "Disburse loans", category: "Loans", description: "Record disbursement and generate the schedule" },
  [PERMISSIONS.LOANS_RESTRUCTURE]: { name: "Restructure loans", category: "Loans", description: "Reschedule an existing loan" },
  [PERMISSIONS.LOANS_WRITE_OFF]: { name: "Write off loans", category: "Loans", description: "Write off an unrecoverable loan" },
  [PERMISSIONS.LOANS_RECORD_REPAYMENT]: { name: "Record repayments", category: "Loans", description: "Post a repayment against a loan" },
  [PERMISSIONS.LOANS_WAIVE]: { name: "Waive charges", category: "Loans", description: "Waive penalties or interest" },
  [PERMISSIONS.LOANS_ADJUST]: { name: "Correct loan balances", category: "Loans", description: "Correct a loan's outstanding principal, interest, fees or penalty — requires a written reason and is always audited" },
  [PERMISSIONS.LOAN_PRODUCTS_MANAGE]: { name: "Manage loan products", category: "Loans", description: "Configure loan rules, rates and limits" },

  [PERMISSIONS.PAYMENTS_VIEW]: { name: "View payments", category: "Payments", description: "See inbound payment records" },
  [PERMISSIONS.PAYMENTS_RECONCILE]: { name: "Reconcile payments", category: "Payments", description: "Run and review reconciliation" },
  [PERMISSIONS.PAYMENTS_MATCH_MANUAL]: { name: "Match payments manually", category: "Payments", description: "Assign an unmatched payment to a member" },
  [PERMISSIONS.PAYMENTS_RETRY]: { name: "Retry payments", category: "Payments", description: "Re-attempt processing of a failed payment" },
  [PERMISSIONS.PAYMENTS_FLAG]: { name: "Flag payments", category: "Payments", description: "Mark a payment as suspicious" },

  [PERMISSIONS.BK_VIEW]: { name: "View BK transactions", category: "BK Integration", description: "View Bank of Kigali transactions" },
  [PERMISSIONS.BK_SYNC]: { name: "Sync BK transactions", category: "BK Integration", description: "Trigger BK transaction synchronization" },
  [PERMISSIONS.BK_MATCH_MANUAL]: { name: "Match BK transactions", category: "BK Integration", description: "Manually match BK transactions to members" },
  [PERMISSIONS.BK_CLAIM]: { name: "Claim BK payments", category: "BK Integration", description: "Register a payment claim with Bank of Kigali" },
  [PERMISSIONS.BK_CONFIGURE]: { name: "Configure BK integration", category: "BK Integration", description: "Configure BK API settings and credentials" },

  [PERMISSIONS.REPORTS_VIEW_OWN]: { name: "View own statements", category: "Reports", description: "Download your own statements" },
  [PERMISSIONS.REPORTS_VIEW_ASSOCIATION]: { name: "Association reports", category: "Reports", description: "View association-wide reports" },
  [PERMISSIONS.REPORTS_VIEW_PLATFORM]: { name: "Platform reports", category: "Reports", description: "View reports across all associations" },
  [PERMISSIONS.REPORTS_EXPORT]: { name: "Export reports", category: "Reports", description: "Download reports as CSV, Excel or PDF" },

  [PERMISSIONS.NOTIFICATIONS_VIEW_OWN]: { name: "View notifications", category: "Notifications", description: "See your own notifications" },
  [PERMISSIONS.NOTIFICATIONS_SEND]: { name: "Send notifications", category: "Notifications", description: "Message individual members" },
  [PERMISSIONS.NOTIFICATIONS_BROADCAST]: { name: "Broadcast", category: "Notifications", description: "Message all members at once" },

  [PERMISSIONS.BORROWINGS_VIEW]: { name: "View borrowings", category: "Association finances", description: "See every facility the association has taken from a bank, including unpublished ones" },
  [PERMISSIONS.BORROWINGS_MANAGE]: { name: "Manage borrowings", category: "Association finances", description: "Record a new bank facility, its repayments, and what members are told about it" },
  [PERMISSIONS.INVESTMENTS_VIEW]: { name: "View investments", category: "Association finances", description: "See everything the association has put money into, including unpublished entries" },
  [PERMISSIONS.INVESTMENTS_MANAGE]: { name: "Manage investments", category: "Association finances", description: "Record what the association invested in, what it returned, and the benefit to members" },

  [PERMISSIONS.WAREHOUSE_VIEW]: { name: "View the warehouse", category: "Warehouse", description: "See what stock the association holds, what it is worth, and what members have taken" },
  [PERMISSIONS.WAREHOUSE_MANAGE]: { name: "Manage stock", category: "Warehouse", description: "Add items to the catalogue, change their price, and record deliveries coming in" },
  [PERMISSIONS.WAREHOUSE_ISSUE]: { name: "Issue and receive goods", category: "Warehouse", description: "Hand fabric, machines or tools to a member, and record what comes back" },
  [PERMISSIONS.WAREHOUSE_ADJUST]: { name: "Correct stock", category: "Warehouse", description: "Adjust the counted quantity after a stock take, or write stock off as lost or damaged — every correction needs a reason" },

  [PERMISSIONS.RULES_MANAGE]: { name: "Amend the rulebook", category: "Rules & discipline", description: "Change what members save, what the fine is, who may borrow and on what terms — every change is recorded with a reason" },
  [PERMISSIONS.COMPLIANCE_VIEW]: { name: "View contribution standing", category: "Rules & discipline", description: "See who is up to date on the daily saving, who is behind, and what fines are owed" },
  [PERMISSIONS.COMPLIANCE_ACT]: { name: "Act on arrears", category: "Rules & discipline", description: "Collect a fine from a member's savings, waive one, or excuse a member from contributing" },
  [PERMISSIONS.PLATFORM_FEES_VIEW]: { name: "View service fees", category: "Rules & discipline", description: "See the platform service fee collected from members and what is owed to the operator" },
  [PERMISSIONS.PLATFORM_FEES_REMIT]: { name: "Record fee remittance", category: "Rules & discipline", description: "Mark collected service fees as paid over to the platform operator" },

  [PERMISSIONS.ASSOCIATION_VIEW]: { name: "View association", category: "Association", description: "See association details" },
  [PERMISSIONS.ASSOCIATION_UPDATE]: { name: "Edit association", category: "Association", description: "Change association profile and contact details" },
  [PERMISSIONS.ASSOCIATION_SETTINGS]: { name: "Association settings", category: "Association", description: "Configure savings rules, fees and notification settings" },
  [PERMISSIONS.ASSOCIATIONS_MANAGE_ALL]: { name: "Manage all associations", category: "Platform", description: "Create and administer every association on the platform" },

  [PERMISSIONS.ADMINS_VIEW]: { name: "View admins", category: "Administration", description: "See administrator accounts" },
  [PERMISSIONS.ADMINS_CREATE]: { name: "Create admins", category: "Administration", description: "Add an administrator" },
  [PERMISSIONS.ADMINS_UPDATE]: { name: "Edit admins", category: "Administration", description: "Change administrator details" },
  [PERMISSIONS.ADMINS_SUSPEND]: { name: "Suspend admins", category: "Administration", description: "Disable an administrator account" },
  [PERMISSIONS.PERMISSIONS_MANAGE]: { name: "Manage permissions", category: "Administration", description: "Grant or revoke individual permissions" },

  [PERMISSIONS.AUDIT_VIEW]: { name: "View audit log", category: "System", description: "Read the association's audit trail" },
  [PERMISSIONS.AUDIT_VIEW_PLATFORM]: { name: "Platform audit log", category: "System", description: "Read the platform-wide audit trail" },
  [PERMISSIONS.SETTINGS_PLATFORM]: { name: "Platform settings", category: "System", description: "Change global system configuration" },
  [PERMISSIONS.INTEGRATIONS_MANAGE]: { name: "Manage integrations", category: "System", description: "Configure and monitor payment and messaging integrations" },
  [PERMISSIONS.JOBS_VIEW]: { name: "View jobs", category: "System", description: "See background job history" },
  [PERMISSIONS.JOBS_TRIGGER]: { name: "Trigger jobs", category: "System", description: "Run a background job on demand" },
  [PERMISSIONS.DOCUMENTS_VIEW]: { name: "View documents", category: "Documents", description: "Open uploaded documents" },
  [PERMISSIONS.DOCUMENTS_UPLOAD]: { name: "Upload documents", category: "Documents", description: "Attach documents to a member or application" },
  [PERMISSIONS.DOCUMENTS_VERIFY]: { name: "Verify documents", category: "Documents", description: "Approve or reject an uploaded document" },
};

/**
 * Default grants per role.
 *
 * A MEMBER's set is intentionally tiny and entirely self-scoped — every
 * permission they hold ends in `_own` or acts only on their own records. There
 * is no member-facing permission that can read another member's data, which is
 * what makes "members must never access admin pages" structural rather than a
 * matter of routing.
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  MEMBER: [
    PERMISSIONS.SAVINGS_VIEW_OWN,
    PERMISSIONS.SAVINGS_DEPOSIT,
    PERMISSIONS.WITHDRAWALS_REQUEST,
    PERMISSIONS.WITHDRAWALS_VIEW_OWN,
    PERMISSIONS.LOANS_APPLY,
    PERMISSIONS.LOANS_VIEW_OWN,
    PERMISSIONS.REPORTS_VIEW_OWN,
    PERMISSIONS.NOTIFICATIONS_VIEW_OWN,
    PERMISSIONS.DOCUMENTS_UPLOAD,
  ],

  ADMIN: [
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_CREATE,
    PERMISSIONS.MEMBERS_UPDATE,
    PERMISSIONS.MEMBERS_APPROVE,
    PERMISSIONS.MEMBERS_SUSPEND,
    PERMISSIONS.MEMBERS_VERIFY_KYC,
    PERMISSIONS.MEMBERS_EXPORT,
    PERMISSIONS.MEMBERS_DELETE,

    PERMISSIONS.SAVINGS_VIEW_ALL,
    PERMISSIONS.SAVINGS_POST_MANUAL,
    PERMISSIONS.SAVINGS_EXPORT,
    // SAVINGS_ADJUST and SAVINGS_REVERSE are deliberately withheld from the
    // default admin role. They rewrite financial history and must be granted
    // deliberately, per person, by a super admin.

    PERMISSIONS.WITHDRAWALS_VIEW_ALL,
    PERMISSIONS.WITHDRAWALS_REVIEW,
    PERMISSIONS.WITHDRAWALS_APPROVE,
    PERMISSIONS.WITHDRAWALS_PROCESS,

    PERMISSIONS.LOANS_VIEW_ALL,
    PERMISSIONS.LOANS_REVIEW,
    PERMISSIONS.LOANS_APPROVE,
    PERMISSIONS.LOANS_REJECT,
    PERMISSIONS.LOANS_DISBURSE,
    PERMISSIONS.LOANS_RECORD_REPAYMENT,
    // LOANS_ADJUST is withheld for the same reason as SAVINGS_ADJUST.
    PERMISSIONS.LOAN_PRODUCTS_MANAGE,

    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_RECONCILE,
    PERMISSIONS.PAYMENTS_MATCH_MANUAL,
    PERMISSIONS.PAYMENTS_RETRY,
    PERMISSIONS.PAYMENTS_FLAG,

    PERMISSIONS.BK_VIEW,
    PERMISSIONS.BK_SYNC,
    PERMISSIONS.BK_MATCH_MANUAL,
    PERMISSIONS.BK_CLAIM,

    PERMISSIONS.REPORTS_VIEW_ASSOCIATION,
    PERMISSIONS.REPORTS_EXPORT,

    PERMISSIONS.NOTIFICATIONS_VIEW_OWN,
    PERMISSIONS.NOTIFICATIONS_SEND,
    PERMISSIONS.NOTIFICATIONS_BROADCAST,

    PERMISSIONS.BORROWINGS_VIEW,
    PERMISSIONS.BORROWINGS_MANAGE,
    PERMISSIONS.INVESTMENTS_VIEW,
    PERMISSIONS.INVESTMENTS_MANAGE,

    PERMISSIONS.WAREHOUSE_VIEW,
    PERMISSIONS.WAREHOUSE_MANAGE,
    PERMISSIONS.WAREHOUSE_ISSUE,
    // WAREHOUSE_ADJUST is deliberately withheld from the default admin role,
    // for the same reason as SAVINGS_ADJUST: the person who issues stock
    // should not also be the person who can quietly correct the count that
    // would reveal a shortfall. Granted per person.

    PERMISSIONS.RULES_MANAGE,
    PERMISSIONS.COMPLIANCE_VIEW,
    PERMISSIONS.COMPLIANCE_ACT,
    PERMISSIONS.PLATFORM_FEES_VIEW,
    // PLATFORM_FEES_REMIT is deliberately withheld from the default admin
    // role. Declaring the operator's fee paid is a statement about money that
    // left the association's hands, and it should be made by whoever actually
    // makes that payment — granted per person, like SAVINGS_ADJUST.

    PERMISSIONS.ASSOCIATION_VIEW,
    PERMISSIONS.ASSOCIATION_UPDATE,
    PERMISSIONS.ASSOCIATION_SETTINGS,

    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VERIFY,
  ],

  // Super admin holds everything. Enumerated from the catalogue rather than
  // special-cased, so a newly added permission is covered automatically.
  SUPER_ADMIN: ALL_PERMISSIONS,
};

/**
 * Resolves a user's effective permissions: role defaults, plus explicit
 * grants, minus explicit revocations.
 *
 * Revocations win over grants. If two rules disagree about whether someone may
 * adjust a balance, the safe answer is no.
 */
export function resolvePermissions(
  role: UserRole,
  overrides: { code: string; granted: boolean }[] = []
): Set<string> {
  const effective = new Set<string>(ROLE_PERMISSIONS[role]);

  for (const override of overrides) {
    if (override.granted) effective.add(override.code);
  }
  for (const override of overrides) {
    if (!override.granted) effective.delete(override.code);
  }

  return effective;
}

export function hasPermission(
  permissions: Set<string> | string[],
  required: PermissionCode
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(required);
}

export function hasAnyPermission(
  permissions: Set<string> | string[],
  required: PermissionCode[]
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return required.some((p) => set.has(p));
}

export function hasAllPermissions(
  permissions: Set<string> | string[],
  required: PermissionCode[]
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return required.every((p) => set.has(p));
}

/** A role's own dashboard, used by the role guard and as the way onward from
 *  the account status page. */
export const ROLE_HOME: Record<UserRole, string> = {
  MEMBER: "/dashboard",
  ADMIN: "/admin",
  SUPER_ADMIN: "/super-admin",
};

/**
 * Where a role lands straight after signing in.
 *
 * A member arriving has one question — where do I stand — and the account
 * status page answers it in full, so they start there, the same as after a QR
 * sign-in. Staff land on the console they came to work in.
 */
export const ROLE_LANDING: Record<UserRole, string> = {
  MEMBER: "/account/status",
  ADMIN: ROLE_HOME.ADMIN,
  SUPER_ADMIN: ROLE_HOME.SUPER_ADMIN,
};
