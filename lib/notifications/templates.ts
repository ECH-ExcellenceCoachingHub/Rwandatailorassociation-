import { formatMoney } from "@/lib/money";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "@/lib/notifications/types";
import type { NotificationSeverity } from "@/lib/generated/prisma/enums";

/**
 * Message templates.
 *
 * SMS BREVITY IS A COST DECISION, NOT A STYLE ONE. A segment is 160 GSM-7
 * characters, and every segment over that is billed again — for an association
 * sending repayment reminders to hundreds of members monthly, a sloppy
 * template doubles the bill. The SMS bodies below are written to fit one
 * segment, and they avoid characters that silently force UCS-2 encoding (which
 * would cut the limit to 70): no curly quotes, no en dashes, no emoji.
 *
 * Amounts always appear with their currency, and references are always quoted
 * in full — a member reading an SMS has no other context to work from.
 */

export interface TemplateContext {
  firstName: string;
  associationName: string;
  amount?: string;
  balance?: string;
  reference?: string;
  dueDate?: Date;
  daysOverdue?: number;
  reason?: string;
  actionUrl?: string;
  paymentReference?: string;

  // Contribution discipline. `daysBehind` and `daysUntilFine` are counts, not
  // money, and are rendered as plain numbers.
  daysBehind?: number;
  daysUntilFine?: number;
  /// What the member must pay to be fully up to date, arrears plus any fine.
  clearingAmount?: string;
  fineRate?: string;
  /// The rule that changed, or that a warning is issued under.
  ruleTitle?: string;
  /// The other member in a guarantee: the borrower when telling a guarantor,
  /// the guarantor when telling a borrower.
  counterpartyName?: string;
}

export interface RenderedNotification {
  title: string;
  body: string;
  /// One SMS segment where possible. Omitted when SMS is inappropriate.
  sms?: string;
  emailSubject: string;
  emailText: string;
  severity: NotificationSeverity;
  actionUrl?: string;
}

const shortDate = (date?: Date): string =>
  date
    ? new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** Plain ASCII money for SMS, avoiding characters that force UCS-2. */
const smsMoney = (amount?: string): string =>
  formatMoney(amount ?? "0").replace(/ /g, " ");

export function renderNotification(
  event: NotificationEvent,
  context: TemplateContext
): RenderedNotification {
  const { firstName, associationName } = context;

  switch (event) {
    case NOTIFICATION_EVENTS.MEMBER_REGISTERED:
      return {
        title: "Application received",
        body: `Your membership application has been received and is awaiting approval. Your payment reference is ${context.paymentReference}.`,
        sms: `${associationName}: application received. Your payment reference is ${context.paymentReference}. Keep it safe - quote it on every payment.`,
        emailSubject: `Your ${associationName} membership application`,
        emailText: `Dear ${firstName},\n\nWe have received your membership application.\n\nYour payment reference is ${context.paymentReference}. Please quote it on every payment you make to the association - it is how your contribution is matched to your savings account.\n\nYou will be notified once an administrator has reviewed your application.\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard",
      };

    case NOTIFICATION_EVENTS.MEMBER_APPROVED:
      return {
        title: "Membership approved",
        body: `Welcome to ${associationName}. Your account is now active and you can start saving.`,
        sms: `${associationName}: your membership is approved. Payment reference ${context.paymentReference}. Quote it on every payment.`,
        emailSubject: `Welcome to ${associationName}`,
        emailText: `Dear ${firstName},\n\nYour membership has been approved and your account is now active.\n\nYour payment reference is ${context.paymentReference}. Quote it on every contribution.\n\nYou can now sign in to view your savings, apply for loans and download statements.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard",
      };

    case NOTIFICATION_EVENTS.MEMBER_REJECTED:
      return {
        title: "Membership application declined",
        body: context.reason ?? "Your membership application was not approved.",
        emailSubject: `Your ${associationName} membership application`,
        emailText: `Dear ${firstName},\n\nYour membership application was not approved.\n\nReason: ${context.reason ?? "Not stated"}\n\nPlease contact the association if you would like to discuss this.\n\n${associationName}`,
        severity: "WARNING",
      };

    // The most frequently sent message in the system.
    case NOTIFICATION_EVENTS.PAYMENT_RECEIVED:
      return {
        title: "Payment received",
        body: `We have received ${formatMoney(context.amount)}. Your savings balance is now ${formatMoney(context.balance)}.`,
        sms: `${associationName}: received ${smsMoney(context.amount)}. New balance ${smsMoney(context.balance)}. Ref ${context.reference}.`,
        emailSubject: `Payment received - ${formatMoney(context.amount)}`,
        emailText: `Dear ${firstName},\n\nWe have received your contribution of ${formatMoney(context.amount)}.\n\nTransaction reference: ${context.reference}\nYour savings balance is now ${formatMoney(context.balance)}.\n\nThank you.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/savings/transactions",
      };

    // THE MESSAGE THAT PREVENTS A FINE.
    //
    // Sent while there is still time to act, and written so the member never
    // has to work anything out: how far behind, how long they have, and the
    // single figure that clears it. Everything else in this file reports
    // something that already happened; this one exists to stop something
    // happening, so the amount and the deadline lead.
    case NOTIFICATION_EVENTS.CONTRIBUTION_DUE_WARNING:
      return {
        title:
          context.daysUntilFine === 0
            ? "Your saving is due today"
            : `${context.daysBehind} days behind on saving`,
        body: `You are ${context.daysBehind} day(s) behind on your daily saving. Pay ${formatMoney(context.clearingAmount)} ${
          context.daysUntilFine === 0
            ? "today"
            : `within ${context.daysUntilFine} day(s)`
        } to stay clear of the ${context.fineRate}% fine.`,
        sms: `${associationName}: you are ${context.daysBehind} days behind on saving. Pay ${smsMoney(context.clearingAmount)} within ${context.daysUntilFine} days to avoid the ${context.fineRate}% fine. Ref ${context.paymentReference}.`,
        emailSubject: `Action needed: ${context.daysBehind} days behind on your saving`,
        emailText: `Dear ${firstName},\n\nYou are ${context.daysBehind} day(s) behind on your daily saving.\n\nTo be fully up to date, pay ${formatMoney(context.clearingAmount)} quoting your reference ${context.paymentReference}.\n\nIf you are still behind in ${context.daysUntilFine} day(s), a fine of ${context.fineRate}% of the unpaid saving is added automatically. Paying before then avoids it entirely.\n\nIf you cannot pay at the moment, speak to the association - a break can be agreed rather than a fine applied.\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/dashboard/savings/deposit",
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED:
      return {
        title: "A fine has been added",
        body: `You were ${context.daysBehind} days behind on your saving, so a fine of ${formatMoney(context.amount)} has been added. Pay ${formatMoney(context.clearingAmount)} to clear everything.`,
        sms: `${associationName}: fine of ${smsMoney(context.amount)} added after ${context.daysBehind} days behind. Total to clear ${smsMoney(context.clearingAmount)}. Ref ${context.paymentReference}.`,
        emailSubject: `A fine of ${formatMoney(context.amount)} has been added to your account`,
        emailText: `Dear ${firstName},\n\nYou have been ${context.daysBehind} day(s) behind on your daily saving, and under the association's rules a fine of ${context.fineRate}% of the unpaid saving now applies.\n\nFine: ${formatMoney(context.amount)}\nReference: ${context.reference}\n\nTo clear your arrears and this fine together, pay ${formatMoney(context.clearingAmount)} quoting ${context.paymentReference}.\n\nYou can read the rule this was applied under, and your full standing, on the rules page of your dashboard. If you believe this is wrong, or you need a payment break, contact the association - a fine can be waived by an officer with a reason recorded.\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/dashboard/rules",
      };

    // Deliberately sent. Being told you are clear is what makes the warnings
    // above trustworthy rather than a system that only ever complains.
    case NOTIFICATION_EVENTS.CONTRIBUTION_BACK_ON_TRACK:
      return {
        title: "You are up to date",
        body: `Your daily saving is fully up to date. Your savings balance is ${formatMoney(context.balance)}.`,
        emailSubject: "Your saving is up to date",
        emailText: `Dear ${firstName},\n\nYour daily saving is fully up to date - nothing is outstanding and no fine applies.\n\nYour savings balance is ${formatMoney(context.balance)}.\n\nThank you.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/savings",
      };

    // The member's own half of the loan interest, landing back in their
    // savings. Worth telling them about: it is the rule most likely to be
    // disbelieved until it is seen on a statement.
    case NOTIFICATION_EVENTS.INTEREST_SHARE_CREDITED:
      return {
        title: "Your share of the loan interest",
        body: `${formatMoney(context.amount)} of the interest on your repayment has been credited back into your savings. Your balance is now ${formatMoney(context.balance)}.`,
        emailSubject: `${formatMoney(context.amount)} of interest credited to your savings`,
        emailText: `Dear ${firstName},\n\nUnder the association's interest-sharing rule, half the interest you pay on a loan comes back to you.\n\nCredited to your savings: ${formatMoney(context.amount)}\nLoan reference: ${context.reference}\nYour savings balance is now ${formatMoney(context.balance)}.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/savings/transactions",
      };

    case NOTIFICATION_EVENTS.RULE_CHANGED:
      return {
        title: "A rule has changed",
        body: `${context.ruleTitle} has been amended. ${context.reason ?? ""}`.trim(),
        emailSubject: `${associationName}: a rule has changed`,
        emailText: `Dear ${firstName},\n\nThe association has amended one of its rules.\n\nRule: ${context.ruleTitle}\nReason given: ${context.reason ?? "Not stated"}\n\nYou can read the rule in full, and its history, on the rules page of your dashboard.\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard/rules",
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_SUBMITTED:
      return {
        title: "Withdrawal request submitted",
        body: `Your request to withdraw ${formatMoney(context.amount)} has been submitted for approval.`,
        sms: `${associationName}: withdrawal request for ${smsMoney(context.amount)} submitted. Ref ${context.reference}.`,
        emailSubject: "Withdrawal request received",
        emailText: `Dear ${firstName},\n\nYour request to withdraw ${formatMoney(context.amount)} has been received and is awaiting approval.\n\nReference: ${context.reference}\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard/withdrawals",
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_APPROVED:
      return {
        title: "Withdrawal approved",
        body: `Your withdrawal of ${formatMoney(context.amount)} has been approved.`,
        sms: `${associationName}: withdrawal of ${smsMoney(context.amount)} approved. Ref ${context.reference}.`,
        emailSubject: "Withdrawal approved",
        emailText: `Dear ${firstName},\n\nYour withdrawal of ${formatMoney(context.amount)} has been approved and will be paid out shortly.\n\nReference: ${context.reference}\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/withdrawals",
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_REJECTED:
      return {
        title: "Withdrawal declined",
        body: context.reason ?? "Your withdrawal request was not approved.",
        sms: `${associationName}: withdrawal ${context.reference} was declined. Please contact the office.`,
        emailSubject: "Withdrawal request declined",
        emailText: `Dear ${firstName},\n\nYour withdrawal request (${context.reference}) was not approved.\n\nReason: ${context.reason ?? "Not stated"}\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/dashboard/withdrawals",
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_PAID:
      return {
        title: "Withdrawal paid",
        body: `${formatMoney(context.amount)} has been paid out to you.`,
        sms: `${associationName}: ${smsMoney(context.amount)} has been paid out. Ref ${context.reference}.`,
        emailSubject: "Withdrawal paid",
        emailText: `Dear ${firstName},\n\n${formatMoney(context.amount)} has been paid out.\n\nReference: ${context.reference}\nYour savings balance is now ${formatMoney(context.balance)}.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/savings/transactions",
      };

    case NOTIFICATION_EVENTS.LOAN_SUBMITTED:
      return {
        title: "Loan application submitted",
        body: `Your application for ${formatMoney(context.amount)} has been submitted for review.`,
        sms: `${associationName}: loan application ${context.reference} for ${smsMoney(context.amount)} submitted.`,
        emailSubject: "Loan application received",
        emailText: `Dear ${firstName},\n\nYour loan application for ${formatMoney(context.amount)} has been received.\n\nReference: ${context.reference}\n\nYou will be notified once it has been reviewed.\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard/loans",
      };

    case NOTIFICATION_EVENTS.LOAN_APPROVED:
      return {
        title: "Loan approved",
        body: `Your loan of ${formatMoney(context.amount)} has been approved.`,
        sms: `${associationName}: loan ${context.reference} approved for ${smsMoney(context.amount)}.`,
        emailSubject: "Your loan has been approved",
        emailText: `Dear ${firstName},\n\nYour loan application has been approved.\n\nReference: ${context.reference}\nApproved amount: ${formatMoney(context.amount)}\n\nYou will be notified once the funds have been disbursed.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/loans",
      };

    case NOTIFICATION_EVENTS.LOAN_REJECTED:
      return {
        title: "Loan application declined",
        body: context.reason ?? "Your loan application was not approved.",
        sms: `${associationName}: loan application ${context.reference} was declined. Please contact the office.`,
        emailSubject: "Loan application declined",
        emailText: `Dear ${firstName},\n\nYour loan application (${context.reference}) was not approved.\n\nReason: ${context.reason ?? "Not stated"}\n\nYou are welcome to discuss this with the association.\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/dashboard/loans",
      };

    case NOTIFICATION_EVENTS.LOAN_INFO_REQUESTED:
      return {
        title: "More information needed",
        body: context.reason ?? "The association needs more information about your loan application.",
        sms: `${associationName}: more information is needed for loan ${context.reference}. Please sign in or contact the office.`,
        emailSubject: "More information needed for your loan application",
        emailText: `Dear ${firstName},\n\nWe need more information before we can proceed with your loan application (${context.reference}).\n\n${context.reason ?? ""}\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/dashboard/loans",
      };

    case NOTIFICATION_EVENTS.LOAN_DISBURSED:
      return {
        title: "Loan disbursed",
        body: `${formatMoney(context.amount)} has been disbursed. Your first repayment is due ${shortDate(context.dueDate)}.`,
        sms: `${associationName}: loan ${context.reference} disbursed, ${smsMoney(context.amount)}. First repayment due ${shortDate(context.dueDate)}.`,
        emailSubject: "Your loan has been disbursed",
        emailText: `Dear ${firstName},\n\n${formatMoney(context.amount)} has been disbursed for loan ${context.reference}.\n\nYour first repayment is due on ${shortDate(context.dueDate)}. Your full repayment schedule is available when you sign in.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/loans",
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_RECEIVED:
      return {
        title: "Repayment received",
        body: `Your repayment of ${formatMoney(context.amount)} has been received. Outstanding balance: ${formatMoney(context.balance)}.`,
        sms: `${associationName}: repayment of ${smsMoney(context.amount)} received. Balance ${smsMoney(context.balance)}.`,
        emailSubject: "Loan repayment received",
        emailText: `Dear ${firstName},\n\nWe have received your repayment of ${formatMoney(context.amount)}.\n\nOutstanding balance: ${formatMoney(context.balance)}\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/loans/repayments",
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_REMINDER:
      return {
        title: "Repayment due soon",
        body: `Your repayment of ${formatMoney(context.amount)} is due on ${shortDate(context.dueDate)}.`,
        sms: `${associationName}: reminder, ${smsMoney(context.amount)} is due on ${shortDate(context.dueDate)}. Ref ${context.paymentReference}.`,
        emailSubject: `Repayment due ${shortDate(context.dueDate)}`,
        emailText: `Dear ${firstName},\n\nThis is a reminder that your loan repayment of ${formatMoney(context.amount)} is due on ${shortDate(context.dueDate)}.\n\nPlease quote your payment reference ${context.paymentReference} when paying.\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard/loans/repayments",
      };

    case NOTIFICATION_EVENTS.LOAN_OVERDUE:
      return {
        title: "Repayment overdue",
        body: `Your repayment of ${formatMoney(context.amount)} is ${context.daysOverdue} day(s) overdue. Penalties may apply.`,
        sms: `${associationName}: ${smsMoney(context.amount)} is ${context.daysOverdue} days overdue. Please pay to avoid penalties. Ref ${context.paymentReference}.`,
        emailSubject: "Your loan repayment is overdue",
        emailText: `Dear ${firstName},\n\nYour loan repayment of ${formatMoney(context.amount)} is now ${context.daysOverdue} day(s) overdue.\n\nPenalties may be applied until it is settled. Please quote payment reference ${context.paymentReference} when paying.\n\nIf you are having difficulty, please contact the association.\n\n${associationName}`,
        severity: "CRITICAL",
        actionUrl: "/dashboard/loans/repayments",
      };

    case NOTIFICATION_EVENTS.LOAN_COMPLETED:
      return {
        title: "Loan fully repaid",
        body: `Loan ${context.reference} has been repaid in full. Thank you.`,
        sms: `${associationName}: loan ${context.reference} is fully repaid. Thank you.`,
        emailSubject: "Your loan is fully repaid",
        emailText: `Dear ${firstName},\n\nLoan ${context.reference} has been repaid in full.\n\nThank you for keeping to your repayment schedule.\n\n${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/dashboard/loans",
      };

    // The one guarantee message that asks for something. It names who is
    // asking, how much, and what accepting does to the guarantor's own money,
    // because a pledge agreed without knowing it locks savings is not consent.
    case NOTIFICATION_EVENTS.GUARANTEE_REQUESTED:
      return {
        title: "You have been asked to guarantee a loan",
        body: `${context.counterpartyName} has named you as a guarantor for ${formatMoney(context.amount)} on loan application ${context.reference}. If you accept, that amount is held from your savings until the loan is repaid. Accept or decline on your account page.`,
        sms: `${associationName}: ${context.counterpartyName} asks you to guarantee ${smsMoney(context.amount)} (${context.reference}). Accept or decline on your account page.`,
        emailSubject: `${context.counterpartyName} has asked you to guarantee a loan`,
        emailText: `Dear ${firstName},

${context.counterpartyName} has applied for a loan and named you as a guarantor.

Amount you are asked to cover: ${formatMoney(context.amount)}
Application reference: ${context.reference}

If you accept, ${formatMoney(context.amount)} of your savings is held and cannot be withdrawn or borrowed against until the loan is fully repaid. It is then released back to you. If you decline, nothing is held.

Sign in and open your account page to accept or decline.

${associationName}`,
        severity: "WARNING",
        actionUrl: "/account/status",
      };

    case NOTIFICATION_EVENTS.GUARANTEE_ACCEPTED:
      return {
        title: "A guarantor accepted",
        body: `${context.counterpartyName} has accepted to guarantee ${formatMoney(context.amount)} of your loan application ${context.reference}.`,
        sms: `${associationName}: ${context.counterpartyName} accepted to guarantee ${smsMoney(context.amount)} of ${context.reference}.`,
        emailSubject: "A guarantor accepted",
        emailText: `Dear ${firstName},

${context.counterpartyName} has accepted to guarantee ${formatMoney(context.amount)} of your loan application ${context.reference}.

${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/account/status",
      };

    case NOTIFICATION_EVENTS.GUARANTEE_DECLINED:
      return {
        title: "A guarantor declined",
        body: `${context.counterpartyName} has declined to guarantee ${formatMoney(context.amount)} of your loan application ${context.reference}.${context.reason ? ` Reason: ${context.reason}` : ""}`,
        sms: `${associationName}: ${context.counterpartyName} declined to guarantee ${smsMoney(context.amount)} of ${context.reference}.`,
        emailSubject: "A guarantor declined",
        emailText: `Dear ${firstName},

${context.counterpartyName} has declined to guarantee ${formatMoney(context.amount)} of your loan application ${context.reference}.

Reason: ${context.reason ?? "Not stated"}

The committee can approve only the part of the loan that is covered. Speak to the association if you want to name someone else.

${associationName}`,
        severity: "WARNING",
        actionUrl: "/account/status",
      };

    case NOTIFICATION_EVENTS.GUARANTEE_RELEASED:
      return {
        title: "Your guarantee has ended",
        body: `The ${formatMoney(context.amount)} you pledged for ${context.counterpartyName} (${context.reference}) is no longer held. It is available to you again.`,
        sms: `${associationName}: the ${smsMoney(context.amount)} you guaranteed for ${context.counterpartyName} is released and available again.`,
        emailSubject: "Your guarantee has ended",
        emailText: `Dear ${firstName},

The ${formatMoney(context.amount)} you pledged as guarantor for ${context.counterpartyName} (${context.reference}) is no longer held.

It is part of your available balance again.

${associationName}`,
        severity: "SUCCESS",
        actionUrl: "/account/status",
      };

    case NOTIFICATION_EVENTS.PASSWORD_CHANGED:
      return {
        title: "Password changed",
        body: "Your password was changed. If this was not you, contact the association immediately.",
        // Deliberately no SMS: a security alert by SMS is a common phishing
        // pattern, and members are better served by not being trained to act
        // on one.
        emailSubject: "Your password was changed",
        emailText: `Dear ${firstName},\n\nYour ${associationName} account password was changed.\n\nIf you did not do this, contact the association immediately - your account may be compromised.\n\n${associationName}`,
        severity: "WARNING",
      };

    case NOTIFICATION_EVENTS.PASSWORD_RESET_REQUESTED:
      return {
        title: "Password reset requested",
        body: "A password reset link has been sent to you. It expires in 30 minutes.",
        emailSubject: "Reset your password",
        emailText: `Dear ${firstName},\n\nUse the link below to set a new password. It expires in 30 minutes.\n\n${context.actionUrl}\n\nIf you did not request this, you can ignore this message - your password has not changed.\n\n${associationName}`,
        severity: "INFO",
      };

    case NOTIFICATION_EVENTS.PAYMENT_UNMATCHED:
      return {
        title: "Payment needs attention",
        body: `A payment of ${formatMoney(context.amount)} could not be matched to a member.`,
        emailSubject: "Unmatched payment requires review",
        emailText: `A payment of ${formatMoney(context.amount)} was received but could not be matched to a member.\n\nReference: ${context.reference}\n\nPlease review it in the unmatched payments queue.\n\n${associationName}`,
        severity: "WARNING",
        actionUrl: "/admin/payments/unmatched",
      };

    case NOTIFICATION_EVENTS.SAVINGS_BALANCE_UPDATED:
      return {
        title: "Savings balance updated",
        body: `Your savings balance is now ${formatMoney(context.balance)}.`,
        emailSubject: "Savings balance updated",
        emailText: `Dear ${firstName},\n\nYour savings balance is now ${formatMoney(context.balance)}.\n\n${associationName}`,
        severity: "INFO",
        actionUrl: "/dashboard/savings",
      };

    case NOTIFICATION_EVENTS.MEMBER_SUSPENDED:
      return {
        title: "Account suspended",
        body: context.reason ?? "Your membership has been suspended.",
        emailSubject: "Your membership has been suspended",
        emailText: `Dear ${firstName},\n\nYour membership has been suspended.\n\nReason: ${context.reason ?? "Not stated"}\n\nPlease contact the association.\n\n${associationName}`,
        severity: "CRITICAL",
      };

    case NOTIFICATION_EVENTS.NEW_LOGIN:
      return {
        title: "New sign-in",
        body: "Your account was signed in to from a new device.",
        emailSubject: "New sign-in to your account",
        emailText: `Dear ${firstName},\n\nYour account was signed in to from a new device.\n\nIf this was not you, change your password immediately.\n\n${associationName}`,
        severity: "INFO",
      };

    case NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT:
    default:
      return {
        title: "Message from the association",
        body: context.reason ?? "",
        sms: context.reason?.slice(0, 155),
        emailSubject: `Message from ${associationName}`,
        emailText: `Dear ${firstName},\n\n${context.reason ?? ""}\n\n${associationName}`,
        severity: "INFO",
      };
  }
}
