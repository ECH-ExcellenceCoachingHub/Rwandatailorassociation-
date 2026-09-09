"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { cn } from "@/lib/utils";

/**
 * Status pill with a consistent colour language across the whole platform.
 *
 * The mapping is centralised so that "OVERDUE" is the same red everywhere it
 * appears — in a member's loan list, an admin's portfolio table and a report.
 * Inconsistent status colours are how people misread a financial screen.
 *
 * Colour is never the only signal: the label is always spelled out, which is
 * what carries the meaning for colour-blind users and in printed statements.
 *
 * A client component purely so it can reach the reader's language: the words
 * live in lib/i18n/dashboard/status.ts, and rendering an untranslated
 * "OVERDUE" beside an otherwise Kinyarwanda page is exactly the sentence a
 * member most needs to understand. It takes only serialisable props, so the
 * server components that render it in tables are unaffected.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "pending";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-ink/12 bg-ink/[0.04] text-ink-muted",
  info: "border-primary/25 bg-primary-50 text-primary-hover",
  success: "border-success/30 bg-success/10 text-emerald-700",
  warning: "border-gold/40 bg-gold/10 text-amber-800",
  danger: "border-red-300 bg-red-50 text-red-700",
  pending: "border-slate-300 bg-slate-100 text-slate-600",
};

/**
 * Every status value the system can display, mapped to a tone. The words that
 * go with them are in the dictionary, keyed by the same enum value; a status
 * with a tone but no translation falls back to the humanised enum, so a new
 * database value degrades visibly rather than silently.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  // Generic lifecycle
  ACTIVE: "success",
  INACTIVE: "neutral",
  PENDING: "pending",
  PENDING_APPROVAL: "pending",
  PENDING_VERIFICATION: "pending",
  SUSPENDED: "danger",
  DISABLED: "danger",
  LOCKED: "danger",
  EXITED: "neutral",
  REJECTED: "danger",
  CANCELLED: "neutral",
  ARCHIVED: "neutral",

  // KYC
  UNVERIFIED: "warning",
  VERIFIED: "success",

  // Transactions
  COMPLETED: "success",
  FAILED: "danger",
  REVERSED: "warning",

  // Transaction types
  DEPOSIT: "success",
  WITHDRAWAL: "warning",
  LOAN_DISBURSEMENT: "info",
  LOAN_REPAYMENT: "info",
  PENALTY: "danger",
  INTEREST: "success",
  FEE: "warning",
  ADJUSTMENT: "warning",
  REVERSAL: "warning",
  OTHER: "neutral",

  // Payments
  RECEIVED: "info",
  UNMATCHED: "warning",
  MATCHED: "info",
  PROCESSED: "success",
  DUPLICATE: "neutral",

  // Payment channels
  MOBILE_MONEY: "info",
  BANK_TRANSFER: "info",
  CASH: "neutral",
  CHEQUE: "neutral",
  INTERNAL: "neutral",

  // Withdrawals
  UNDER_REVIEW: "info",
  APPROVED: "success",
  PROCESSING: "info",

  // Loan applications
  DRAFT: "neutral",
  SUBMITTED: "info",
  MORE_INFORMATION_REQUIRED: "warning",

  // Loans
  PENDING_DISBURSEMENT: "pending",
  DISBURSED: "info",
  OVERDUE: "danger",
  DEFAULTED: "danger",
  WRITTEN_OFF: "neutral",
  RESTRUCTURED: "info",

  // Instalments
  UPCOMING: "neutral",
  DUE: "warning",
  PARTIALLY_PAID: "info",
  PAID: "success",
  WAIVED: "neutral",

  // Jobs
  RUNNING: "info",
  SUCCESS: "success",
  PARTIAL: "warning",
  SKIPPED: "neutral",

  // Investments. PLANNED reads as "not started yet", which is the same
  // promise-not-yet-kept as a pending record elsewhere; PAUSED is a warning
  // because a member seeing it is entitled to ask why.
  PLANNED: "pending",
  PAUSED: "warning",

  // Contribution standing. AT_RISK is amber rather than red because the member
  // still has days in hand; FINABLE is red because the fine lands tonight.
  CURRENT: "success",
  AT_RISK: "warning",
  BEHIND: "warning",
  FINABLE: "danger",
  EXEMPT: "neutral",

  // Warehouse. CHARGED is a warning and not a danger: owing for goods is the
  // normal state of a purchase on credit, not a problem in itself.
  ISSUED: "info",
  PARTIALLY_RETURNED: "info",
  RETURNED: "success",
  CHARGED: "warning",
  SETTLED: "success",
  PURCHASE: "neutral",
  // Goods bought on credit. Neutral like PURCHASE: taking a machine on terms
  // is an arrangement the association offers, not a mark against the member.
  // The warning lives on the instalment that goes unpaid, not on the terms.
  CREDIT: "neutral",
  LOAN_OUT: "info",
  AGAINST_LOAN: "info",
  FREE_ISSUE: "neutral",

  RECEIPT: "success",
  ISSUE: "info",
  RETURN: "success",

  // Roles
  MEMBER: "neutral",
  ADMIN: "info",
  SUPER_ADMIN: "warning",
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? "neutral";
}

export function StatusBadge({
  status,
  tone,
  label,
  size = "default",
  className,
}: {
  status: string;
  /// Override the mapped tone, e.g. to flag a technically-active loan as at risk.
  tone?: StatusTone;
  label?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const { d } = useLanguage();
  const resolvedTone = tone ?? statusTone(status);
  const resolvedLabel = label ?? statusLabel(status, d.status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        TONE_CLASSES[resolvedTone],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          resolvedTone === "success" && "bg-success",
          resolvedTone === "danger" && "bg-red-500",
          resolvedTone === "warning" && "bg-gold",
          resolvedTone === "info" && "bg-primary",
          resolvedTone === "pending" && "bg-slate-400",
          resolvedTone === "neutral" && "bg-ink-muted"
        )}
      />
      {resolvedLabel}
    </span>
  );
}
