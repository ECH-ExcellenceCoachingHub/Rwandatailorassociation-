"use client";

import { useState } from "react";

import {
  Download,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * The sign-in QR code, its controls, and the card that gets printed.
 *
 * THE IMAGE ARRIVES AS RENDERED SVG FROM THE SERVER. This component never sees
 * the token, never fetches it, and never puts it in a JSON response — it is
 * handed markup and draws it. That is why generating a new code calls the API
 * and then `router.refresh()` rather than reading a token out of the response:
 * the secret makes exactly one trip, as pixels, into the owner's own page.
 *
 * The card markup carries `print-card`, and everything the reader can press
 * carries `print-hidden`; the rules that make those mean something live in
 * app/globals.css. A printed card with a "Replace this code" button on it
 * would be an odd thing to hand someone.
 */

export interface QrCodeCardProps {
  /// Pre-rendered SVG for the active code, or null when the user has none.
  svg: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  /// Whole days until the code expires, computed on the server. Working it out
  /// here would mean reading the clock during render, which makes the result
  /// depend on when React happens to re-render rather than on the data.
  daysUntilExpiry: number | null;
  lastUsedAt: string | null;
  useCount: number;
  holderName: string;
  /// Membership number for a member, or the role label for staff.
  holderReference: string;
  associationName: string;
}

export function QrCodeCard({
  svg,
  issuedAt,
  expiresAt,
  daysUntilExpiry,
  lastUsedAt,
  useCount,
  holderName,
  holderReference,
  associationName,
}: QrCodeCardProps) {
  const router = useSiteRouter();
  const { d, locale } = useLanguage();
  const copy = d.account.qr;

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<"replace" | "revoke" | null>(null);

  async function mutate(method: "POST" | "DELETE") {
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch("/api/account/qr", { method });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      // The new code is drawn by the server on the next render, not from this
      // response. See the note at the top of the file.
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (!svg) {
    return (
      <div className="space-y-4">
        {failed && (
          <Alert variant="error" title={copy.failedTitle}>
            {copy.failedBody}
          </Alert>
        )}

        <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center sm:p-8">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <QrCode className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-heading text-lg font-semibold text-ink">
            {copy.noCodeTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {copy.noCodeBody}
          </p>
          <Button
            className="mt-6 w-full sm:w-auto"
            disabled={busy}
            onClick={() => void mutate("POST")}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <QrCode className="size-4" aria-hidden="true" />
            )}
            {busy ? copy.generating : copy.generate}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {failed && (
        <Alert variant="error" title={copy.failedTitle} className="print-hidden">
          {copy.failedBody}
        </Alert>
      )}

      {daysUntilExpiry !== null && daysUntilExpiry <= 21 && (
        <Alert variant="warning" className="print-hidden">
          {fill(copy.expiringSoon, { days: Math.max(daysUntilExpiry, 0) })}
        </Alert>
      )}

      <div className="grid gap-4 sm:gap-5 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* The card itself — this is what comes out of the printer. */}
        <div className="print-card rounded-2xl border border-border bg-white p-5 text-center shadow-card sm:p-6">
          <p className="font-heading text-sm font-bold uppercase tracking-widest text-primary">
            {associationName}
          </p>

          <div
            className="mx-auto mt-4 w-full max-w-[240px] [&>svg]:h-auto [&>svg]:w-full sm:max-w-[260px]"
            // Server-rendered by the `qrcode` library from a URL this app
            // built; no user-supplied string reaches it.
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <p className="mt-4 break-words font-heading text-lg font-bold text-ink">
            {holderName}
          </p>
          <p className="mt-0.5 break-all font-mono text-sm tracking-wide text-ink-muted">
            {holderReference}
          </p>

          <p className="mt-4 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {copy.scanToSignIn}
          </p>
        </div>

        <div className="space-y-5 print-hidden">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 className="font-heading text-base font-semibold text-ink">
              {copy.howToTitle}
            </h2>
            <ol className="mt-3 space-y-2.5 text-sm text-ink-muted">
              {[copy.howToStepOne, copy.howToStepTwo, copy.howToStepThree].map(
                (step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                )
              )}
            </ol>

            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
              {/* Plain links, not fetch calls: the browser's own download
                  handling is what puts a real file in Downloads on the cheap
                  Android phones this is for. */}
              <Button asChild variant="outline" size="sm">
                <a href="/api/account/qr/image?format=png" download>
                  <Download className="size-3.5" aria-hidden="true" />
                  {copy.downloadPng}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/api/account/qr/image?format=svg" download>
                  <Download className="size-3.5" aria-hidden="true" />
                  {copy.downloadSvg}
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-3.5" aria-hidden="true" />
                {copy.print}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-amber-900">
              <ShieldAlert className="size-4" aria-hidden="true" />
              {copy.keepSafeTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900/90">
              {copy.keepSafeBody}
            </p>
          </div>

          <dl className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm shadow-card sm:grid-cols-2">
            <Fact
              label={fill(copy.issuedOn, {
                date: issuedAt ? formatDate(issuedAt, locale) : "—",
              })}
            />
            <Fact
              label={fill(copy.validUntil, {
                date: expiresAt ? formatDate(expiresAt, locale) : "—",
              })}
            />
            <Fact
              label={
                lastUsedAt
                  ? fill(copy.lastUsed, { date: formatDate(lastUsedAt, locale) })
                  : copy.neverUsed
              }
            />
            <Fact label={pluralize(copy.timesUsed, useCount)} />
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming("replace")}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden="true" />
              )}
              {busy ? copy.working : copy.regenerate}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-red-600 hover:bg-red-50"
              onClick={() => setConfirming("revoke")}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {copy.revoke}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming === "replace"}
        onOpenChange={(open) => setConfirming(open ? "replace" : null)}
        title={copy.regenerateConfirmTitle}
        description={copy.regenerateConfirmBody}
        confirmLabel={copy.regenerateConfirmAction}
        onConfirm={() => mutate("POST")}
      />

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => setConfirming(open ? "revoke" : null)}
        title={copy.revokeConfirmTitle}
        description={copy.revokeConfirmBody}
        confirmLabel={copy.revokeConfirmAction}
        tone="danger"
        onConfirm={() => mutate("DELETE")}
      />
    </div>
  );
}

function Fact({ label }: { label: string }) {
  return <dd className="text-ink-muted">{label}</dd>;
}
