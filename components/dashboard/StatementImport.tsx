"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Phone,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/money";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, pluralize } from "@/lib/i18n/fill";
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

/**
 * Bank statement import.
 *
 * The review step is the whole design. Parsing a PDF is unreliable enough that
 * an administrator must see, for every row, what the system read and who it
 * would credit — before any of it becomes a ledger entry.
 *
 * Three deliberate choices:
 *
 *  • Rows the parser is unsure about are UNTICKED by default. The admin has to
 *    positively choose to import them, which is the right default when the
 *    consequence of a misread is money in the wrong account.
 *
 *  • Every row shows the raw text as it appeared in the PDF, so the admin can
 *    check the reading against the document in front of them.
 *
 *  • Rows already imported are shown but locked, so a re-upload visibly does
 *    nothing rather than silently appearing to work.
 */

interface PreviewRow {
  fingerprint: string;
  occurrence: number;
  date: string;
  rawLine: string;
  description: string;
  bankReference: string | null;
  payerName: string | null;
  payerPhone: string | null;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  balanceAfter: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  externalTransactionId: string;
  alreadyImported: boolean;
  matchedMemberName: string | null;
  matchedMemberNumber: string | null;
  matchStrategy: string;
  matchConfidence: number;
  matchEvidence: string;
  wouldAutoCredit: boolean;
}

interface Preview {
  fileName: string;
  fileHash: string;
  pageCount: number;
  extractionMode: "pdfplumber" | "layout" | "flat";
  pagesWithoutText: number[];
  coverage: {
    linesRead: number;
    structuralLines: number;
    transactionLines: number;
    unparsedCount: number;
    otherLines: number;
  };
  detectedAccount: string | null;
  detectedPeriod: { from: string | null; to: string | null };
  accountMismatch: boolean;
  expectedAccount: string | null;
  unparsedLines: string[];
  rows: PreviewRow[];
  summary: {
    total: number;
    credits: number;
    debits: number;
    alreadyImported: number;
    wouldCredit: number;
    wouldGoToUnmatched: number;
    lowConfidence: number;
    totalCreditAmount: string;
  };
}

export function StatementImport({ canImport }: { canImport: boolean }) {
  const router = useRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.import;
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The counts, not the sentence: the route reports what happened in figures
  // and this component writes them up in the administrator's language.
  const [result, setResult] = useState<{
    credited: number;
    unmatched: number;
    skipped: number;
  } | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    setResult(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/statements/parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? copy.readFailed);
        setUploading(false);
        return;
      }

      const data = payload as Preview;
      setPreview(data);

      // Pre-tick only rows the parser is confident about AND that matched a
      // member. Everything else is a deliberate decision for the admin.
      setSelected(
        new Set(
          data.rows
            .filter(
              (row) =>
                row.direction === "CREDIT" &&
                !row.alreadyImported &&
                row.confidence === "high" &&
                row.wouldAutoCredit
            )
            .map((row) => row.fingerprint)
        )
      );
    } catch {
      setError(copy.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function commit() {
    if (!preview) return;

    const response = await fetch("/api/admin/statements/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: preview.fileName,
        fileHash: preview.fileHash,
        rows: preview.rows.map((row) => ({
          fingerprint: row.fingerprint,
          occurrence: row.occurrence,
          date: row.date,
          rawLine: row.rawLine,
          description: row.description,
          bankReference: row.bankReference,
          amount: row.amount,
          direction: row.direction,
          balanceAfter: row.balanceAfter,
          confidence: row.confidence,
          warnings: row.warnings,
        })),
        selectedFingerprints: [...selected],
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? copy.importFailed);
    }

    setResult({
      credited: payload.credited ?? 0,
      unmatched: payload.unmatched ?? 0,
      skipped: payload.skipped ?? 0,
    });
    setPreview(null);
    setSelected(new Set());
    router.refresh();
  }

  const confidenceLabel = (value: PreviewRow["confidence"]) =>
    value === "high"
      ? copy.confidenceHigh
      : value === "medium"
        ? copy.confidenceMedium
        : copy.confidenceLow;

  const importable = preview?.rows.filter(
    (row) => row.direction === "CREDIT" && !row.alreadyImported
  );

  const selectedRows = preview?.rows.filter((r) => selected.has(r.fingerprint)) ?? [];
  const selectedTotal = selectedRows.reduce(
    (total, row) => total + Number(row.amount),
    0
  );

  // ---- Result -------------------------------------------------------------
  if (result) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title={copy.completeTitle}>
          {[
            pluralize(copy.importedCredited, result.credited),
            pluralize(copy.importedUnmatched, result.unmatched),
            // Only worth a sentence when it happened; a re-upload of a
            // statement already imported is the normal case for this line.
            result.skipped > 0
              ? pluralize(copy.importedSkipped, result.skipped)
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </Alert>
        <Button onClick={() => setResult(null)}>
          <Upload className="size-4" aria-hidden="true" />
          {copy.importAnother}
        </Button>
      </div>
    );
  }

  // ---- Upload -------------------------------------------------------------
  if (!preview) {
    return (
      <div>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        <label
          htmlFor="statement-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-14 text-center transition-colors hover:border-primary hover:bg-primary-50/30"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleUpload(file);
          }}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            {uploading ? (
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="size-6" aria-hidden="true" />
            )}
          </span>

          <span className="mt-5 font-heading text-lg font-semibold text-ink">
            {uploading ? copy.reading : copy.dropPrompt}
          </span>
          <span className="mt-1.5 max-w-sm text-sm text-ink-muted">
            {copy.dropHint}
          </span>

          <input
            ref={fileInput}
            id="statement-file"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </label>
      </div>
    );
  }

  // ---- Review -------------------------------------------------------------
  return (
    <div className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      {preview.accountMismatch && (
        <Alert variant="error" title={copy.wrongAccountTitle}>
          {fill(copy.wrongAccountBody, {
            detected: preview.detectedAccount ?? "—",
            expected: preview.expectedAccount ?? "—",
          })}
        </Alert>
      )}

      {preview.summary.lowConfidence > 0 && (
        <Alert variant="warning" title={copy.lowConfidenceTitle}>
          {pluralize(copy.lowConfidenceBody, preview.summary.lowConfidence)}
        </Alert>
      )}

      {preview.extractionMode === "layout" && (
        <Alert variant="warning" title={copy.fallbackParserTitle}>
          {copy.fallbackParserBody}
        </Alert>
      )}

      {preview.extractionMode === "flat" && (
        <Alert variant="error" title={copy.noLayoutTitle}>
          {copy.noLayoutBody}
        </Alert>
      )}

      {preview.pagesWithoutText.length > 0 && (
        <Alert variant="warning" title={copy.noTextPagesTitle}>
          {pluralize(copy.noTextPagesBody, preview.pagesWithoutText.length, {
            pages: preview.pagesWithoutText.join(", "),
          })}
        </Alert>
      )}

      {/* File summary */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-heading text-base font-semibold text-ink">
              {preview.fileName}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {pluralize(copy.fileSummary, preview.pageCount, {
                pages: preview.pageCount,
              })}{" "}
              · {pluralize(copy.rowsRead, preview.summary.total)}
              {preview.detectedAccount &&
                fill(copy.fileAccount, { account: preview.detectedAccount })}
              {preview.detectedPeriod.from &&
                fill(copy.filePeriod, {
                  from: preview.detectedPeriod.from,
                  to: preview.detectedPeriod.to ?? "—",
                })}
            </p>

            {/* Where every line of the document ended up. Shown so the admin
                can confirm nothing was silently dropped between the PDF and
                the table below — the counts add up to linesRead. */}
            <p className="mt-2 text-xs text-ink-muted">
              {fill(copy.coverageLead, { count: preview.coverage.linesRead })}{" "}
              <strong className="text-ink">
                {fill(copy.coverageTransactions, {
                  count: preview.coverage.transactionLines,
                })}
              </strong>
              {fill(copy.coverageRest, {
                structural: preview.coverage.structuralLines,
                other: preview.coverage.otherLines,
              })}
              {preview.coverage.unparsedCount > 0 && (
                <>
                  ,{" "}
                  <strong className="text-amber-700">
                    {fill(copy.coverageUnreadable, {
                      count: preview.coverage.unparsedCount,
                    })}
                  </strong>
                </>
              )}
              .
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreview(null);
              setSelected(new Set());
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            {d.common.cancel}
          </Button>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label={copy.figCredits}
            value={String(preview.summary.credits)}
          />
          <Figure
            label={copy.figWouldMatch}
            value={String(preview.summary.wouldCredit)}
            tone="good"
          />
          <Figure
            label={copy.figWouldUnmatch}
            value={String(preview.summary.wouldGoToUnmatched)}
            tone={preview.summary.wouldGoToUnmatched > 0 ? "warn" : undefined}
          />
          <Figure
            label={copy.figAlreadyImported}
            value={String(preview.summary.alreadyImported)}
          />
        </dl>
      </div>

      {/* Rows */}
      <TableWrapper>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-sm text-ink-muted">
            <strong className="text-ink">
              {pluralize(copy.rowsSelected, selected.size)}
            </strong>{" "}
            ·{" "}
            <strong className="text-ink">
              {formatMoney(String(selectedTotal.toFixed(2)))}
            </strong>
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(importable?.map((r) => r.fingerprint) ?? []))
              }
              className="text-xs font-semibold text-primary hover:underline"
            >
              {copy.selectAllImportable}
            </button>
            <span className="text-ink-muted">·</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-semibold text-ink-muted hover:underline"
            >
              {d.common.clear}
            </button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"> </TableHead>
              <TableHead>{d.common.date}</TableHead>
              <TableHead>{copy.colDescription}</TableHead>
              <TableHead align="right">{d.common.amount}</TableHead>
              <TableHead>{copy.colWouldCredit}</TableHead>
              <TableHead>{copy.colParser}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {preview.rows.map((row) => {
              const selectable = row.direction === "CREDIT" && !row.alreadyImported;
              const isSelected = selected.has(row.fingerprint);

              return (
                <TableRow
                  key={row.fingerprint}
                  className={
                    row.alreadyImported
                      ? "opacity-50"
                      : row.direction === "DEBIT"
                        ? "opacity-60"
                        : undefined
                  }
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!selectable || !canImport}
                      aria-label={fill(copy.includeRow, {
                        description: row.description,
                      })}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(row.fingerprint);
                        else next.delete(row.fingerprint);
                        setSelected(next);
                      }}
                      className="size-4 cursor-pointer rounded border-border accent-[var(--color-primary)] disabled:cursor-not-allowed"
                    />
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(row.date, locale)}
                  </TableCell>

                  <TableCell className="max-w-md">
                    <span className="block text-sm text-ink">{row.description}</span>

                    {/* What the parser read as the sender. Shown because these
                        are what identify the member when no reference was
                        quoted — a wrong reading here is a wrong match. */}
                    {(row.payerName || row.payerPhone) && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
                        {row.payerName && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3" aria-hidden="true" />
                            {row.payerName}
                          </span>
                        )}
                        {row.payerPhone && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="size-3" aria-hidden="true" />
                            {row.payerPhone}
                          </span>
                        )}
                      </span>
                    )}

                    {/* The raw line, so the admin can check the reading. */}
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-muted/70">
                      {row.rawLine}
                    </span>
                    {row.warnings.map((warning) => (
                      <span
                        key={warning}
                        className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-700"
                      >
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {warning}
                      </span>
                    ))}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span
                      className={
                        row.direction === "CREDIT" ? "text-emerald-700" : "text-ink-muted"
                      }
                    >
                      {row.direction === "CREDIT" ? "+" : "−"}
                      {formatMoney(row.amount, { showSymbol: false })}
                    </span>
                  </TableCell>

                  <TableCell className="max-w-xs">
                    {row.alreadyImported ? (
                      <span className="text-xs font-medium text-ink-muted">
                        {copy.alreadyImported}
                      </span>
                    ) : row.direction === "DEBIT" ? (
                      <span className="text-xs text-ink-muted">
                        {copy.debitNotContribution}
                      </span>
                    ) : row.matchedMemberName ? (
                      <>
                        <span className="block text-sm font-medium text-ink">
                          {row.matchedMemberName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {row.matchedMemberNumber} · {row.matchEvidence}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-amber-700">
                        {copy.noMemberMatched}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge
                      status={row.confidence.toUpperCase()}
                      tone={
                        row.confidence === "high"
                          ? "success"
                          : row.confidence === "medium"
                            ? "warning"
                            : "danger"
                      }
                      label={confidenceLabel(row.confidence)}
                      size="sm"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableWrapper>

      {preview.unparsedLines.length > 0 && (
        <details className="rounded-2xl border border-border bg-surface p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {pluralize(copy.unparsedSummary, preview.unparsedLines.length)}
          </summary>
          <p className="mt-2 text-xs text-ink-muted">{copy.unparsedNote}</p>
          <ul className="mt-3 space-y-1">
            {preview.unparsedLines.map((line, index) => (
              <li key={index} className="font-mono text-[11px] text-ink-muted">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={selected.size === 0 || !canImport}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {pluralize(copy.importButton, selected.size)}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={pluralize(copy.confirmTitle, selected.size)}
        description={fill(copy.confirmBody, {
          amount: formatMoney(String(selectedTotal.toFixed(2))),
        })}
        confirmLabel={copy.confirmLabel}
        requireReason
        reasonLabel={copy.confirmReasonLabel}
        reasonPlaceholder={copy.confirmReasonPlaceholder}
        onConfirm={commit}
      >
        <Alert variant="warning">{copy.attestation}</Alert>
      </ConfirmDialog>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 font-heading text-lg font-bold tabular-nums ${
          tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
