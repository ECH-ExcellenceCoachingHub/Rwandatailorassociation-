"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label + control + error/hint, wired for accessibility.
 *
 * The wiring is the point: the error is linked via aria-describedby and marked
 * role="alert", so a screen reader announces a failed field instead of leaving
 * the user stuck on a form that looks fine to them. Doing this by hand at every
 * call site is exactly the sort of thing that gets forgotten.
 */
interface FieldProps {
  id: string;
  label: string;
  error?: string | string[] | null;
  hint?: string;
  /// Replaces the hint's muted styling, for a hint the reader must not miss.
  hintClassName?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    invalid: boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}

export function Field({
  id,
  label,
  error,
  hint,
  hintClassName,
  required,
  className,
  children,
}: FieldProps) {
  const messages = React.useMemo(() => {
    if (!error) return [];
    return Array.isArray(error) ? error : [error];
  }, [error]);

  const hasError = messages.length > 0;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>

      {children({ id, invalid: hasError, "aria-describedby": describedBy })}

      {hint && !hasError && (
        <p
          id={hintId}
          className={hintClassName ?? "text-xs leading-relaxed text-ink-muted"}
        >
          {hint}
        </p>
      )}

      {hasError && (
        <div id={errorId} role="alert" className="space-y-1">
          {messages.map((message) => (
            <p
              key={message}
              className="flex items-start gap-1.5 text-xs font-medium text-red-600"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
