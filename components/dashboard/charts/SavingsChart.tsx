"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";

/**
 * Dashboard charts, as the pages import them.
 *
 * The charting library is by far the heaviest dependency in the dashboard —
 * it added well over 100 kB to every page that drew a chart, and every one of
 * those pages waited for it before becoming usable. The charts themselves live
 * in ./plots and are fetched on demand here: the page's figures and tables
 * render at once, and each chart fills its reserved space a moment later.
 *
 * Not rendered on the server either. A ResponsiveContainer cannot measure its
 * width there, so server output was an empty box anyway.
 */

function ChartPlaceholder({ height }: { height: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export const SavingsGrowthChart = dynamic(
  () => import("./plots").then((m) => m.SavingsGrowthChart),
  { ssr: false, loading: () => <ChartPlaceholder height={240} /> }
);

export const ContributionsChart = dynamic(
  () => import("./plots").then((m) => m.ContributionsChart),
  { ssr: false, loading: () => <ChartPlaceholder height={240} /> }
);

export const MonthlyBarChart = dynamic(
  () => import("./plots").then((m) => m.MonthlyBarChart),
  { ssr: false, loading: () => <ChartPlaceholder height={240} /> }
);

export const FundsFlowChart = dynamic(
  () => import("./plots").then((m) => m.FundsFlowChart),
  { ssr: false, loading: () => <ChartPlaceholder height={260} /> }
);

/** Horizontal progress bar for loan repayment. Not a chart library job. */
export function RepaymentProgress({
  paid,
  total,
  percent,
  overdue,
}: {
  paid: string;
  total: string;
  percent: number;
  overdue?: boolean;
}) {
  const { d } = useLanguage();
  const copy = d.views.charts;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <span className="font-heading text-lg font-bold text-ink">
            {formatMoney(paid)}
          </span>{" "}
          {fill(copy.repaidOf, { total: formatMoney(total) })}
        </p>
        <span
          className={`text-sm font-bold tabular-nums ${overdue ? "text-red-600" : "text-primary"}`}
        >
          {percent}%
        </span>
      </div>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.07]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={copy.progressLabel}
      >
        <div
          className={`h-full rounded-full transition-all ${overdue ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${Math.max(percent, 1.5)}%` }}
        />
      </div>
    </div>
  );
}
