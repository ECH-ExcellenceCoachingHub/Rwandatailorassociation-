"use client";

import { useMemo, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, pluralize } from "@/lib/i18n/fill";
import { cn } from "@/lib/utils";

/**
 * The member picker in the manual-match dialog.
 *
 * A plain dropdown of every active member makes the administrator do the
 * matching in their head: read the narration, remember the name, scroll. This
 * does the reading for them. Each member is checked against what the payment
 * carries — narration, payer name, payer phone, reference — and the ones it
 * points at are marked with the reason and can be sorted to the top. The
 * decision stays the administrator's: nothing is selected on their behalf
 * unless the matcher found exactly one candidate, as before.
 */

export interface PickerMember {
  id: string;
  memberNumber: string;
  fullName: string;
  paymentReference: string;
  phone: string | null;
}

export interface PickerPayment {
  narration: string | null;
  payerName: string | null;
  payerPhone: string | null;
  payerAccount: string | null;
  transactionReference: string | null;
  candidates: { id: string }[];
}

type Evidence = "reference" | "phone" | "fullName" | "name" | "matcher";

/** How strongly each kind of evidence points at a member. */
const WEIGHT: Record<Evidence, number> = {
  reference: 5,
  phone: 4,
  fullName: 3,
  matcher: 2,
  name: 1,
};

type SortKey = "best" | "name" | "number";

/** Letter runs and digit runs, so "MUKESHIMANA250793137364" yields both. */
function tokensOf(text: string): string[] {
  return text.toUpperCase().match(/[A-Z]+|\d+/g) ?? [];
}

function digitsOf(text: string | null): string {
  return (text ?? "").replace(/\D/g, "");
}

/** A Rwandan number's last nine digits, whichever prefix it was written with. */
function phoneKey(phone: string | null): string | null {
  const digits = digitsOf(phone);
  return digits.length >= 9 ? digits.slice(-9) : null;
}

function evidenceFor(member: PickerMember, payment: PickerPayment): Evidence[] {
  const text = [
    payment.narration,
    payment.payerName,
    payment.payerAccount,
    payment.transactionReference,
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = new Set(tokensOf(text));
  const compact = tokensOf(text).join("");
  const found: Evidence[] = [];

  const reference = tokensOf(member.paymentReference).join("");
  if (reference.length >= 4 && compact.includes(reference)) found.push("reference");

  const phone = phoneKey(member.phone);
  if (
    phone &&
    (phoneKey(payment.payerPhone) === phone ||
      [...tokens].some((token) => /^\d+$/.test(token) && token.includes(phone)))
  ) {
    found.push("phone");
  }

  const names = tokensOf(member.fullName).filter((part) => part.length >= 3);
  const hits = names.filter((part) => tokens.has(part)).length;
  if (names.length > 1 && hits === names.length) found.push("fullName");
  else if (hits > 0) found.push("name");

  if (payment.candidates.some((candidate) => candidate.id === member.id)) {
    found.push("matcher");
  }

  return found;
}

const scoreOf = (evidence: Evidence[]) =>
  evidence.reduce((total, kind) => total + WEIGHT[kind], 0);

/** Every word typed must appear in the name, number, reference or phone. */
function matchesQuery(member: PickerMember, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    member.fullName,
    member.memberNumber,
    member.paymentReference,
    member.phone ?? "",
    digitsOf(member.phone),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function PaymentMemberPicker({
  members,
  payment,
  value,
  onChange,
}: {
  members: PickerMember[];
  payment: PickerPayment;
  value: string;
  onChange: (memberId: string) => void;
}) {
  const { d } = useLanguage();
  const copy = d.admin.payments;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("best");
  const [likelyOnly, setLikelyOnly] = useState(false);

  const scored = useMemo(
    () =>
      members.map((member) => {
        const evidence = evidenceFor(member, payment);
        return { member, evidence, score: scoreOf(evidence) };
      }),
    [members, payment]
  );
  const likelyCount = scored.filter((row) => row.score > 0).length;

  const rows = useMemo(() => {
    const byName = (a: PickerMember, b: PickerMember) =>
      a.fullName.localeCompare(b.fullName);
    const byNumber = (a: PickerMember, b: PickerMember) =>
      a.memberNumber.localeCompare(b.memberNumber, undefined, { numeric: true });

    return scored
      .filter((row) => (!likelyOnly || row.score > 0) && matchesQuery(row.member, query))
      .sort((a, b) =>
        sort === "name"
          ? byName(a.member, b.member)
          : sort === "number"
            ? byNumber(a.member, b.member)
            : b.score - a.score || byName(a.member, b.member)
      );
  }, [scored, query, sort, likelyOnly]);

  const selected = members.find((member) => member.id === value) ?? null;

  const evidenceLabel: Record<Evidence, string> = {
    reference: copy.pickerEvidenceReference,
    phone: copy.pickerEvidencePhone,
    fullName: copy.pickerEvidenceFullName,
    name: copy.pickerEvidenceName,
    matcher: copy.pickerEvidenceMatcher,
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "best", label: copy.pickerSortBest },
    { key: "name", label: copy.pickerSortName },
    { key: "number", label: copy.pickerSortNumber },
  ];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <Input
          id="match-member"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the top result, so a typed reference is one keystroke
            // from selected — and never submits the dialog by accident.
            if (event.key === "Enter") {
              event.preventDefault();
              if (rows[0]) onChange(rows[0].member.id);
            }
          }}
          placeholder={copy.pickerSearchPlaceholder}
          aria-label={copy.pickerSearchPlaceholder}
          aria-controls="match-member-list"
          autoComplete="off"
          className="h-11 pl-10 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink-muted">{copy.pickerSortLabel}</span>
        {sortOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setSort(option.key)}
            aria-pressed={sort === option.key}
            className={cn(
              "rounded-full border px-2.5 py-1 font-medium transition-colors",
              sort === option.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-ink-muted hover:text-ink"
            )}
          >
            {option.label}
          </button>
        ))}
        {likelyCount > 0 && (
          <button
            type="button"
            onClick={() => setLikelyOnly((previous) => !previous)}
            aria-pressed={likelyOnly}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition-colors",
              likelyOnly
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-border text-ink-muted hover:text-ink"
            )}
          >
            <Sparkles className="size-3" aria-hidden="true" />
            {fill(copy.pickerLikelyOnly, { count: String(likelyCount) })}
          </button>
        )}
      </div>

      <div
        id="match-member-list"
        role="listbox"
        aria-label={copy.matchMemberLabel}
        className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface"
      >
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink-muted">{copy.pickerNoResults}</p>
        ) : (
          rows.map(({ member, evidence }) => {
            const isSelected = member.id === value;
            return (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(member.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-ink/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-primary bg-primary text-white" : "border-border"
                  )}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {member.fullName}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {[member.memberNumber, member.paymentReference, member.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {evidence.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {evidence.map((kind) => (
                        <span
                          key={kind}
                          className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                        >
                          {evidenceLabel[kind]}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-ink-muted" aria-live="polite">
        {selected
          ? fill(copy.pickerSelected, { name: selected.fullName, number: selected.memberNumber })
          : pluralize(copy.pickerShowing, rows.length)}
      </p>
    </div>
  );
}
