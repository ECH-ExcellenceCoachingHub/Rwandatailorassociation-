"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Check,
  HelpCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, gt } from "@/lib/money";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";

interface Application {
  id: string;
  reference: string;
  status: string;
  requestedAmount: string;
  purpose: string;
  termMonths: number;
  frequency: string;
  submittedAt: Date | string | null;
  productName: string;
  interestRate: string;
  interestMethod: string;
  memberId: string;
  memberName: string;
  memberNumber: string;
  memberPhone: string | null;
  memberSince: Date | string | null;
  savingsBalance: string;
  lifetimeDeposits: string;
  savingsAtApplication: string | null;
  maxEligibleAmount: string | null;
  existingLoanCount: number;
  existingOutstanding: string;
  hasOverdueHistory: boolean;
  completedLoans: number;
  guarantors: {
    fullName: string;
    phone: string | null;
    status: string;
    memberNumber: string | null;
    /// What this guarantor covers. Null on guarantors recorded before amounts
    /// were asked for.
    amount: string | null;
  }[];
  /// What the loan is secured up to: own share, accepted guarantees and items.
  /// Null when the rules ask for no security above the own share.
  secured: {
    upTo: string;
    ownShare: string;
    accepted: string;
    collateral: string;
    pendingCount: number;
  } | null;
}

interface PendingLoan {
  id: string;
  reference: string;
  principal: string;
  interestRate: string;
  termMonths: number;
  frequency: string;
  productName: string;
  memberName: string;
  memberNumber: string;
  approvedAt: Date | string;
}

/**
 * Loan review workspace.
 *
 * Each application is shown with the member's full lending history alongside
 * it — savings, what they already owe, whether they have ever been overdue,
 * how many loans they have repaid. A reviewer deciding whether to lend the
 * association's money should not have to go and look those up, because in
 * practice they would not.
 */
export function LoanApplicationReview({
  applications,
  pendingDisbursement,
  canApprove,
  canReject,
  canDisburse,
}: {
  applications: Application[];
  pendingDisbursement: PendingLoan[];
  canApprove: boolean;
  canReject: boolean;
  canDisburse: boolean;
}) {
  const router = useRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.applications;

  const [approving, setApproving] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState<Application | null>(null);
  const [requestingInfo, setRequestingInfo] = useState<Application | null>(null);
  const [disbursing, setDisbursing] = useState<PendingLoan | null>(null);

  const [approvedAmount, setApprovedAmount] = useState("");
  const [infoText, setInfoText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function callApplication(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/loan-applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? copy.actionFailed);
    }
    router.refresh();
  }

  async function disburse(loan: PendingLoan) {
    const response = await fetch(`/api/admin/loans/${loan.id}/disburse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "SAVINGS_ACCOUNT" }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? copy.disbursementFailed);
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

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications" count={applications.length}>
            {copy.tabApplications}
          </TabsTrigger>
          <TabsTrigger value="disbursement" count={pendingDisbursement.length}>
            {copy.tabDisbursement}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="space-y-4">
            {applications.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-ink-muted">
                {copy.noneAwaitingReview}
              </p>
            )}

            {applications.map((application) => {
              const overCeiling =
                application.maxEligibleAmount !== null &&
                gt(application.requestedAmount, application.maxEligibleAmount);

              // Above what is secured: the server will refuse to approve the
              // full amount until more guarantors accept.
              const overSecured =
                application.secured !== null &&
                gt(application.requestedAmount, application.secured.upTo);

              return (
                <article
                  key={application.id}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-ink">
                        {formatMoney(application.requestedAmount)}
                        <span className="ml-2 text-sm font-normal text-ink-muted">
                          {fill(copy.overMonths, {
                            months: application.termMonths,
                            product: application.productName,
                          })}
                        </span>
                      </h3>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        <span className="font-medium text-ink">
                          {application.memberName}
                        </span>{" "}
                        · {application.memberNumber}
                        {application.memberPhone && ` · ${application.memberPhone}`}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        {application.reference}
                        {application.submittedAt &&
                          fill(copy.submittedOn, {
                            date: formatDate(application.submittedAt, locale),
                          })}
                      </p>
                    </div>
                    <StatusBadge status={application.status} />
                  </div>

                  <p className="mt-4 rounded-xl bg-background p-3 text-sm leading-relaxed text-ink">
                    <span className="font-semibold">{copy.purpose}</span>{" "}
                    {application.purpose}
                  </p>

                  {/* The member's lending history — the reviewer's evidence. */}
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric
                      label={copy.savingsBalance}
                      value={formatMoney(application.savingsBalance)}
                      note={
                        application.savingsAtApplication &&
                        application.savingsAtApplication !== application.savingsBalance
                          ? fill(copy.savingsWas, {
                              amount: formatMoney(application.savingsAtApplication),
                            })
                          : undefined
                      }
                    />
                    <Metric
                      label={copy.eligibleUpTo}
                      value={
                        application.maxEligibleAmount
                          ? formatMoney(application.maxEligibleAmount)
                          : "—"
                      }
                      tone={overCeiling ? "bad" : "good"}
                    />
                    <Metric
                      label={copy.alreadyOwing}
                      value={formatMoney(application.existingOutstanding)}
                      note={
                        application.existingLoanCount > 0
                          ? pluralize(
                              copy.activeLoanCount,
                              application.existingLoanCount
                            )
                          : copy.noActiveLoans
                      }
                      tone={application.existingLoanCount > 0 ? "bad" : undefined}
                    />
                    <Metric
                      label={copy.repaymentRecord}
                      value={
                        application.hasOverdueHistory
                          ? copy.hasBeenOverdue
                          : application.completedLoans > 0
                            ? fill(copy.loansRepaid, {
                                count: application.completedLoans,
                              })
                            : copy.noHistory
                      }
                      tone={application.hasOverdueHistory ? "bad" : "good"}
                    />
                  </dl>

                  {overCeiling && (
                    <Alert variant="warning" className="mt-4">
                      <AlertTriangle className="inline size-3.5" aria-hidden="true" />{" "}
                      {fill(copy.overCeiling, {
                        amount: formatMoney(application.requestedAmount),
                        ceiling: formatMoney(application.maxEligibleAmount!),
                      })}
                    </Alert>
                  )}

                  {application.hasOverdueHistory && (
                    <Alert variant="warning" className="mt-3">
                      {copy.overdueWarning}
                    </Alert>
                  )}

                  {application.guarantors.length > 0 && (
                    <div className="mt-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {copy.guarantors}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {application.guarantors.map((g, i) => (
                          <li
                            key={i}
                            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                          >
                            <span className="font-medium text-ink">{g.fullName}</span>
                            {g.memberNumber && (
                              <span className="font-mono text-ink-muted">{g.memberNumber}</span>
                            )}
                            {g.amount && (
                              <span className="font-semibold tabular-nums text-ink">
                                {formatMoney(g.amount)}
                              </span>
                            )}
                            <StatusBadge status={g.status} size="sm" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* What the loan rests on. Own share + accepted guarantees
                      (+ items) is the most the server will let anyone approve. */}
                  {application.secured && (
                    <dl className="mt-4 grid gap-4 rounded-xl bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric
                        label={copy.securedOwnShare}
                        value={formatMoney(application.secured.ownShare)}
                      />
                      <Metric
                        label={copy.securedGuarantors}
                        value={formatMoney(application.secured.accepted)}
                        note={
                          application.secured.pendingCount > 0
                            ? pluralize(
                                copy.guarantorsWaiting,
                                application.secured.pendingCount
                              )
                            : undefined
                        }
                      />
                      {gt(application.secured.collateral, 0) && (
                        <Metric
                          label={copy.securedItems}
                          value={formatMoney(application.secured.collateral)}
                        />
                      )}
                      <Metric
                        label={copy.securedUpTo}
                        value={formatMoney(application.secured.upTo)}
                        tone={overSecured ? "bad" : "good"}
                      />
                    </dl>
                  )}

                  {overSecured && (
                    <Alert variant="warning" className="mt-3">
                      {fill(copy.overSecured, {
                        amount: formatMoney(application.requestedAmount),
                        secured: formatMoney(application.secured!.upTo),
                      })}
                    </Alert>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {canApprove && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setError(null);
                          // Offer what can actually be approved today, not
                          // an amount the server will refuse.
                          setApprovedAmount(
                            overSecured ? application.secured!.upTo : application.requestedAmount
                          );
                          setApproving(application);
                        }}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        {d.common.approve}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setInfoText("");
                        setRequestingInfo(application);
                      }}
                    >
                      <HelpCircle className="size-3.5" aria-hidden="true" />
                      {copy.requestInfo}
                    </Button>
                    {canReject && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setError(null);
                          setRejecting(application);
                        }}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        {copy.decline}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="disbursement">
          <div className="space-y-3">
            {pendingDisbursement.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-ink-muted">
                {copy.noneAwaitingDisbursement}
              </p>
            )}

            {pendingDisbursement.map((loan) => (
              <div
                key={loan.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <div>
                  <p className="font-heading text-base font-bold text-ink">
                    {formatMoney(loan.principal)}
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {fill(copy.loanTerms, {
                        product: loan.productName,
                        rate: loan.interestRate,
                        months: loan.termMonths,
                      })}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {loan.memberName} · {loan.memberNumber} ·{" "}
                    <span className="font-mono text-xs">{loan.reference}</span>
                  </p>
                </div>

                {canDisburse ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setDisbursing(loan);
                    }}
                  >
                    <Banknote className="size-3.5" aria-hidden="true" />
                    {copy.disburse}
                  </Button>
                ) : (
                  <span className="text-xs text-ink-muted">
                    {copy.noDisbursePermission}
                  </span>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Approve */}
      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title={copy.approveTitle}
        description={
          approving
            ? fill(copy.approveBody, { name: approving.memberName })
            : undefined
        }
        confirmLabel={copy.approveConfirm}
        onConfirm={async () => {
          if (!approving) return;
          await callApplication(approving.id, {
            action: "approve",
            approvedAmount:
              approvedAmount !== approving.requestedAmount ? approvedAmount : undefined,
          });
        }}
      >
        <div className="space-y-2">
          <label htmlFor="approved-amount" className="block text-sm font-semibold text-ink">
            {copy.approvedAmount}
          </label>
          <Input
            id="approved-amount"
            inputMode="decimal"
            value={approvedAmount}
            onChange={(e) => setApprovedAmount(e.target.value)}
          />
          <p className="text-xs text-ink-muted">
            {copy.approvedAmountHint}
            {approving?.maxEligibleAmount &&
              fill(copy.approvedAmountCeiling, {
                amount: formatMoney(approving.maxEligibleAmount),
              })}
            {approving?.secured &&
              fill(copy.approvedAmountSecured, {
                amount: formatMoney(approving.secured.upTo),
              })}
          </p>
        </div>
      </ConfirmDialog>

      {/* Decline */}
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={copy.declineTitle}
        description={
          rejecting
            ? fill(copy.declineBody, { name: rejecting.memberName })
            : undefined
        }
        confirmLabel={copy.declineConfirm}
        tone="danger"
        requireReason
        reasonLabel={copy.declineReasonLabel}
        reasonPlaceholder={copy.declineReasonPlaceholder}
        onConfirm={async (reason) => {
          if (rejecting) {
            await callApplication(rejecting.id, { action: "reject", reason });
          }
        }}
      />

      {/* Request information */}
      <ConfirmDialog
        open={requestingInfo !== null}
        onOpenChange={(open) => !open && setRequestingInfo(null)}
        title={copy.infoTitle}
        description={copy.infoBody}
        confirmLabel={copy.infoConfirm}
        onConfirm={async () => {
          if (!requestingInfo) return;
          if (infoText.trim().length < 10) {
            throw new Error(copy.infoTooShort);
          }
          await callApplication(requestingInfo.id, {
            action: "request-info",
            infoRequested: infoText.trim(),
          });
        }}
      >
        <div className="space-y-2">
          <label htmlFor="info-text" className="block text-sm font-semibold text-ink">
            {copy.infoLabel}
          </label>
          <Textarea
            id="info-text"
            value={infoText}
            onChange={(e) => setInfoText(e.target.value)}
            placeholder={copy.infoPlaceholder}
            rows={3}
          />
        </div>
      </ConfirmDialog>

      {/* Disburse */}
      <ConfirmDialog
        open={disbursing !== null}
        onOpenChange={(open) => !open && setDisbursing(null)}
        title={copy.disburseTitle}
        description={
          disbursing
            ? fill(copy.disburseBody, {
                amount: formatMoney(disbursing.principal),
                name: disbursing.memberName,
              })
            : undefined
        }
        confirmLabel={copy.disburseConfirm}
        onConfirm={async () => {
          if (disbursing) await disburse(disbursing);
        }}
      />
    </>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-heading text-sm font-bold tabular-nums ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {note && <p className="mt-0.5 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
