"use client";

import { useState } from "react";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useSiteRouter } from "@/hooks/use-site-paths";

interface PendingMember {
  id: string;
  memberNumber: string;
  paymentReference: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  district: string | null;
  appliedAt: Date | string;
}

/**
 * Membership approval queue.
 *
 * Approval takes no reason — admitting someone is the expected outcome and
 * demanding justification for it would just train administrators to type
 * "ok". Declining does require one, because the applicant is told what it was
 * and because a refused membership is the decision someone may later contest.
 */
export function PendingMembersTable({
  members,
  page,
  pageSize,
  total,
  totalPages,
}: {
  members: PendingMember[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const router = useSiteRouter();
  const { d, locale } = useLanguage();
  const copy = d.views.pendingMembers;

  const [approving, setApproving] = useState<PendingMember | null>(null);
  const [rejecting, setRejecting] = useState<PendingMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    member: PendingMember,
    action: "approve" | "reject",
    reason?: string
  ) {
    const response = await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "approve" ? { action } : { action, reason }
      ),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? copy.actionFailed);
    }

    router.refresh();
  }

  return (
    <>
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.colApplicant}</TableHead>
              <TableHead>{copy.colContact}</TableHead>
              <TableHead>{copy.colOccupation}</TableHead>
              <TableHead>{copy.colApplied}</TableHead>
              <TableHead align="right">{copy.colDecision}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <span className="block font-medium text-ink">{member.fullName}</span>
                  <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                    {member.memberNumber}
                  </span>
                </TableCell>

                <TableCell className="text-sm text-ink-muted">
                  {member.phone && <span className="block">{member.phone}</span>}
                  {member.email && (
                    <span className="block max-w-[200px] truncate text-xs">
                      {member.email}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-sm text-ink-muted">
                  {member.occupation ?? "—"}
                  {member.district && (
                    <span className="mt-0.5 block text-xs">{member.district}</span>
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                  {formatDate(member.appliedAt, locale)}
                </TableCell>

                <TableCell align="right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setApproving(member);
                      }}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      {copy.approve}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setRejecting(member);
                      }}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      {copy.decline}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={(next) => router.push(`?page=${next}`)}
        />
      </TableWrapper>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title={copy.approveTitle}
        description={
          approving
            ? fill(copy.approveBody, {
                name: approving.fullName,
                reference: approving.paymentReference,
              })
            : undefined
        }
        confirmLabel={copy.approveConfirm}
        onConfirm={async () => {
          if (approving) await act(approving, "approve");
        }}
      />

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={copy.declineTitle}
        description={
          rejecting
            ? fill(copy.declineBody, { name: rejecting.fullName })
            : undefined
        }
        confirmLabel={copy.declineConfirm}
        tone="danger"
        requireReason
        reasonLabel={copy.declineReasonLabel}
        reasonPlaceholder={copy.declineReasonPlaceholder}
        onConfirm={async (reason) => {
          if (rejecting) await act(rejecting, "reject", reason);
        }}
      />
    </>
  );
}
