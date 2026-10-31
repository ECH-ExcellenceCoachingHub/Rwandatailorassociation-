"use client";

import { useState, useTransition } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useSitePathname, useSiteRouter } from "@/hooks/use-site-paths";
import { fill } from "@/lib/i18n/fill";
import { formatLongDate } from "@/lib/i18n/dates";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComparisonMode, GrowthComparison } from "@/lib/services/growth-report";

/**
 * Chooses what the growth card measures against. It sits outside the card, so
 * the shared image carries only the dates, never the control.
 *
 * The choice lives in the query string: the page is rendered on the server
 * from the ledger, and a link to it reproduces the same card.
 */
export function GrowthComparePicker({
  comparison,
  lastDepositAt,
  maxDate,
}: {
  comparison: GrowthComparison;
  lastDepositAt: Date | string | null;
  /// Yesterday as YYYY-MM-DD — the latest day whose close has happened.
  maxDate: string;
}) {
  const { locale, d } = useLanguage();
  const copy = d.admin.reports.growth;
  const router = useSiteRouter();
  const pathname = useSitePathname();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<ComparisonMode>(comparison.mode);
  const [date, setDate] = useState(comparison.date ?? maxDate);

  function apply(value: string) {
    startTransition(() => {
      router.replace(`${pathname}?compare=${encodeURIComponent(value)}`, { scroll: false });
    });
  }

  function onModeChange(next: string) {
    const nextMode = next as ComparisonMode;
    setMode(nextMode);
    apply(nextMode === "date" ? date : nextMode);
  }

  function onDateChange(next: string) {
    setDate(next);
    // A cleared or half-typed field sends nothing until it is a whole day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(next) && next <= maxDate) apply(next);
  }

  return (
    <div className="flex w-[960px] max-w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <CalendarRange className="size-4 text-primary" aria-hidden="true" />
          {copy.compareLabel}
          {pending && <Loader2 className="size-3.5 animate-spin text-ink-muted" aria-hidden="true" />}
        </label>
        <Select value={mode} onValueChange={onModeChange}>
          <SelectTrigger className="h-11 sm:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last-deposit">{copy.compareLastDeposit}</SelectItem>
            <SelectItem value="yesterday">{copy.compareYesterday}</SelectItem>
            <SelectItem value="month">{copy.compareMonth}</SelectItem>
            <SelectItem value="date">{copy.compareDate}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-muted">
          {lastDepositAt
            ? fill(copy.compareLastDepositHint, { date: formatLongDate(lastDepositAt, locale) })
            : copy.compareNoDeposits}
        </p>
      </div>
      {mode === "date" && (
        <div className="space-y-1.5 sm:w-52">
          <label htmlFor="growth-compare-date" className="text-sm font-medium text-ink">
            {copy.compareDateLabel}
          </label>
          <Input
            id="growth-compare-date"
            type="date"
            className="h-11"
            value={date}
            max={maxDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
