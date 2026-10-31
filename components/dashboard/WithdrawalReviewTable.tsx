"use client";

import { useState } from "react";

import { AlertTriangle, Banknote, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney, gt } from "@/lib/money";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { useSiteRouter } from "@/hooks/use-site-paths";

interface Withdrawal {
  id: string;
  reference: string;
  memberName: string;
  memberNumber: string;
  memberPhone: string | null;
  amount: string;
  fee: string;
  netAmount: string;
  status: string;
  reason: string | null;
  channel: string;
  destinationDetail: string | null;
  balanceAtRequest: string;
  currentBalance: string;
  requestedAt: Date | string;
}

/**
 * Withdrawal review queue.
 *
 * The balance is shown BOTH as it was when the request was made and as it is
 * now. Those two figures diverging is the case an approver most needs to
 * notice: a member who has spent down their savings since requesting, whose
 * withdrawal would now overdraw them. The row is flagged when that happens.
 */
export function WithdrawalReviewTable({
  withdrawals,
  canApprove,
  canPayout,
}: {
  withdrawals: Withdrawal[];
  canApprove: boolean;
  canPayout: boolean;
}) {
  const router = useSiteRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.withdrawals;
  const [approving, setApproving] = useState<Withdrawal | null>(null);
  const [rejecting, setRejecting] = useState<Withdrawal | null>(null);
  const [paying, setPaying] = useState<Withdrawal | null>(null);
  const [payoutReference, setPayoutReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(
    withdrawal: Withdrawal,
    action: "approve" | "reject" | "payout",
    extra?: { reason?: string; externalReference?: string }
  ) {
    const response = await fetch(`/api/admin/withdrawals/${withdrawal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "reject"
          ? { action, reason: extra?.reason }
          : action === "payout"
            ? { action, externalReference: extra?.externalReference || undefined }
            : { action }
      ),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? copy.actionFailed);
    }

    setPayoutReference("");
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
              <TableHead>{d.common.member}</TableHead>
              <TableHead>{copy.colRequested}</TableHead>
              <TableHead align="right">{d.common.amount}</TableHead>
              <TableHead align="right">{d.common.balance}</TableHead>
              <TableHead>{copy.colPayoutTo}</TableHead>
              <TableHead>{d.common.status}</TableHead>
              <TableHead align="right">{copy.colAction}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {withdrawals.map((w) => {
              // Would the payout now exceed what the member actually holds?
              const insufficientNow = gt(w.amount, w.currentBalance);

              return (
                <TableRow key={w.id}>
                  <TableCell>
                    <span className="block font-medium text-ink">{w.memberName}</span>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {w.memberNumber} · {w.reference}
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(w.requestedAt, locale)}
                    {w.reason && (
                      <span className="mt-0.5 block max-w-[180px] truncate text-xs">
                        {w.reason}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span className="block font-semibold">
                      {formatMoney(w.amount, { showSymbol: false })}
                    </span>
                    {Number(w.fee) > 0 && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {fill(copy.net, {
                          amount: formatMoney(w.netAmount, { showSymbol: false }),
                        })}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span
                      className={insufficientNow ? "font-semibold text-red-600" : "text-ink"}
                    >
                      {formatMoney(w.currentBalance, { showSymbol: false })}
                    </span>
                    {insufficientNow && (
                      <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-semibold text-red-600">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {copy.belowRequest}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted">
                    <span className="block">
                      {statusLabel(w.channel, d.status)}
                    </span>
                    <span className="block text-xs">
                      {w.destinationDetail ?? w.memberPhone ?? "—"}
                    </span>
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={w.status} size="sm" />
                  </TableCell>

                  <TableCell align="right">
                    <div className="flex justify-end gap-2">
                      {w.status === "APPROVED" ? (
                        canPayout ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setError(null);
                              setPaying(w);
                            }}
                          >
                            <Banknote className="size-3.5" aria-hidden="true" />
                            {copy.recordPayout}
                          </Button>
                        ) : (
                          <span className="text-xs text-ink-muted">
                            {copy.awaitingPayout}
                          </span>
                        )
                      ) : canApprove ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              setError(null);
                              setApproving(w);
                            }}
                          >
                            <Check className="size-3.5" aria-hidden="true" />
                            {d.common.approve}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setError(null);
                              setRejecting(w);
                            }}
                          >
                            <X className="size-3.5" aria-hidden="true" />
                            {copy.decline}
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-ink-muted">
                          {copy.noPermission}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableWrapper>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title={copy.approveTitle}
        description={
          approving
            ? fill(copy.approveBody, {
                name: approving.memberName,
                amount: formatMoney(approving.amount),
              })
            : undefined
        }
        confirmLabel={d.common.approve}
        onConfirm={async () => {
          if (approving) await act(approving, "approve");
        }}
      >
        {approving && gt(approving.amount, approving.currentBalance) && (
          <Alert variant="error">
            {fill(copy.approveShortfall, {
              balance: formatMoney(approving.currentBalance),
              amount: formatMoney(approving.amount),
            })}
          </Alert>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={copy.declineTitle}
        description={
          rejecting
            ? fill(copy.declineBody, {
                name: rejecting.memberName,
                amount: formatMoney(rejecting.amount),
              })
            : undefined
        }
        confirmLabel={copy.decline}
        tone="danger"
        requireReason
        reasonLabel={copy.declineReasonLabel}
        reasonPlaceholder={copy.declineReasonPlaceholder}
        onConfirm={async (reason) => {
          if (rejecting) await act(rejecting, "reject", { reason });
        }}
      />

      <ConfirmDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        title={copy.payoutTitle}
        description={
          paying
            ? fill(copy.payoutBody, {
                amount: formatMoney(paying.netAmount),
                name: paying.memberName,
              })
            : undefined
        }
        confirmLabel={copy.payoutConfirm}
        onConfirm={async () => {
          if (paying) await act(paying, "payout", { externalReference: payoutReference });
        }}
      >
        <div className="space-y-2">
          <label htmlFor="payout-ref" className="block text-sm font-semibold text-ink">
            {copy.payoutReferenceLabel}
          </label>
          <Input
            id="payout-ref"
            value={payoutReference}
            onChange={(e) => setPayoutReference(e.target.value)}
            placeholder={copy.payoutReferencePlaceholder}
          />
          <p className="text-xs text-ink-muted">{copy.payoutReferenceHint}</p>
        </div>
      </ConfirmDialog>
    </>
  );
}
