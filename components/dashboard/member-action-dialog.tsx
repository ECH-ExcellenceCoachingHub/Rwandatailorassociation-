import type { ReactNode } from "react";
import {
  Ban,
  Check,
  DoorOpen,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ConfirmDialogProps } from "@/components/ui/confirm-dialog";
import type { DashboardDictionary } from "@/lib/i18n/dashboard";
import { fill, pluralize } from "@/lib/i18n/fill";
import { API_ACTION, type MemberActionKind } from "@/lib/member-actions";
import { MEMBER_ACTION_REASON_MIN } from "@/lib/validation/members";

/**
 * What a membership decision says before it is taken — for one member from
 * their file or a row menu, or for a batch from the register.
 *
 * One member is addressed by name. A batch gets its own sentences rather than
 * the single one with a number in it, because Kinyarwanda inflects the verb for
 * "they" differently from "he or she", and "Suspend 1 member?" reads like a
 * machine wrote it.
 */

/** A member a decision is about to be applied to. */
export interface MemberTarget {
  id: string;
  fullName: string;
  memberNumber: string;
  paymentReference: string;
  /// Named in the one-member verify dialog when known; the register does not
  /// carry it, and falls back to a sentence without the number.
  nationalId?: string | null;
  isStaff: boolean;
  /// Formatted, for the one-member closing dialog.
  savingsBalance: string;
  loansOwing: string;
}

export type MemberActionDialog = Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm">;

export const MEMBER_ACTION_ICON: Record<MemberActionKind, LucideIcon> = {
  approve: Check,
  decline: X,
  suspend: Ban,
  reactivate: RotateCcw,
  reopen: RotateCcw,
  verify: ShieldCheck,
  fail: ShieldX,
  close: DoorOpen,
  delete: Trash2,
};

const DANGER: ReadonlySet<MemberActionKind> = new Set<MemberActionKind>([
  "decline",
  "suspend",
  "fail",
  "close",
  "delete",
]);

export function isDangerAction(kind: MemberActionKind): boolean {
  return DANGER.has(kind);
}

/** The button label for an action. */
export function memberActionLabel(kind: MemberActionKind, d: DashboardDictionary): string {
  const copy = d.admin.manage;
  const pending = d.views.pendingMembers;
  const labels: Record<MemberActionKind, string> = {
    approve: pending.approve,
    decline: pending.decline,
    suspend: copy.suspend,
    reactivate: copy.reactivate,
    reopen: copy.reopen,
    verify: copy.verifyKyc,
    fail: copy.failKyc,
    close: copy.closeTitle,
    delete: copy.deleteButton,
  };
  return labels[kind];
}

function Note({ tone = "muted", children }: { tone?: "muted" | "warning"; children: ReactNode }) {
  return (
    <p
      className={
        tone === "warning"
          ? "rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          : "rounded-xl bg-ink/[0.04] p-3 text-sm text-ink-muted"
      }
    >
      {children}
    </p>
  );
}

/** Title, body, reason and notes for the confirmation of one decision. */
export function describeMemberAction(
  kind: MemberActionKind,
  targets: MemberTarget[],
  d: DashboardDictionary
): MemberActionDialog {
  const copy = d.admin.manage;
  const bulk = d.admin.memberBulk;
  const pending = d.views.pendingMembers;

  const count = targets.length;
  const one = count === 1 ? targets[0] : null;
  const name = one?.fullName ?? "";

  const reasonMinLength = MEMBER_ACTION_REASON_MIN[API_ACTION[kind]];
  const requireReason = reasonMinLength !== undefined;

  // Only the actions that touch a login say what happens to a staff one.
  // Suspending and closing leave it alone; deleting takes it with the member,
  // which is worth a louder warning.
  const staffCount = targets.filter((t) => t.isStaff).length;
  const staffNote =
    staffCount === 0 ? null : kind === "delete" ? (
      <Note key="staff" tone="warning">
        {one ? fill(copy.staffLoginErased, { name }) : pluralize(bulk.staffErased, staffCount)}
      </Note>
    ) : kind === "suspend" || kind === "close" ? (
      <Note key="staff">
        {one ? fill(copy.staffLoginKept, { name }) : pluralize(bulk.staffKept, staffCount)}
      </Note>
    ) : null;
  const sameReason =
    !one && requireReason ? <Note key="reason">{bulk.sameReason}</Note> : null;

  const notes = (...extra: ReactNode[]) => {
    const all = [...extra, staffNote, sameReason].filter(Boolean);
    return all.length > 0 ? <div className="space-y-2">{all}</div> : undefined;
  };

  const base: MemberActionDialog = {
    title: "",
    tone: isDangerAction(kind) ? "danger" : "default",
    requireReason,
    reasonMinLength,
    confirmLabel: memberActionLabel(kind, d),
    children: notes(),
  };

  switch (kind) {
    case "approve":
      return {
        ...base,
        title: one ? pending.approveTitle : pluralize(bulk.approveTitle, count),
        description: one
          ? fill(pending.approveBody, { name, reference: one.paymentReference })
          : bulk.approveBody,
        confirmLabel: pending.approveConfirm,
      };
    case "decline":
      return {
        ...base,
        title: one ? pending.declineTitle : pluralize(bulk.declineTitle, count),
        description: one ? fill(pending.declineBody, { name }) : bulk.declineBody,
        confirmLabel: pending.declineConfirm,
        reasonLabel: one ? pending.declineReasonLabel : undefined,
        reasonPlaceholder: pending.declineReasonPlaceholder,
      };
    case "suspend":
      return {
        ...base,
        title: one ? fill(copy.suspendTitle, { name }) : pluralize(bulk.suspendTitle, count),
        description: one ? copy.suspendBody : bulk.suspendBody,
        confirmLabel: copy.suspendConfirm,
        reasonLabel: one ? copy.suspendReasonLabel : undefined,
        reasonPlaceholder: copy.suspendReasonPlaceholder,
      };
    case "reactivate":
      return {
        ...base,
        title: one ? fill(copy.reactivateTitle, { name }) : pluralize(bulk.reactivateTitle, count),
        description: one ? copy.reactivateBody : bulk.reactivateBody,
      };
    case "reopen":
      return {
        ...base,
        title: one ? fill(copy.reopenTitle, { name }) : pluralize(bulk.reopenTitle, count),
        description: one ? copy.reopenBody : bulk.reopenBody,
      };
    case "verify":
      return {
        ...base,
        title: one ? fill(copy.verifyTitle, { name }) : pluralize(bulk.verifyTitle, count),
        description: one?.nationalId
          ? fill(copy.verifyBody, { id: one.nationalId })
          : pluralize(bulk.verifyBody, count),
      };
    case "fail":
      return {
        ...base,
        title: one ? fill(copy.failTitle, { name }) : pluralize(bulk.failTitle, count),
        description: one ? copy.failBody : bulk.failBody,
        reasonLabel: copy.failReasonLabel,
        reasonPlaceholder: copy.failReasonPlaceholder,
      };
    case "close":
      return {
        ...base,
        title: one ? fill(copy.closeConfirmTitle, { name }) : pluralize(bulk.closeTitle, count),
        description: one ? copy.closeConfirmBody : bulk.closeBody,
        reasonLabel: one ? copy.closeReasonLabel : undefined,
        reasonPlaceholder: copy.closeReasonPlaceholder,
        children: notes(
          one ? (
            <Note key="money" tone="warning">
              {fill(copy.closeMoney, { balance: one.savingsBalance, owing: one.loansOwing })}
            </Note>
          ) : null
        ),
      };
    case "delete":
      return {
        ...base,
        title: one ? fill(copy.deleteConfirmTitle, { name }) : pluralize(bulk.deleteTitle, count),
        description: one
          ? fill(copy.deleteConfirmBody, { number: one.memberNumber })
          : bulk.deleteBody,
        confirmLabel: copy.deleteConfirm,
        reasonLabel: one ? copy.deleteReasonLabel : undefined,
        reasonPlaceholder: copy.deleteReasonPlaceholder,
      };
  }
}
