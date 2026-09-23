"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text input, styled from the existing design tokens — same border, radius
 * family and primary-blue focus ring as the rest of the site. Deliberately
 * `rounded-xl` rather than the `rounded-full` used by buttons: pill-shaped
 * fields read as buttons and waste horizontal space at form widths.
 */
function Input({
  className,
  type = "text",
  invalid,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-ink transition-colors",
        "placeholder:text-ink-muted/70",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        "disabled:cursor-not-allowed disabled:bg-ink/[0.03] disabled:text-ink-muted",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        invalid
          ? "border-red-400 focus:border-red-500 focus:ring-red-500/25"
          : "border-border focus:border-primary",
        className
      )}
      {...props}
    />
  );
}

function Textarea({
  className,
  invalid,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || undefined}
      className={cn(
        "flex min-h-24 w-full rounded-xl border bg-surface px-4 py-3 text-[15px] text-ink transition-colors",
        "placeholder:text-ink-muted/70",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        "disabled:cursor-not-allowed disabled:bg-ink/[0.03]",
        invalid
          ? "border-red-400 focus:border-red-500 focus:ring-red-500/25"
          : "border-border focus:border-primary",
        className
      )}
      {...props}
    />
  );
}

/**
 * Native `<select>`, styled to match `Input`.
 *
 * Exists so a plain dropdown gets the same `invalid` handling as every other
 * control: `invalid` is consumed here rather than reaching the DOM, where React
 * warns about a boolean on a non-boolean attribute, and it drives the same red
 * border the text fields use. The Radix `Select` in `ui/select.tsx` is the
 * richer option; this one is for short lists inside plain forms that post
 * normally, where a hidden input to carry the value would be pure overhead.
 */
function NativeSelect({
  className,
  invalid,
  ...props
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      data-slot="native-select"
      aria-invalid={invalid || undefined}
      className={cn(
        "h-12 w-full rounded-xl border bg-surface px-4 text-[15px] text-ink transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        "disabled:cursor-not-allowed disabled:bg-ink/[0.03] disabled:text-ink-muted",
        invalid
          ? "border-red-400 focus:border-red-500 focus:ring-red-500/25"
          : "border-border focus:border-primary",
        className
      )}
      {...props}
    />
  );
}

export { Input, Textarea, NativeSelect };
