import "server-only";
import { headers } from "next/headers";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { logger, serialiseError } from "@/lib/logger";
import type { AuthContext } from "@/lib/auth/session";
import type { AuditSeverity, UserRole } from "@/lib/generated/prisma/enums";

/**
 * Audit trail.
 *
 * The rule this enforces: no consequential action happens without a row here
 * naming who did it, to what, and what changed. For financial mutations the
 * audit write goes inside the same database transaction as the ledger write —
 * pass `tx`. If the transaction rolls back, so does its audit entry, and the
 * two can never disagree about what happened.
 *
 * Non-financial actions (logins, exports, views of sensitive data) may be
 * logged outside a transaction, where a failure to audit must not fail the
 * user's request.
 */

/**
 * Canonical action verbs. Strings rather than a database enum so that adding
 * an action does not require a migration, but centralised here so they stay
 * consistent and greppable.
 */
export const AUDIT_ACTIONS = {
  // Authentication
  USER_LOGGED_IN: "USER_LOGGED_IN",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_LOGGED_OUT: "USER_LOGGED_OUT",
  USER_LOCKED_OUT: "USER_LOCKED_OUT",
  USER_PASSWORD_CHANGED: "USER_PASSWORD_CHANGED",
  USER_PASSWORD_RESET_REQUESTED: "USER_PASSWORD_RESET_REQUESTED",
  USER_PASSWORD_RESET_COMPLETED: "USER_PASSWORD_RESET_COMPLETED",
  /// An administrator replaced a member's password with a temporary one.
  /// Distinct from USER_PASSWORD_RESET_COMPLETED, which the account holder
  /// does themselves from a link: in a dispute, "who last set this password"
  /// must be answerable from the log alone.
  USER_PASSWORD_RESET_BY_ADMIN: "USER_PASSWORD_RESET_BY_ADMIN",
  USER_EMAIL_VERIFIED: "USER_EMAIL_VERIFIED",
  USER_PHONE_VERIFIED: "USER_PHONE_VERIFIED",
  USER_SESSIONS_REVOKED: "USER_SESSIONS_REVOKED",
  /// Someone edited their own details. Deliberately distinct from
  /// MEMBER_UPDATED, which means an administrator edited somebody else's file:
  /// when money later lands in the wrong account, "who changed the matching
  /// key" and "did the account holder change it themselves" are different
  /// questions, and one action verb covering both cannot answer the second.
  USER_PROFILE_UPDATED: "USER_PROFILE_UPDATED",
  /// Printable sign-in QR codes. Issue and revocation are ordinary account
  /// events; a scan is recorded separately from USER_LOGGED_IN so that "how
  /// did this session start" is answerable from the log alone, and a rejected
  /// scan is recorded because a run of them is what a stolen card looks like.
  QR_ACCESS_ISSUED: "QR_ACCESS_ISSUED",
  QR_ACCESS_REVOKED: "QR_ACCESS_REVOKED",
  QR_ACCESS_SIGNED_IN: "QR_ACCESS_SIGNED_IN",
  QR_ACCESS_REJECTED: "QR_ACCESS_REJECTED",

  // Members
  MEMBER_REGISTERED: "MEMBER_REGISTERED",
  MEMBER_APPROVED: "MEMBER_APPROVED",
  MEMBER_REJECTED: "MEMBER_REJECTED",
  MEMBER_UPDATED: "MEMBER_UPDATED",
  MEMBER_SUSPENDED: "MEMBER_SUSPENDED",
  MEMBER_REACTIVATED: "MEMBER_REACTIVATED",
  MEMBER_KYC_VERIFIED: "MEMBER_KYC_VERIFIED",
  MEMBER_KYC_REJECTED: "MEMBER_KYC_REJECTED",
  /// The membership ended; every record it produced is kept.
  MEMBER_EXITED: "MEMBER_EXITED",
  /// A member record that never held money was erased. The whole file is
  /// captured on the audit entry, because afterwards it exists nowhere else.
  MEMBER_DELETED: "MEMBER_DELETED",

  // Savings ledger
  SAVINGS_DEPOSIT_POSTED: "SAVINGS_DEPOSIT_POSTED",
  SAVINGS_WITHDRAWAL_POSTED: "SAVINGS_WITHDRAWAL_POSTED",
  SAVINGS_TRANSACTION_REVERSED: "SAVINGS_TRANSACTION_REVERSED",
  BALANCE_ADJUSTED: "BALANCE_ADJUSTED",

  // Withdrawals
  WITHDRAWAL_REQUESTED: "WITHDRAWAL_REQUESTED",
  WITHDRAWAL_APPROVED: "WITHDRAWAL_APPROVED",
  WITHDRAWAL_REJECTED: "WITHDRAWAL_REJECTED",
  WITHDRAWAL_PROCESSED: "WITHDRAWAL_PROCESSED",

  // Payments
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_VERIFIED: "PAYMENT_VERIFIED",
  PAYMENT_PROCESSED: "PAYMENT_PROCESSED",
  PAYMENT_RECONCILED: "PAYMENT_RECONCILED",
  PAYMENT_MATCHED_MANUALLY: "PAYMENT_MATCHED_MANUALLY",
  PAYMENT_DUPLICATE_REJECTED: "PAYMENT_DUPLICATE_REJECTED",
  PAYMENT_FLAGGED_SUSPICIOUS: "PAYMENT_FLAGGED_SUSPICIOUS",
  PAYMENT_RETRIED: "PAYMENT_RETRIED",
  /// An administrator discarded an unattributable payment from the queue. The
  /// deleted record is captured in full on the audit entry, because the row it
  /// describes no longer exists anywhere else.
  PAYMENT_DELETED: "PAYMENT_DELETED",

  // BK Transactions
  BK_SYNC_STARTED: "BK_SYNC_STARTED",
  BK_SYNC_COMPLETED: "BK_SYNC_COMPLETED",
  BK_SYNC_FAILED: "BK_SYNC_FAILED",
  BK_TRANSACTION_RECEIVED: "BK_TRANSACTION_RECEIVED",
  BK_TRANSACTION_MATCHED: "BK_TRANSACTION_MATCHED",
  BK_TRANSACTION_MATCHED_MANUALLY: "BK_TRANSACTION_MATCHED_MANUALLY",
  BK_TRANSACTION_UNMATCHED: "BK_TRANSACTION_UNMATCHED",
  BK_PAYMENT_CLAIMED: "BK_PAYMENT_CLAIMED",

  // Loans
  LOAN_APPLICATION_SUBMITTED: "LOAN_APPLICATION_SUBMITTED",
  LOAN_APPLICATION_REVIEWED: "LOAN_APPLICATION_REVIEWED",
  LOAN_INFO_REQUESTED: "LOAN_INFO_REQUESTED",
  ADMIN_APPROVED_LOAN: "ADMIN_APPROVED_LOAN",
  ADMIN_REJECTED_LOAN: "ADMIN_REJECTED_LOAN",
  LOAN_DISBURSED: "LOAN_DISBURSED",
  LOAN_REPAYMENT_POSTED: "LOAN_REPAYMENT_POSTED",
  LOAN_RESTRUCTURED: "LOAN_RESTRUCTURED",
  LOAN_WRITTEN_OFF: "LOAN_WRITTEN_OFF",
  LOAN_PENALTY_WAIVED: "LOAN_PENALTY_WAIVED",
  /// An officer corrected a loan's outstanding figures by hand.
  LOAN_BALANCE_ADJUSTED: "LOAN_BALANCE_ADJUSTED",
  LOAN_PRODUCT_UPDATED: "LOAN_PRODUCT_UPDATED",
  /// A guarantor answered, or their held savings were let go. Accepting moves
  /// money out of a member's available balance, so it is audited like one.
  GUARANTEE_ACCEPTED: "GUARANTEE_ACCEPTED",
  GUARANTEE_DECLINED: "GUARANTEE_DECLINED",
  GUARANTEE_RELEASED: "GUARANTEE_RELEASED",

  // Association borrowing & investment
  /// The association took on, changed, or repaid a debt of its own. Kept apart
  /// from the LOAN_* verbs above: those describe money lent to a member, these
  /// describe money the association owes a bank. When a member later asks "who
  /// pledged our savings, and when", one verb covering both cannot answer it.
  BORROWING_RECORDED: "BORROWING_RECORDED",
  BORROWING_UPDATED: "BORROWING_UPDATED",
  BORROWING_REPAYMENT_RECORDED: "BORROWING_REPAYMENT_RECORDED",
  /// Publishing is its own event because hiding a facility from the members
  /// whose savings secure it is a decision someone has to own.
  BORROWING_VISIBILITY_CHANGED: "BORROWING_VISIBILITY_CHANGED",
  INVESTMENT_RECORDED: "INVESTMENT_RECORDED",
  INVESTMENT_UPDATED: "INVESTMENT_UPDATED",
  INVESTMENT_VISIBILITY_CHANGED: "INVESTMENT_VISIBILITY_CHANGED",

  // The warehouse
  /// Association property moving in a form that is not cash. Stock leaving the
  /// store on a member's name is the same kind of event as money leaving their
  /// account, and it is audited to the same standard — including the two verbs
  /// that can make a shortfall vanish, which is why ADJUSTED and WRITTEN_OFF
  /// are separate from the movements that merely record trade.
  WAREHOUSE_ITEM_CREATED: "WAREHOUSE_ITEM_CREATED",
  WAREHOUSE_ITEM_UPDATED: "WAREHOUSE_ITEM_UPDATED",
  WAREHOUSE_STOCK_RECEIVED: "WAREHOUSE_STOCK_RECEIVED",
  WAREHOUSE_STOCK_ADJUSTED: "WAREHOUSE_STOCK_ADJUSTED",
  WAREHOUSE_STOCK_WRITTEN_OFF: "WAREHOUSE_STOCK_WRITTEN_OFF",
  WAREHOUSE_ISSUED: "WAREHOUSE_ISSUED",
  WAREHOUSE_RETURNED: "WAREHOUSE_RETURNED",
  WAREHOUSE_SETTLED: "WAREHOUSE_SETTLED",
  WAREHOUSE_ISSUANCE_CANCELLED: "WAREHOUSE_ISSUANCE_CANCELLED",
  WAREHOUSE_CREDIT_OPENED: "WAREHOUSE_CREDIT_OPENED",
  WAREHOUSE_CREDIT_PAID: "WAREHOUSE_CREDIT_PAID",
  WAREHOUSE_CREDIT_FINE_ASSESSED: "WAREHOUSE_CREDIT_FINE_ASSESSED",
  WAREHOUSE_CREDIT_FINE_WAIVED: "WAREHOUSE_CREDIT_FINE_WAIVED",
  WAREHOUSE_CREDIT_WRITTEN_OFF: "WAREHOUSE_CREDIT_WRITTEN_OFF",

  // The rulebook
  /// A rule the members live under was reworded, retuned or withdrawn. Kept
  /// apart from SETTING_CHANGED, which covers technical configuration nobody
  /// outside the office ever reads: these are the terms of membership, and
  /// "who raised the fine rate, and what reason did they give" is a question
  /// with a different audience and a longer memory.
  RULE_ADDED: "RULE_ADDED",
  RULE_AMENDED: "RULE_AMENDED",
  RULE_REMOVED: "RULE_REMOVED",

  // Contribution discipline
  /// The daily service fee taken from a member's savings. Recorded separately
  /// from SAVINGS_* because the money leaves the association's world entirely
  /// — it is the platform's, and an auditor asking what was collected on whose
  /// behalf must not have to infer it from a fee-typed ledger row.
  PLATFORM_FEE_CHARGED: "PLATFORM_FEE_CHARGED",
  PLATFORM_FEE_WAIVED: "PLATFORM_FEE_WAIVED",
  PLATFORM_FEE_REMITTED: "PLATFORM_FEE_REMITTED",
  CONTRIBUTION_FINE_ASSESSED: "CONTRIBUTION_FINE_ASSESSED",
  CONTRIBUTION_FINE_SETTLED: "CONTRIBUTION_FINE_SETTLED",
  CONTRIBUTION_FINE_WAIVED: "CONTRIBUTION_FINE_WAIVED",
  CONTRIBUTION_FINE_CANCELLED: "CONTRIBUTION_FINE_CANCELLED",
  /// Somebody was excused from contributing, or brought back into it.
  CONTRIBUTION_EXEMPTION_CHANGED: "CONTRIBUTION_EXEMPTION_CHANGED",
  /// Interest collected on a loan was split between the borrower's savings and
  /// the association, per the interest-sharing rule.
  INTEREST_DISTRIBUTED: "INTEREST_DISTRIBUTED",

  // Administration
  SUPER_ADMIN_CREATED_ADMIN: "SUPER_ADMIN_CREATED_ADMIN",
  ADMIN_UPDATED: "ADMIN_UPDATED",
  ADMIN_SUSPENDED: "ADMIN_SUSPENDED",
  PERMISSION_GRANTED: "PERMISSION_GRANTED",
  PERMISSION_REVOKED: "PERMISSION_REVOKED",
  ASSOCIATION_CREATED: "ASSOCIATION_CREATED",
  ASSOCIATION_UPDATED: "ASSOCIATION_UPDATED",
  ASSOCIATION_SUSPENDED: "ASSOCIATION_SUSPENDED",
  SETTING_CHANGED: "SETTING_CHANGED",

  // Access control
  ACCESS_DENIED: "ACCESS_DENIED",
  CROSS_TENANT_ACCESS_BLOCKED: "CROSS_TENANT_ACCESS_BLOCKED",

  // Data
  REPORT_EXPORTED: "REPORT_EXPORTED",
  STATEMENT_DOWNLOADED: "STATEMENT_DOWNLOADED",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  DOCUMENT_VERIFIED: "DOCUMENT_VERIFIED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  associationId?: string | null;
  /// Prior state. Only include the fields that changed — dumping whole rows
  /// bloats the log and buries the signal.
  oldValue?: unknown;
  newValue?: unknown;
  /// Mandatory for financial adjustments; see `requireReason` below.
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  severity?: AuditSeverity;
}

interface Actor {
  id?: string | null;
  role?: UserRole | null;
  email?: string | null;
}

/** Actions that must never be recorded without a written justification. */
const REASON_REQUIRED: ReadonlySet<string> = new Set<string>([
  AUDIT_ACTIONS.BALANCE_ADJUSTED,
  AUDIT_ACTIONS.SAVINGS_TRANSACTION_REVERSED,
  AUDIT_ACTIONS.LOAN_WRITTEN_OFF,
  AUDIT_ACTIONS.LOAN_BALANCE_ADJUSTED,
  AUDIT_ACTIONS.LOAN_PENALTY_WAIVED,
  AUDIT_ACTIONS.WITHDRAWAL_REJECTED,
  AUDIT_ACTIONS.ADMIN_REJECTED_LOAN,
  AUDIT_ACTIONS.MEMBER_SUSPENDED,
  AUDIT_ACTIONS.MEMBER_KYC_REJECTED,
  AUDIT_ACTIONS.MEMBER_EXITED,
  AUDIT_ACTIONS.MEMBER_DELETED,
  AUDIT_ACTIONS.PAYMENT_MATCHED_MANUALLY,
  AUDIT_ACTIONS.PAYMENT_DELETED,
  // Amending the rulebook and forgiving a fine are the two places where an
  // officer's decision costs the association money or costs a member their
  // expectations. Neither may be done anonymously or unexplained.
  AUDIT_ACTIONS.RULE_AMENDED,
  AUDIT_ACTIONS.RULE_REMOVED,
  AUDIT_ACTIONS.CONTRIBUTION_FINE_WAIVED,
  AUDIT_ACTIONS.CONTRIBUTION_FINE_CANCELLED,
  AUDIT_ACTIONS.PLATFORM_FEE_WAIVED,
  AUDIT_ACTIONS.CONTRIBUTION_EXEMPTION_CHANGED,
  // The three warehouse verbs that can make a shortfall disappear: correcting
  // a count, writing stock off to loss, and withdrawing an issue from a
  // member's file. Each is the stock equivalent of a balance adjustment.
  AUDIT_ACTIONS.WAREHOUSE_STOCK_ADJUSTED,
  AUDIT_ACTIONS.WAREHOUSE_STOCK_WRITTEN_OFF,
  AUDIT_ACTIONS.WAREHOUSE_ISSUANCE_CANCELLED,
  AUDIT_ACTIONS.WAREHOUSE_CREDIT_FINE_WAIVED,
  AUDIT_ACTIONS.WAREHOUSE_CREDIT_WRITTEN_OFF,
]);

/** Actions serious enough to stand out when scanning the log. */
const CRITICAL_ACTIONS: ReadonlySet<string> = new Set<string>([
  AUDIT_ACTIONS.BALANCE_ADJUSTED,
  AUDIT_ACTIONS.SAVINGS_TRANSACTION_REVERSED,
  AUDIT_ACTIONS.LOAN_WRITTEN_OFF,
  AUDIT_ACTIONS.LOAN_BALANCE_ADJUSTED,
  AUDIT_ACTIONS.SUPER_ADMIN_CREATED_ADMIN,
  AUDIT_ACTIONS.PERMISSION_GRANTED,
  AUDIT_ACTIONS.PERMISSION_REVOKED,
  AUDIT_ACTIONS.CROSS_TENANT_ACCESS_BLOCKED,
  AUDIT_ACTIONS.PAYMENT_DUPLICATE_REJECTED,
  AUDIT_ACTIONS.PAYMENT_DELETED,
  AUDIT_ACTIONS.MEMBER_DELETED,
  AUDIT_ACTIONS.ASSOCIATION_SUSPENDED,
]);

/** Best-effort capture of request context. Returns nulls outside a request. */
async function getRequestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const headerList = await headers();
    // x-forwarded-for is a client-controllable header; behind a trusted proxy
    // the leftmost entry is the real client. It is recorded as an
    // investigative hint, never as an authorisation input.
    const forwarded = headerList.get("x-forwarded-for");
    const ipAddress =
      forwarded?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null;

    return {
      ipAddress,
      userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
    };
  } catch {
    // Called from the worker or a script — no request to read.
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Writes an audit entry.
 *
 * @param tx Pass the transaction client for financial actions so the audit row
 *           commits or rolls back together with the change it describes.
 */
export async function recordAudit(
  entry: AuditEntry,
  actor: Actor | AuthContext | null,
  tx?: TxClient
): Promise<void> {
  const resolvedActor: Actor = isAuthContext(actor)
    ? {
        id: actor.user.id,
        role: actor.user.role,
        email: actor.user.email,
      }
    : (actor ?? {});

  if (REASON_REQUIRED.has(entry.action) && !entry.reason?.trim()) {
    // A hard failure, not a warning. An adjustment with no stated reason is
    // exactly the silent balance change this system forbids, and letting it
    // through unaudited would defeat the control.
    throw new Error(
      `Audit action ${entry.action} requires a reason — refusing to record it without one`
    );
  }

  const severity: AuditSeverity =
    entry.severity ?? (CRITICAL_ACTIONS.has(entry.action) ? "CRITICAL" : "INFO");

  const { ipAddress, userAgent } = await getRequestContext();

  const client = tx ?? prisma;

  const data = {
    associationId: entry.associationId ?? null,
    actorId: resolvedActor.id ?? null,
    actorRole: resolvedActor.role ?? null,
    actorEmail: resolvedActor.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    oldValue: toJson(entry.oldValue),
    newValue: toJson(entry.newValue),
    reason: entry.reason ?? null,
    metadata: toJson(entry.metadata),
    severity,
    ipAddress,
    userAgent,
  };

  if (tx) {
    // Inside a transaction the audit row is part of the atomic unit. If it
    // cannot be written, the whole operation must fail.
    await client.auditLog.create({ data });
    return;
  }

  try {
    await client.auditLog.create({ data });
  } catch (error) {
    // Outside a transaction, never let an audit failure break the user's
    // request — but make the gap loudly visible in the application log.
    logger.error(
      { action: entry.action, entityType: entry.entityType, ...serialiseError(error) },
      "AUDIT WRITE FAILED"
    );
  }
}

/** Serialises Decimals and Dates into something JSON columns accept. */
function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;

  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && "toFixed" in v && typeof v.toFixed === "function") {
        return (v as { toFixed(dp: number): string }).toFixed(2);
      }
      return v;
    })
  );
}

/**
 * Produces a compact before/after diff of the fields that actually changed.
 * Keeps audit rows readable and avoids storing unchanged PII.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[]
): { oldValue: Partial<T>; newValue: Partial<T> } {
  const oldValue: Partial<T> = {};
  const newValue: Partial<T> = {};

  for (const field of fields) {
    if (!(field in after)) continue;
    const previous = before[field];
    const next = after[field];
    if (String(previous) === String(next)) continue;

    oldValue[field] = previous;
    newValue[field] = next as T[keyof T];
  }

  return { oldValue, newValue };
}

function isAuthContext(value: unknown): value is AuthContext {
  return Boolean(
    value && typeof value === "object" && "user" in value && "permissions" in value
  );
}
