"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/components/LanguageProvider";
import {
  MEMBER_ACTION_ICON,
  describeMemberAction,
  isDangerAction,
  memberActionLabel,
  type MemberTarget,
} from "@/components/dashboard/member-action-dialog";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { API_ACTION, canTake, type MemberActionKind } from "@/lib/member-actions";
import type { HistoryCount } from "@/lib/member-removal";
import type { KycStatus, MemberStatus } from "@/lib/generated/prisma/enums";

export interface ManagedMember extends MemberTarget {
  status: MemberStatus;
  kycStatus: KycStatus;
  exitedAt: string | null;
}

export const dangerButtonClass =
  "border-red-200 text-red-700 hover:border-red-600 hover:text-red-700";

/**
 * Sends one decision about one member to the API. Throws the server's message
 * when it refuses, for the confirmation dialog to show.
 */
export async function sendMemberAction(
  memberId: string,
  kind: MemberActionKind,
  reason: string | undefined,
  fallbackError: string
): Promise<void> {
  const action = API_ACTION[kind];
  const response = await fetch(`/api/admin/members/${memberId}`, {
    method: action === "delete" ? "DELETE" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "delete" ? { reason } : { action, ...(reason ? { reason } : {}) }
    ),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? fallbackError);
  }
}

/**
 * Everything an administrator can decide about a member, on their file.
 *
 * Buttons appear only for the permissions the viewer holds and the states the
 * member is in, but that is presentation: every action is re-checked by the
 * API, which also refuses transitions that make no sense (suspending a closed
 * membership, say).
 *
 * Removal comes in two strengths on purpose. Deleting erases the member and
 * everything recorded against them — it is for test accounts and records made
 * in error. Closing is how a real member leaves: the membership ends and every
 * record stays. When there is history to lose the panel lists it beside the
 * delete button, so nobody erases a ledger without having been told it is
 * there.
 */
export function MemberManagement({
  member,
  allowed,
  history,
  isSelf,
}: {
  member: ManagedMember;
  /// The actions the viewer's permissions allow; see allowedMemberActions.
  allowed: MemberActionKind[];
  /// What deleting this member would erase with them.
  history: HistoryCount[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.manage;

  const [open, setOpen] = useState<MemberActionKind | null>(null);

  const state = {
    status: member.status,
    kycStatus: member.kycStatus,
    hasNationalId: Boolean(member.nationalId),
    isSelf,
  };
  const offers = (kind: MemberActionKind) => allowed.includes(kind) && canTake(kind, state);

  async function confirm(kind: MemberActionKind, reason?: string) {
    await sendMemberAction(member.id, kind, reason, copy.actionFailed);

    if (kind === "delete") {
      // The file no longer exists; refreshing it would be a 404.
      router.replace("/admin/members");
    }
    router.refresh();
  }

  function actionButton(kind: MemberActionKind) {
    const Icon = MEMBER_ACTION_ICON[kind];
    const solid = kind === "approve" || kind === "reactivate";
    return (
      <Button
        key={kind}
        size="sm"
        variant={solid || kind === "delete" ? "primary" : "outline"}
        className={
          kind === "delete"
            ? "bg-red-600 hover:bg-red-700"
            : isDangerAction(kind)
              ? dangerButtonClass
              : undefined
        }
        onClick={() => setOpen(kind)}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {memberActionLabel(kind, d)}
      </Button>
    );
  }

  const statusText: Record<MemberStatus, string> = {
    PENDING_APPROVAL: copy.statusPending,
    ACTIVE: copy.statusActive,
    SUSPENDED: copy.statusSuspended,
    INACTIVE: copy.statusInactive,
    EXITED: fill(copy.statusExited, { date: formatDate(member.exitedAt, locale) }),
    REJECTED: copy.statusRejected,
  };

  const nationalId = member.nationalId ?? "";
  const kycText: Record<KycStatus, string> = {
    UNVERIFIED: copy.kycUnverified,
    PENDING: fill(copy.kycPending, { id: nationalId }),
    VERIFIED: fill(copy.kycVerified, { id: nationalId }),
    REJECTED: copy.kycRejected,
  };

  const historyList = history
    .map((entry) =>
      entry.key === "savingsBalance"
        ? copy.history.savingsBalance
        : pluralize(copy.history[entry.key], entry.count)
    )
    .join(", ");

  const statusActions = (["approve", "decline", "suspend", "reactivate", "reopen"] as const)
    .filter(offers)
    .map((kind) => actionButton(kind));
  const kycActions = (["verify", "fail"] as const)
    .filter(offers)
    .map((kind) => actionButton(kind));
  const showRemoval = allowed.includes("close") || allowed.includes("delete");

  return (
    <section
      id="manage"
      className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 shadow-card"
    >
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <Settings2 className="size-4" aria-hidden="true" />
        </span>
        {copy.title}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{copy.description}</p>

      <div className="mt-4 divide-y divide-border">
        <ActionRow label={copy.statusLabel} text={statusText[member.status]}>
          {statusActions}
        </ActionRow>

        <ActionRow
          label={copy.kycLabel}
          text={kycText[member.kycStatus]}
          hint={allowed.includes("verify") && !member.nationalId ? copy.kycNoId : undefined}
        >
          {kycActions}
        </ActionRow>
      </div>

      {showRemoval && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <h3 className="font-heading text-sm font-semibold text-red-800">
            {copy.removeTitle}
          </h3>

          {isSelf ? (
            <p className="mt-2 text-sm text-ink-muted">{copy.selfBlocked}</p>
          ) : (
            <div className="mt-1 divide-y divide-red-100">
              {offers("close") && (
                <ActionRow label={copy.closeTitle} text={copy.closeBody}>
                  {[actionButton("close")]}
                </ActionRow>
              )}

              {offers("delete") && (
                <ActionRow
                  label={copy.deleteTitle}
                  text={
                    history.length > 0
                      ? fill(copy.deleteWithHistory, { items: historyList })
                      : copy.deleteBody
                  }
                >
                  {[actionButton("delete")]}
                </ActionRow>
              )}
            </div>
          )}
        </div>
      )}

      {open && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setOpen(null)}
          {...describeMemberAction(open, [member], d)}
          onConfirm={(reason) => confirm(open, reason)}
        />
      )}
    </section>
  );
}

function ActionRow({
  label,
  text,
  hint,
  children,
}: {
  label: string;
  text: string;
  hint?: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{text}</p>
        {hint && <p className="mt-1 text-xs text-amber-700">{hint}</p>}
      </div>
      {children.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{children}</div>
      )}
    </div>
  );
}
