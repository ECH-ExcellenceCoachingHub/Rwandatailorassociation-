"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FileText, Link2, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLanguage } from "@/components/LanguageProvider";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import {
  dangerButtonClass,
  sendMemberAction,
} from "@/components/dashboard/MemberManagement";
import {
  MEMBER_ACTION_ICON,
  describeMemberAction,
  isDangerAction,
  memberActionLabel,
  type MemberTarget,
} from "@/components/dashboard/member-action-dialog";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { formatMoney } from "@/lib/money";
import {
  API_ACTION,
  MEMBER_ACTION_KINDS,
  canTake,
  type BulkMemberResult,
  type MemberActionKind,
} from "@/lib/member-actions";
import { cn } from "@/lib/utils";
import type { KycStatus, MemberStatus } from "@/lib/generated/prisma/enums";

export interface RegisterMember {
  id: string;
  userId: string;
  memberNumber: string;
  paymentReference: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  kycStatus: KycStatus;
  hasNationalId: boolean;
  isStaff: boolean;
  balance: string;
  outstandingLoan: string;
  hasOverdueLoan: boolean;
  joinedAt: Date | string | null;
  /// Encrypted phone number for the /in/:token sign-in link; null when the
  /// member has no usable phone.
  signInToken: string | null;
}

/**
 * The bar above the table offers the decisions that make sense for a batch.
 * Failing an identity check is left to the row menu: it is a judgement about
 * one person's document, not something done to a list.
 */
const BULK_KINDS = MEMBER_ACTION_KINDS.filter((kind) => kind !== "fail");

const menuItemClass = cn(
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink outline-none transition-colors",
  "data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
);

/**
 * The member register, with every membership decision available from it.
 *
 * Tick members and act on all of them at once, or use a row's menu to act on
 * one — neither needs the member's file opened. Each button appears only when
 * the viewer holds the permission and counts only the ticked members it
 * applies to, so "Suspend (3)" with five ticked means two of them are not
 * active; only those three are sent.
 *
 * The server still judges every member on their own. Anyone it refuses — most
 * often a delete for somebody with a financial history — is listed by name
 * afterwards, while the rest go ahead.
 */
export function MembersRegister({
  members,
  allowed,
  canEdit,
  viewerId,
  pagination,
}: {
  members: RegisterMember[];
  allowed: MemberActionKind[];
  canEdit: boolean;
  viewerId: string;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}) {
  const router = useRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.members;
  const bulk = d.admin.memberBulk;
  const manage = d.admin.manage;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ kind: MemberActionKind; ids: string[] } | null>(
    null
  );
  const [result, setResult] = useState<BulkMemberResult | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  /** Copies the member's /in/:token link — sign-in with the number filled in. */
  async function copySignInLink(member: RegisterMember) {
    if (!member.signInToken) return;
    const url = `${window.location.origin}/in/${member.signInToken}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (insecure origin, denied permission): let the admin
      // copy it by hand instead.
      window.prompt(bulk.copySignInLink, url);
      return;
    }
    setCopiedFor(member.fullName);
    window.setTimeout(() => setCopiedFor(null), 3000);
  }

  const selectable = allowed.length > 0;
  // Derived from the rows on screen, so a selection never outlives a refresh
  // that moved a member off this page.
  const selected = members.filter((m) => checked.has(m.id));
  const allOnPageChecked = members.length > 0 && selected.length === members.length;

  const stateOf = (m: RegisterMember) => ({
    status: m.status,
    kycStatus: m.kycStatus,
    hasNationalId: m.hasNationalId,
    isSelf: m.userId === viewerId,
  });

  const offers = (kind: MemberActionKind, m: RegisterMember) =>
    allowed.includes(kind) && canTake(kind, stateOf(m));

  const toTarget = (m: RegisterMember): MemberTarget => ({
    id: m.id,
    fullName: m.fullName,
    memberNumber: m.memberNumber,
    paymentReference: m.paymentReference,
    isStaff: m.isStaff,
    savingsBalance: formatMoney(m.balance),
    loansOwing: formatMoney(m.outstandingLoan),
  });

  function toggleRow(id: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setChecked(allOnPageChecked ? new Set() : new Set(members.map((m) => m.id)));
  }

  function start(kind: MemberActionKind, ids: string[]) {
    setResult(null);
    setPending({ kind, ids });
  }

  async function confirm(kind: MemberActionKind, ids: string[], reason?: string) {
    let outcome: BulkMemberResult;

    if (ids.length === 1) {
      // One member goes through the single endpoint, so a refusal is shown in
      // the dialog itself rather than as a list of one after it closes.
      await sendMemberAction(ids[0], kind, reason, manage.actionFailed);
      outcome = { done: 1, refused: [] };
    } else {
      const response = await fetch("/api/admin/members/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: API_ACTION[kind], memberIds: ids, reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? manage.actionFailed);
      }
      outcome = payload as BulkMemberResult;
    }

    setChecked((previous) => {
      const next = new Set(previous);
      for (const id of ids) next.delete(id);
      return next;
    });
    setResult(outcome);
    router.refresh();
  }

  const bulkActions = BULK_KINDS.filter((kind) => allowed.includes(kind))
    .map((kind) => ({
      kind,
      ids: selected.filter((m) => offers(kind, m)).map((m) => m.id),
    }))
    .filter((entry) => entry.ids.length > 0);

  const pendingTargets = pending
    ? members.filter((m) => pending.ids.includes(m.id)).map(toTarget)
    : [];

  return (
    <div className="mt-5 space-y-4">
      {copiedFor && (
        <Alert variant="success">{fill(bulk.signInLinkCopied, { name: copiedFor })}</Alert>
      )}

      {result && result.done > 0 && (
        <Alert variant="success">{pluralize(bulk.done, result.done)}</Alert>
      )}

      {result && result.refused.length > 0 && (
        <Alert variant="warning">
          <p className="font-semibold">{pluralize(bulk.skipped, result.refused.length)}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.refused.map((refusal) => (
              <li key={refusal.memberId}>
                <span className="font-medium">{refusal.name ?? bulk.unnamed}</span>
                {refusal.memberNumber && (
                  <span className="font-mono text-xs"> · {refusal.memberNumber}</span>
                )}
                {" — "}
                {refusal.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {selected.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-surface p-4 shadow-lift lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm font-semibold text-ink">
            {pluralize(bulk.selected, selected.length)}
          </p>

          <div className="flex flex-wrap gap-2">
            {bulkActions.map(({ kind, ids }) => {
              const Icon = MEMBER_ACTION_ICON[kind];
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={kind === "delete" ? "primary" : "outline"}
                  className={
                    kind === "delete"
                      ? "bg-red-600 hover:bg-red-700"
                      : isDangerAction(kind)
                        ? dangerButtonClass
                        : undefined
                  }
                  onClick={() => start(kind, ids)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {fill(bulk.withCount, {
                    label: memberActionLabel(kind, d),
                    count: ids.length,
                  })}
                </Button>
              );
            })}
            <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
              {bulk.clear}
            </Button>
          </div>
        </div>
      )}

      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageChecked}
                    onChange={toggleAllOnPage}
                    aria-label={bulk.selectAll}
                    className="size-4 cursor-pointer rounded border-border accent-primary"
                  />
                </TableHead>
              )}
              <TableHead>{copy.colMember}</TableHead>
              <TableHead>{copy.colContact}</TableHead>
              <TableHead align="right">{copy.colSavings}</TableHead>
              <TableHead align="right">{copy.colLoanOwing}</TableHead>
              <TableHead>{d.common.status}</TableHead>
              <TableHead>{copy.colKyc}</TableHead>
              <TableHead>{copy.colJoined}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{d.common.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const rowActions = MEMBER_ACTION_KINDS.filter((kind) => offers(kind, member));

              return (
                <TableRow
                  key={member.id}
                  className={checked.has(member.id) ? "bg-primary-50/50" : undefined}
                >
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={checked.has(member.id)}
                        onChange={() => toggleRow(member.id)}
                        aria-label={fill(bulk.selectMember, { name: member.fullName })}
                        className="size-4 cursor-pointer rounded border-border accent-primary"
                      />
                    </TableCell>
                  )}

                  <TableCell>
                    <Link
                      href={`/admin/members/${member.id}`}
                      className="block font-medium text-ink hover:text-primary"
                    >
                      {member.fullName}
                    </Link>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {member.memberNumber} · {member.paymentReference}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted">
                    {member.phone && <span className="block">{member.phone}</span>}
                    {member.email && (
                      <span className="block max-w-[180px] truncate text-xs">
                        {member.email}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(member.balance, { showSymbol: false })}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span className={member.hasOverdueLoan ? "text-red-600" : "text-ink"}>
                      {formatMoney(member.outstandingLoan, { showSymbol: false })}
                    </span>
                    {member.hasOverdueLoan && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                        {copy.overdue}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={member.status} size="sm" />
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={member.kycStatus} size="sm" />
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(member.joinedAt, locale)}
                  </TableCell>

                  <TableCell align="right">
                    {/*
                      Not modal: a modal menu that opens a dialog from one of
                      its items leaves the page unclickable once both close.
                    */}
                    <DropdownMenu.Root modal={false}>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          aria-label={fill(bulk.rowActions, { name: member.fullName })}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink data-[state=open]:bg-ink/5"
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </button>
                      </DropdownMenu.Trigger>

                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          className="z-50 w-60 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-lift"
                        >
                          <DropdownMenu.Item asChild>
                            <Link href={`/admin/members/${member.id}`} className={menuItemClass}>
                              <FileText className="size-4" aria-hidden="true" />
                              {bulk.openFile}
                            </Link>
                          </DropdownMenu.Item>
                          {canEdit && (
                            <DropdownMenu.Item asChild>
                              <Link
                                href={`/admin/members/${member.id}/edit`}
                                className={menuItemClass}
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                                {bulk.editDetails}
                              </Link>
                            </DropdownMenu.Item>
                          )}
                          {member.signInToken && (
                            <DropdownMenu.Item
                              onSelect={() => void copySignInLink(member)}
                              className={menuItemClass}
                            >
                              <Link2 className="size-4" aria-hidden="true" />
                              {bulk.copySignInLink}
                            </DropdownMenu.Item>
                          )}

                          {rowActions.length > 0 && (
                            <DropdownMenu.Separator className="my-1 h-px bg-border" />
                          )}

                          {rowActions.map((kind) => {
                            const Icon = MEMBER_ACTION_ICON[kind];
                            return (
                              <DropdownMenu.Item
                                key={kind}
                                onSelect={() => start(kind, [member.id])}
                                className={cn(
                                  menuItemClass,
                                  isDangerAction(kind) &&
                                    "text-red-700 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
                                )}
                              >
                                <Icon className="size-4" aria-hidden="true" />
                                {memberActionLabel(kind, d)}
                              </DropdownMenu.Item>
                            );
                          })}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <PaginationLinks
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          totalPages={pagination.totalPages}
        />
      </TableWrapper>

      {pending && pendingTargets.length > 0 && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setPending(null)}
          {...describeMemberAction(pending.kind, pendingTargets, d)}
          onConfirm={(reason) => confirm(pending.kind, pending.ids, reason)}
        />
      )}
    </div>
  );
}
