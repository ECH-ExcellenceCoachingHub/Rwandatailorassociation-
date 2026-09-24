import type { KycStatus, MemberStatus } from "@/lib/generated/prisma/enums";
import { CLOSABLE_STATUSES } from "@/lib/member-removal";
import { MEMBER_ACTION_PERMISSION, type MemberAction } from "@/lib/validation/members";

/**
 * Which decisions apply to which member, as the screens offer them.
 *
 * Shared by the member's file, the register's row menu and its bulk bar, so
 * the three cannot disagree about when a button appears. None of it is a
 * control — the API re-checks every one — it only keeps the screens from
 * offering something the server would refuse.
 */

/**
 * The actions as the screens name them. Finer than the API's list:
 * reactivating a suspended member and reopening a closed membership are one
 * call, but two different sentences to the person pressing the button.
 */
export const MEMBER_ACTION_KINDS = [
  "approve",
  "decline",
  "suspend",
  "reactivate",
  "reopen",
  "verify",
  "fail",
  "close",
  "delete",
  "resetSavings",
] as const;

export type MemberActionKind = (typeof MEMBER_ACTION_KINDS)[number];

export const API_ACTION: Record<MemberActionKind, MemberAction> = {
  approve: "approve",
  decline: "reject",
  suspend: "suspend",
  reactivate: "reactivate",
  reopen: "reactivate",
  verify: "verify_kyc",
  fail: "reject_kyc",
  close: "close",
  delete: "delete",
  resetSavings: "reset_savings",
};

export interface MemberActionState {
  status: MemberStatus;
  kycStatus: KycStatus;
  hasNationalId: boolean;
  /// The viewer's own membership. Nobody suspends, closes or deletes
  /// themselves: those are the actions that could leave an administrator
  /// unable to undo what they just did.
  isSelf: boolean;
}

/** Whether this action makes sense for this member in their current state. */
export function canTake(kind: MemberActionKind, member: MemberActionState): boolean {
  switch (kind) {
    case "approve":
    case "decline":
      return member.status === "PENDING_APPROVAL";
    case "suspend":
      return member.status === "ACTIVE" && !member.isSelf;
    case "reactivate":
      return (member.status === "SUSPENDED" || member.status === "INACTIVE") && !member.isSelf;
    case "reopen":
      return member.status === "EXITED" && !member.isSelf;
    case "verify":
      return member.kycStatus !== "VERIFIED" && member.hasNationalId;
    case "fail":
      return member.kycStatus !== "REJECTED";
    case "close":
      return CLOSABLE_STATUSES.has(member.status) && !member.isSelf;
    case "delete":
      // Whether they have a history that rules it out is the server's call;
      // the register does not load it for every row.
      return !member.isSelf;
    case "resetSavings":
      // Only somebody who is expected to contribute has a clock running.
      return member.status === "ACTIVE" || member.status === "SUSPENDED";
  }
}

/** What POST /api/admin/members/bulk reports back. */
export interface BulkMemberResult {
  done: number;
  /// Members the action was not applied to, each with the server's reason.
  refused: {
    memberId: string;
    name: string | null;
    memberNumber: string | null;
    reason: string;
  }[];
}

/** The actions this viewer's permissions allow at all. */
export function allowedMemberActions(permissions: ReadonlySet<string>): MemberActionKind[] {
  return MEMBER_ACTION_KINDS.filter((kind) =>
    permissions.has(MEMBER_ACTION_PERMISSION[API_ACTION[kind]])
  );
}
