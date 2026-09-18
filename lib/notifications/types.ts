/**
 * Notification channel contract.
 *
 * The SMS provider is expected to change — associations in Rwanda commonly
 * move between Africa's Talking, Twilio and a local aggregator on price. That
 * is why delivery sits behind this interface: swapping provider means writing
 * one adapter, not touching a single line of the code that decides a member
 * should be told something.
 */

export interface SendResult {
  ok: boolean;
  /// The provider's own message id, for tracing a delivery complaint.
  providerMessageId?: string;
  error?: string;
  /// True when a retry might succeed (network blip, rate limit).
  retryable?: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  /// Plain text. Always populated — some recipients never render HTML.
  text: string;
  html?: string;
}

export interface SmsMessage {
  /// E.164.
  to: string;
  /// Kept short deliberately; see the note in the SMS templates.
  body: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SendResult>;
}

/**
 * Every event the platform can notify on.
 *
 * A closed set rather than free strings, so a template, a channel preference
 * and a delivery record can all be keyed off the same value and a typo becomes
 * a compile error instead of a silently undelivered message.
 */
export const NOTIFICATION_EVENTS = {
  MEMBER_REGISTERED: "MEMBER_REGISTERED",
  MEMBER_APPROVED: "MEMBER_APPROVED",
  MEMBER_REJECTED: "MEMBER_REJECTED",
  MEMBER_SUSPENDED: "MEMBER_SUSPENDED",

  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_UNMATCHED: "PAYMENT_UNMATCHED",
  SAVINGS_BALANCE_UPDATED: "SAVINGS_BALANCE_UPDATED",

  /// The daily contribution. CONTRIBUTION_DUE_WARNING is the one that matters:
  /// it goes out BEFORE the fine, naming the exact amount that would clear the
  /// arrears. A platform that fines people it never warned is a platform
  /// members leave.
  CONTRIBUTION_DUE_WARNING: "CONTRIBUTION_DUE_WARNING",
  CONTRIBUTION_FINE_CHARGED: "CONTRIBUTION_FINE_CHARGED",
  CONTRIBUTION_BACK_ON_TRACK: "CONTRIBUTION_BACK_ON_TRACK",
  /// The borrower's own half of the loan interest, credited to their savings.
  INTEREST_SHARE_CREDITED: "INTEREST_SHARE_CREDITED",
  /// A rule the member lives under was amended.
  RULE_CHANGED: "RULE_CHANGED",

  WITHDRAWAL_SUBMITTED: "WITHDRAWAL_SUBMITTED",
  WITHDRAWAL_APPROVED: "WITHDRAWAL_APPROVED",
  WITHDRAWAL_REJECTED: "WITHDRAWAL_REJECTED",
  WITHDRAWAL_PAID: "WITHDRAWAL_PAID",

  LOAN_SUBMITTED: "LOAN_SUBMITTED",
  LOAN_APPROVED: "LOAN_APPROVED",
  LOAN_REJECTED: "LOAN_REJECTED",
  LOAN_INFO_REQUESTED: "LOAN_INFO_REQUESTED",
  LOAN_DISBURSED: "LOAN_DISBURSED",
  LOAN_REPAYMENT_RECEIVED: "LOAN_REPAYMENT_RECEIVED",
  LOAN_REPAYMENT_REMINDER: "LOAN_REPAYMENT_REMINDER",
  LOAN_OVERDUE: "LOAN_OVERDUE",
  LOAN_COMPLETED: "LOAN_COMPLETED",

  /// A member has been named as a guarantor and must accept or decline.
  GUARANTEE_REQUESTED: "GUARANTEE_REQUESTED",
  /// Told to the borrower: a guarantor answered.
  GUARANTEE_ACCEPTED: "GUARANTEE_ACCEPTED",
  GUARANTEE_DECLINED: "GUARANTEE_DECLINED",
  /// Told to the guarantor: the savings they pledged are theirs to use again.
  GUARANTEE_RELEASED: "GUARANTEE_RELEASED",

  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  NEW_LOGIN: "NEW_LOGIN",

  ADMIN_ANNOUNCEMENT: "ADMIN_ANNOUNCEMENT",
} as const;

export type NotificationEvent =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];
