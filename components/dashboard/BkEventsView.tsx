"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import type { AdminCopy } from "@/lib/i18n/dashboard/admin";
import type { Locale } from "@/types";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { fill } from "@/lib/i18n/fill";
import { formatDateTime } from "@/lib/i18n/dates";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";

/**
 * Bank of Kigali event console.
 *
 * The screen exists to answer one question: when we claim a payment, does it
 * come back through BK's transaction list? So the claims table leads with
 * whether the sync has seen each claim, and how long it took — not with the
 * claim's own metadata, which nobody is wondering about.
 *
 * Claiming and syncing are deliberately separate buttons. Running them
 * together would hide which half failed, and failure attribution is the entire
 * value of a diagnostic screen.
 */

interface ClaimRow {
  id: string;
  clientReference: string;
  payerCode: string;
  narration: string;
  amount: string;
  status: string;
  failed: boolean;
  errorMessage: string | null;
  expiryTime: string | null;
  observedAt: string | null;
  observedTransactionId: string | null;
  createdAt: string;
  memberName: string | null;
  createdByName: string | null;
}

interface SyncResult {
  transactionsFetched: number;
  transactionsCreated: number;
  matchedCount: number;
  unmatchedCount: number;
}

export function BkEventsView({
  copy,
  locale,
  config,
  claims,
  stats,
  canClaim,
  canSync,
}: {
  copy: AdminCopy["bk"];
  locale: Locale;
  config: {
    mode: string;
    baseUrl: string;
    configured: boolean;
    collectionAccount: string | null;
  };
  claims: ClaimRow[];
  stats: { total: number; matched: number; unmatched: number };
  canClaim: boolean;
  canSync: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [payerCode, setPayerCode] = useState("");
  const [narration, setNarration] = useState("");
  const [amount, setAmount] = useState("");

  const [claiming, setClaiming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const busy = claiming || syncing || pending;

  async function claim() {
    setError(null);
    setNotice(null);
    setClaiming(true);

    try {
      const response = await fetch("/api/admin/bk/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerCode: payerCode.trim(),
          narration: narration.trim(),
          amount: Number(amount),
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.error?.message ?? body?.message ?? copy.claimFailed);
        return;
      }

      setNotice(`${copy.claimSucceeded} — ${body?.data?.clientReference ?? ""}`);
      setPayerCode("");
      setNarration("");
      setAmount("");
      startTransition(() => router.refresh());
    } catch {
      setError(copy.claimFailed);
    } finally {
      setClaiming(false);
    }
  }

  async function sync() {
    setError(null);
    setNotice(null);
    setSyncResult(null);
    setSyncing(true);

    try {
      const response = await fetch("/api/admin/bk/sync-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.error?.message ?? body?.message ?? copy.syncFailed);
        return;
      }

      setSyncResult({
        transactionsFetched: body?.data?.transactionsFetched ?? 0,
        transactionsCreated: body?.data?.transactionsCreated ?? 0,
        matchedCount: body?.data?.matchedCount ?? 0,
        unmatchedCount: body?.data?.unmatchedCount ?? 0,
      });
      setNotice(copy.syncSucceeded);
      startTransition(() => router.refresh());
    } catch {
      setError(copy.syncFailed);
    } finally {
      setSyncing(false);
    }
  }

  const canSubmitClaim =
    canClaim && /^\d{6}$/.test(payerCode.trim()) && narration.trim().length > 0 && Number(amount) > 0;

  return (
    <div className="space-y-6">
      {/* Connection ------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">{copy.connectionTitle}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-ink-muted">{copy.mode}</dt>
            <dd className="mt-0.5 font-medium text-ink">{config.mode}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.baseUrl}</dt>
            <dd className="mt-0.5 break-all font-medium text-ink">{config.baseUrl}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.collectionAccount}</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {config.collectionAccount ?? copy.notSet}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.credentials}</dt>
            <dd className="mt-0.5">
              <StatusBadge
                status={config.configured ? "ACTIVE" : "INACTIVE"}
                tone={config.configured ? "success" : "danger"}
                label={config.configured ? copy.configured : copy.notConfigured}
                size="sm"
              />
            </dd>
          </div>
        </dl>
      </section>

      <Alert variant="info" title={copy.howTitle}>
        <ol className="mt-1 list-inside list-decimal space-y-1">
          <li>{copy.howStep1}</li>
          <li>{copy.howStep2}</li>
          <li>{copy.howStep3}</li>
        </ol>
      </Alert>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <StatGrid columns={4}>
        <StatCard label={copy.statFetched} value={String(stats.total)} />
        <StatCard label={copy.statMatched} value={String(stats.matched)} tone="success" />
        <StatCard label={copy.statUnmatched} value={String(stats.unmatched)} tone="warning" />
        <StatCard label={copy.claimsTitle} value={String(claims.length)} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Claim ---------------------------------------------------------- */}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">{copy.claimTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{copy.claimDescription}</p>

          <div className="mt-4 space-y-4">
            <Field id="payerCode" label={copy.payerCode} hint={copy.payerCodeHint}>
              {(props) => (
                <Input
                  {...props}
                  value={payerCode}
                  inputMode="numeric"
                  maxLength={6}
                  disabled={!canClaim || busy}
                  onChange={(e) => setPayerCode(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </Field>

            <Field id="narration" label={copy.narration}>
              {(props) => (
                <Input
                  {...props}
                  value={narration}
                  maxLength={200}
                  disabled={!canClaim || busy}
                  onChange={(e) => setNarration(e.target.value)}
                />
              )}
            </Field>

            <Field id="amount" label={copy.amount}>
              {(props) => (
                <Input
                  {...props}
                  value={amount}
                  inputMode="decimal"
                  disabled={!canClaim || busy}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                />
              )}
            </Field>

            <Button onClick={claim} disabled={!canSubmitClaim || busy}>
              {claiming ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {claiming ? copy.claiming : copy.claimButton}
            </Button>
          </div>
        </section>

        {/* Sync ----------------------------------------------------------- */}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">{copy.syncTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{copy.syncDescription}</p>

          <Button
            variant="outline"
            className="mt-4"
            onClick={sync}
            disabled={!canSync || busy}
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            {syncing ? copy.syncing : copy.syncButton}
          </Button>

          {syncResult && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-muted">{copy.statFetched}</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {syncResult.transactionsFetched}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">{copy.statCreated}</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {syncResult.transactionsCreated}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">{copy.statMatched}</dt>
                <dd className="font-semibold tabular-nums text-ink">{syncResult.matchedCount}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{copy.statUnmatched}</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {syncResult.unmatchedCount}
                </dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      {/* Claims ---------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{copy.claimsTitle}</h2>

        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.observed}</TableHead>
                <TableHead>{copy.reference}</TableHead>
                <TableHead>{copy.narration}</TableHead>
                <TableHead className="text-right">{copy.amount}</TableHead>
                <TableHead>{copy.status}</TableHead>
                <TableHead>{copy.raised}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.length === 0 && <TableEmpty colSpan={6}>{copy.noClaims}</TableEmpty>}

              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    <ObservedCell claim={claim} copy={copy} locale={locale} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{claim.clientReference}</TableCell>
                  <TableCell>
                    {claim.narration}
                    {claim.errorMessage && (
                      <span className="mt-0.5 block text-xs text-red-600">
                        {claim.errorMessage}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{claim.amount}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={claim.status}
                      tone={claim.failed ? "danger" : claim.status === "CLAIMED" ? "success" : "neutral"}
                      label={claim.status}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ink-muted">
                    {formatDateTime(new Date(claim.createdAt), locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>
    </div>
  );
}

/**
 * Whether the sync has seen this claim, and how long BK took to show it.
 *
 * The elapsed time is the useful part: "seen" alone does not tell you whether
 * the integration is quick enough to reconcile against.
 */
function ObservedCell({
  claim,
  copy,
  locale,
}: {
  claim: ClaimRow;
  copy: AdminCopy["bk"];
  locale: Locale;
}) {
  if (claim.failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
        <XCircle className="size-4 shrink-0" aria-hidden="true" />
        {copy.claimFailed}
      </span>
    );
  }

  if (!claim.observedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        {copy.notYetSeen}
      </span>
    );
  }

  const elapsedMs = new Date(claim.observedAt).getTime() - new Date(claim.createdAt).getTime();

  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
      title={formatDateTime(new Date(claim.observedAt), locale)}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      {fill(copy.seenAfter, { duration: humaniseElapsed(elapsedMs) })}
    </span>
  );
}

function humaniseElapsed(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
