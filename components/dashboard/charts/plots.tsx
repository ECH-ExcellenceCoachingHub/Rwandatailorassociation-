"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { useLanguage } from "@/components/LanguageProvider";
import { formatMonthLabel } from "@/lib/i18n/dates";

/**
 * Dashboard charts — the recharts implementations.
 *
 * Never imported directly by a page: SavingsChart.tsx loads this module on
 * demand, so the charting library (the largest thing in the dashboard's
 * JavaScript) arrives after the page is already on screen instead of holding
 * it up.
 *
 * Two rules applied throughout:
 *
 *  • Amounts arrive as strings and are converted to numbers ONLY here, for
 *    pixel positions. A chart coordinate does not need exact decimal
 *    arithmetic; a balance does, which is why the conversion happens at the
 *    very edge and never flows back into anything that gets stored.
 *
 *  • Colours come from the site's existing palette — brand blue for savings, amber
 *    for withdrawals, red for arrears — so a figure means the same thing here
 *    as it does in a status badge elsewhere.
 */

const BLUE = "#4b7cb4";
const BLUE_DARK = "#1f4a88";
const AMBER = "#d4a94c";
const RED = "#ef4444";
const GRID = "#e5e7eb";
const MUTED = "#6b7280";

/** Chart-only conversion. Never feed the result back into a stored value. */
const toPlot = (value: string): number => Number.parseFloat(value) || 0;

const axisProps = {
  stroke: MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2.5 shadow-lift">
      <p className="mb-1.5 text-xs font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-xs text-ink-muted">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.name}:{" "}
          <span className="font-semibold tabular-nums text-ink">
            {formatMoney(String(entry.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

export function SavingsGrowthChart({
  data,
}: {
  data: { month: string; balance: string }[];
}) {
  const { d: copy, locale } = useLanguage();

  // The series key doubles as its legend and tooltip label, so it is the
  // translated word rather than a fixed English one.
  const series = copy.views.charts.balance;
  const plotted = data.map((point) => ({
    month: formatMonthLabel(point.month, locale),
    [series]: toPlot(point.balance),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={plotted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity={0.28} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => formatMoneyCompact(String(v)).replace("RWF ", "")} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey={series}
          stroke={BLUE_DARK}
          strokeWidth={2.5}
          fill="url(#savingsFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ContributionsChart({
  data,
}: {
  data: { month: string; deposits: string; withdrawals: string }[];
}) {
  const { d: copy, locale } = useLanguage();
  const depositsKey = copy.views.charts.deposits;
  const withdrawalsKey = copy.views.charts.withdrawals;

  const plotted = data.map((point) => ({
    month: formatMonthLabel(point.month, locale),
    [depositsKey]: toPlot(point.deposits),
    [withdrawalsKey]: toPlot(point.withdrawals),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={plotted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => formatMoneyCompact(String(v)).replace("RWF ", "")} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(31,74,136,0.06)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: MUTED, paddingTop: 8 }}
        />
        <Bar dataKey={depositsKey} fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar
          dataKey={withdrawalsKey}
          fill={AMBER}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Generic monthly bar chart used by the admin dashboards.
 *
 * `label` is a "YYYY-MM" key rather than a month name, so the axis can be
 * drawn in the reader's language. Anything that does not parse as a month is
 * passed through unchanged.
 */
export function MonthlyBarChart({
  data,
  series,
  colour = BLUE,
  highlightNegative = false,
}: {
  data: { label: string; value: string }[];
  series: string;
  colour?: string;
  highlightNegative?: boolean;
}) {
  const { locale } = useLanguage();
  const plotted = data.map((d) => ({
    label: formatMonthLabel(d.label, locale),
    [series]: toPlot(d.value),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={plotted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => formatMoneyCompact(String(v)).replace("RWF ", "")} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(31,74,136,0.06)" }} />
        <Bar dataKey={series} radius={[4, 4, 0, 0]} maxBarSize={32}>
          {plotted.map((entry, index) => (
            <Cell
              key={index}
              fill={
                highlightNegative && (entry[series] as number) < 0 ? RED : colour
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * THE THREE FLOWS THAT MUST NOT BE CONFUSED.
 *
 * The platform's service fee, the association's half of the loan interest, and
 * the members' half. Drawn as grouped bars rather than stacked, deliberately:
 * stacking implies a meaningful total, and these three have three different
 * owners. A column whose height was "fee + association + member" would be a
 * number nobody could spend.
 *
 * Amber for the fee — the same amber this file uses for money leaving a
 * member — navy for the association's own income, and a lighter blue for the
 * share returned to members, so the two halves of one interest payment read as
 * related without reading as the same thing.
 */
export function FundsFlowChart({
  data,
  labels,
}: {
  data: {
    label: string;
    platformFee: string;
    associationInterest: string;
    memberInterest: string;
  }[];
  labels: { fee: string; association: string; member: string };
}) {
  const { locale } = useLanguage();

  const plotted = data.map((row) => ({
    label: formatMonthLabel(row.label, locale),
    [labels.fee]: toPlot(row.platformFee),
    [labels.association]: toPlot(row.associationInterest),
    [labels.member]: toPlot(row.memberInterest),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={plotted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => formatMoneyCompact(String(v)).replace("RWF ", "")}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(31,74,136,0.06)" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey={labels.fee} fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar
          dataKey={labels.association}
          fill={BLUE_DARK}
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
        <Bar dataKey={labels.member} fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
