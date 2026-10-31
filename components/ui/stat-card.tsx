import type { LucideIcon } from "lucide-react";
import Link from "@/components/SiteLink";
import { TrendIndicator } from "@/components/ui/trend-indicator";
import { cn } from "@/lib/utils";

/**
 * Dashboard statistic tile.
 *
 * The value is rendered with `tabular-nums` so a row of tiles does not jitter
 * as numbers refresh, and the trend arrow always sits beside a signed
 * percentage — an arrow alone tells a colour-blind user nothing.
 *
 * `tone` is for meaning, not decoration: a large overdue figure is `danger`
 * whether or not it went up this month.
 */

export type StatTone = "default" | "primary" | "success" | "warning" | "danger";

const TONE: Record<StatTone, { icon: string; value: string }> = {
  default: { icon: "bg-ink/[0.05] text-ink-muted", value: "text-ink" },
  primary: { icon: "bg-primary-50 text-primary", value: "text-ink" },
  success: { icon: "bg-success/10 text-success", value: "text-ink" },
  warning: { icon: "bg-gold/15 text-amber-700", value: "text-ink" },
  danger: { icon: "bg-red-50 text-red-600", value: "text-red-700" },
};

export interface StatCardProps {
  label: string;
  value: string;
  /// Secondary line, e.g. "Due 30 Aug 2026" or "12 this month".
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  trend?: {
    /// Signed percentage change. 0 renders as "no change".
    percent: number;
    label?: string;
    /// Set false where an increase is bad news (overdue loans, arrears).
    increaseIsGood?: boolean;
  };
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
  href,
  className,
}: StatCardProps) {
  const tones = TONE[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              tones.icon
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-3 font-heading text-[26px] font-bold leading-none tabular-nums",
          tones.value
        )}
      >
        {value}
      </p>

      {(hint || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {trend && <TrendIndicator {...trend} />}
          {hint && <span className="text-xs text-ink-muted">{hint}</span>}
        </div>
      )}
    </>
  );

  const classes = cn(
    "rounded-2xl border border-border bg-surface p-5 shadow-card transition-shadow",
    href && "hover:shadow-lift",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cn(classes, "block")}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}

/** Responsive grid for a row of tiles. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
