"use client";

import { useRef, useState, useEffect } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/LanguageProvider";
import { formatMoney, toMoney } from "@/lib/money";
import { formatDate } from "@/lib/i18n/dates";

interface MoMoImportResult {
  processed: number;
  members: string[];
  message: string;
}

interface MemberOption {
  id: string;
  memberNumber: string;
  fullName: string;
  phone: string | null;
}

interface ParsedPreviewRow {
  fingerprint: string;
  date: string;
  description: string;
  amount: string;
  direction: string;
  matchedMemberName: string | null;
  matchedMemberNumber: string | null;
  matchConfidence: number;
  wouldAutoCredit: boolean;
  payerPhone: string | null;
}

interface ParsedPreviewPayload {
  rows: ParsedPreviewRow[];
  fileName: string;
  fileHash: string;
}

export function MoMoStatementImport({ canImport }: { canImport: boolean }) {
  const { d, locale } = useLanguage();
  const copy = d.admin.memberCards;
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ParsedPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<MoMoImportResult | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [manualAssignments, setManualAssignments] = useState<Map<string, string>>(new Map());

  async function fetchMembers() {
    try {
      const response = await fetch("/api/admin/members/list?active=true");
      if (response.ok) {
        const data = await response.json();
        const fetchedMembers: MemberOption[] = data.members.map((m: MemberOption) => ({
          id: m.id,
          memberNumber: m.memberNumber,
          fullName: m.fullName,
          phone: m.phone ?? null,
        }));
        setMembers(fetchedMembers);
        matchRowsByPhone(fetchedMembers);
      }
    } catch {
      // Silent fail — manual matching is optional
    }
  }

  function matchRowsByPhone(memberList: MemberOption[]) {
    if (!preview) return;

    const phoneToMember = new Map<string, MemberOption>();
    for (const m of memberList) {
      if (!m.phone) continue;
      const normalized = normalizePhone(m.phone);
      if (normalized) phoneToMember.set(normalized, m);
    }

    const assignments = new Map<string, string>();

    for (const row of preview.rows) {
      if (row.matchedMemberName !== null) continue;
      if (!toMoney(row.amount).equals(toMoney(2000))) continue;
      if (!row.payerPhone) continue;

      const normalized = normalizePhone(row.payerPhone);
      if (normalized && phoneToMember.has(normalized)) {
        const member = phoneToMember.get(normalized)!;
        assignments.set(row.fingerprint, member.id);
      }
    }

    setManualAssignments(assignments);
  }

  function normalizePhone(raw: string): string | null {
    if (!raw) return null;
    let digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) digits = digits.slice(1);
    if (digits.startsWith("0")) digits = "250" + digits.slice(1);
    if (!digits.startsWith("250")) digits = "250" + digits;
    if (digits.length !== 12 || !/^\d+$/.test(digits)) return null;
    return "+" + digits;
  }

  function extractNameFromDescription(description: string): string | null {
    const match = description.match(/SUCCESSFUL PAYMENT\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s+EXCELLENCE COACHING/);
    if (!match) return null;
    const between = match[1].trim().replace(/\s+/g, " ");
    if (!/[A-Za-z]/.test(between)) return null;
    if (between.replace(/\D/g, "").length >= 9) return null;
    return between;
  }

  function findMemberIdByName(fullName: string): string | undefined {
    return members.find((m) => m.fullName === fullName)?.id;
  }

  function MemberAssignmentPicker({
    row,
    members,
    value,
    onChange,
  }: {
    row: ParsedPreviewRow;
    members: MemberOption[];
    value: string | undefined;
    onChange: (memberId: string | null) => void;
  }) {
    const [query, setQuery] = useState(
      value
        ? members.find((m) => m.id === value)?.fullName ?? ""
        : extractNameFromDescription(row.description) ?? ""
    );
    const [open, setOpen] = useState(false);
    const [matches, setMatches] = useState<MemberOption[]>([]);
    const [highlighted, setHighlighted] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const assigned = members.find((m) => m.id === value);

    useEffect(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const q = query.toLowerCase().trim();
        setOpen(Boolean(q));
        if (!q) {
          setMatches([]);
          setHighlighted(0);
          return;
        }
        const filtered = members.filter(
          (m) =>
            m.fullName.toLowerCase().includes(q) ||
            m.memberNumber.toLowerCase().includes(q) ||
            (m.phone && m.phone.includes(q))
        );
        setMatches(filtered.slice(0, 8));
        setHighlighted(0);
      }, 300);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [query, members]);

    useEffect(() => {
      if (value) {
        const name = members.find((m) => m.id === value)?.fullName;
        if (name && query !== name) setQuery(name);
      }
    }, [value, members, query]);

    function select(member: MemberOption | null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setOpen(false);
      setMatches([]);
      setQuery(member ? member.fullName : extractNameFromDescription(row.description) ?? "");
      onChange(member ? member.id : null);
    }

    return (
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setMatches([]);
            }
            if (e.key === "Enter") {
              if (matches[highlighted]) {
                e.preventDefault();
                select(matches[highlighted]);
              } else if (matches.length === 1) {
                e.preventDefault();
                select(matches[0]);
              }
            }
            if (e.key === "ArrowDown" && matches.length) {
              e.preventDefault();
              setHighlighted((h) => (h + 1) % matches.length);
            }
            if (e.key === "ArrowUp" && matches.length) {
              e.preventDefault();
              setHighlighted((h) => (h - 1 + matches.length) % matches.length);
            }
          }}
          placeholder="Search member…"
          className="text-sm h-8 w-full min-w-[180px]"
        />
        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full min-w-[180px] rounded-xl border border-border bg-white shadow-lg overflow-hidden">
            {matches.map((member, i) => (
              <li
                key={member.id}
                onClick={() => select(member)}
                onMouseEnter={() => setHighlighted(i)}
                className={`px-3 py-2.5 text-sm cursor-pointer ${i === highlighted ? "bg-primary-50 text-primary" : "text-ink"} hover:bg-primary-50`}
              >
                <div className="text-ink">{member.fullName}</div>
                <div className="text-[10px] text-ink-muted">
                  {member.memberNumber}{member.phone ? ` • ${member.phone}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        {assigned && !open && (
          <span className="text-[10px] text-emerald-700 mt-0.5 block">
            {assigned.fullName} • {assigned.memberNumber}
          </span>
        )}
      </div>
    );
  }

// eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (canImport) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchMembers();
    }
  }, [canImport]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (preview && members.length > 0) {
      matchRowsByPhone(members);
    }
  }, [preview, members]);

  async function handleUpload(file: File) {
    setError(null);
    setResult(null);
    setManualAssignments(new Map());
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
        setError(payload?.error?.message ?? copy.paymentFailed);
        setUploading(false);
        return;
      }

      const parsed = payload as ParsedPreviewPayload;
      setPreview({ rows: parsed.rows, fileHash: parsed.fileHash, fileName: parsed.fileName });
    } catch {
      setError(copy.paymentFailed);
    } finally {
      setUploading(false);
    }
  }

  async function importAndMarkCards() {
    if (!preview) return;

    setProcessing(true);
    setError(null);

    try {
      // Validate there are card fee rows to import
      const cardFeeMatchedRows = preview.rows.filter(
        (row) =>
          toMoney(row.amount).equals(toMoney(2000)) &&
          (row.matchedMemberName !== null ||
            manualAssignments.has(row.fingerprint))
      );
      if (cardFeeMatchedRows.length === 0) {
        throw new Error(copy.momoNoPayments);
      }

      // Mark cards for all matched card fee rows (auto + manual) via manual-match
      const manualResponse = await fetch(
        "/api/admin/members/card-payments/manual-match",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignments: cardFeeMatchedRows.map((row) => {
              const memberId =
                manualAssignments.get(row.fingerprint) ??
                findMemberIdByName(row.matchedMemberName ?? "");
              return {
                fingerprint: row.fingerprint,
                memberId,
                amount: row.amount,
                date: row.date,
                description: row.description,
              };
            }),
          }),
        }
      );

      const manualPayload = await manualResponse.json();

      if (!manualResponse.ok) {
        throw new Error(manualPayload?.error?.message ?? copy.paymentFailed);
      }

      setResult({
        processed: manualPayload.processed,
        members: manualPayload.members,
        message: `${manualPayload.processed} member(s) marked as card paid`,
      });

      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.paymentFailed);
    } finally {
      setProcessing(false);
    }
  }

  const cardFeeAmount = toMoney(2000);

  const cardFeeRows = preview?.rows.filter(
    (row) => toMoney(row.amount).equals(cardFeeAmount)
  ) ?? [];

  const autoMatchedRows = cardFeeRows.filter(
    (row) => row.matchedMemberName !== null
  );
  const unmatchedCardFeeRows = cardFeeRows.filter(
    (row) => row.matchedMemberName === null
  );

  // ---- Result -------------------------------------------------------------
  if (result) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title={copy.momoComplete}>
          {result.processed > 0 && (
            <p className="text-sm text-ink">
              {copy.momoMembersMarked}:{" "}
              <span className="font-mono">{result.members.join(", ")}</span>
            </p>
          )}
          {result.processed === 0 && (
            <p className="text-sm text-ink-muted">{copy.momoNoPayments}</p>
          )}
        </Alert>
        <Button onClick={() => setResult(null)}>
          <Upload className="size-4" aria-hidden="true" />
          {copy.momoUploadButton}
        </Button>
      </div>
    );
  }

  // ---- Upload -------------------------------------------------------------
  if (!preview) {
    return (
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <label
          htmlFor="momo-statement-file"
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
              <Upload className="size-6" aria-hidden="true" />
            )}
          </span>

          <span className="mt-5 font-heading text-lg font-semibold text-ink">
            {uploading ? copy.preparing : copy.momoUploadButton}
          </span>
          <span className="mt-1.5 max-w-sm text-sm text-ink-muted">
            {formatMoney("2000.00")} card fee payments will be matched automatically.
            Unmatched rows can be assigned manually.
          </span>

          <input
            ref={fileInput}
            id="momo-statement-file"
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

      {/* File summary */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-heading text-base font-semibold text-ink">
              {preview.fileName}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {preview.rows.length} transaction row(s) found
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreview(null);
              setManualAssignments(new Map());
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </Button>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Rows found
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold tabular-nums text-ink">
            {preview.rows.length}
          </dd>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Card fee payments (2,000 RWF)
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold tabular-nums text-emerald-700">
            {cardFeeRows.length}
          </dd>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Auto-matched to members
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold tabular-nums text-emerald-700">
            {autoMatchedRows.length}
          </dd>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Need manual matching
          </dt>
          <dd className="mt-1 font-heading text-lg font-bold tabular-nums text-amber-700">
            {unmatchedCardFeeRows.length}
          </dd>
        </dl>
      </div>

      {/* Auto-matched card fee rows */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h3 className="font-heading text-base font-semibold text-ink mb-4">
          Card fee payments — auto-matched
        </h3>

        {autoMatchedRows.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No card fee payments were auto-matched to members.
          </p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-xs font-semibold text-ink-muted">
                  Date
                </th>
                <th className="pb-2 text-xs font-semibold text-ink-muted">
                  Member
                </th>
                <th className="pb-2 text-xs font-semibold text-ink-muted text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {autoMatchedRows.map((row) => (
                <tr key={row.fingerprint}>
                  <td className="py-2 text-sm text-ink-muted">
                    {formatDate(row.date, locale)}
                  </td>
                  <td className="py-2 text-sm text-ink">
                    {row.matchedMemberName}
                  </td>
                  <td className="py-2 text-sm text-right font-mono text-emerald-700">
                    {formatMoney(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual matching section */}
      {unmatchedCardFeeRows.length > 0 && members.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="font-heading text-base font-semibold text-ink mb-4">
            Card fee payments — manual matching
          </h3>
          <p className="text-sm text-ink-muted mb-4">
            Select a member for each unmatched payment. The member&rsquo;s card will be
            marked as paid.
          </p>

          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-xs font-semibold text-ink-muted">
                  Date
                </th>
                <th className="pb-2 text-xs font-semibold text-ink-muted">
                  Description
                </th>
                <th className="pb-2 text-xs font-semibold text-ink-muted text-right">
                  Amount
                </th>
                <th className="pb-2 text-xs font-semibold text-ink-muted">
                  Assign to member
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {unmatchedCardFeeRows.map((row) => {
                const assignedMemberId = manualAssignments.get(row.fingerprint);

                return (
                  <tr key={row.fingerprint}>
                    <td className="py-2 text-sm text-ink-muted">
                      {formatDate(row.date, locale)}
                    </td>
                    <td className="py-2 text-sm text-ink">
                      {row.description}
                    </td>
                    <td className="py-2 text-sm text-right font-mono text-ink-muted">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="py-2">
                      <MemberAssignmentPicker
                        row={row}
                        members={members}
                        value={assignedMemberId}
                        onChange={(memberId) => {
                          const next = new Map(manualAssignments);
                          if (memberId) next.set(row.fingerprint, memberId);
                          else next.delete(row.fingerprint);
                          setManualAssignments(next);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-3 text-sm text-ink-muted">
            {manualAssignments.size} of {unmatchedCardFeeRows.length} unmatched
            payments assigned to members.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={
            (autoMatchedRows.length === 0 && manualAssignments.size === 0) ||
            !canImport ||
            processing
          }
          onClick={importAndMarkCards}
        >
          {processing ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" aria-hidden="true" />
              {copy.preparing}
            </>
          ) : (
            <>
              <Upload className="size-4 mr-2" aria-hidden="true" />
              Mark card payments
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
