import type { PoolDeductionSummary } from "@/lib/services/pool-deductions";
import type { getDashboardCopy } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import type { Locale } from "@/types";

type Copy = Awaited<ReturnType<typeof getDashboardCopy>>["d"];

/**
 * One deduction from the members' pool, as both members and officers see it:
 * what it was for, the reason in the committee's own words, the whole amount,
 * and — for a member — their own part of it.
 *
 * The reason is given its own tinted block for the same reason an investment's
 * benefit sentence is: it is what the reader came for, and the figures under it
 * are the evidence.
 */
export function PoolDeductionCard({
  deduction,
  d,
  locale,
  currency,
}: {
  deduction: PoolDeductionSummary;
  d: Copy;
  locale: Locale;
  currency: string;
}) {
  const copy = d.admin.poolDeductions;
  const member = d.member.association;
  const money = (value: string) => formatMoney(value, { currency });

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-ink">{deduction.title}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {copy.purposes[deduction.purpose]} · {formatDate(deduction.createdAt, locale)} ·{" "}
            <span className="font-mono">{deduction.reference}</span>
          </p>
        </div>
      </header>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-ink">
        <span className="font-semibold">{copy.reason}: </span>
        {deduction.reason}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Figure label={member.deductionTotal} value={money(deduction.totalAmount)} />
        {deduction.yourShare !== null && (
          <Figure label={member.deductionYourPart} value={`-${money(deduction.yourShare)}`} danger />
        )}
        <Figure
          label={copy.splitBy}
          value={copy.allocations[deduction.allocation]}
          hint={pluralize(copy.membersAffected, deduction.membersAffected, {
            count: deduction.membersAffected,
          })}
        />
      </dl>

      {(deduction.beneficiaryName || deduction.recordedByName) && (
        <footer className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
          {deduction.beneficiaryName && (
            <span>{fill(copy.forMember, { name: deduction.beneficiaryName })}</span>
          )}
          <span>{fill(copy.recordedBy, { name: deduction.recordedByName })}</span>
        </footer>
      )}
    </article>
  );
}

function Figure({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd
        className={`mt-0.5 font-heading text-sm font-bold tabular-nums ${danger ? "text-rose-600" : "text-ink"}`}
      >
        {value}
      </dd>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
