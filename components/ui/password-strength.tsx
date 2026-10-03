"use client";

import { Check, X } from "lucide-react";
import {
  PASSWORD_REQUIREMENTS,
  assessPasswordStrength,
} from "@/lib/auth/password.shared";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { cn } from "@/lib/utils";
import type { DashboardDictionary } from "@/lib/i18n/dashboard";

/**
 * Live password requirements checklist.
 *
 * Runs the same `assessPasswordStrength` the server uses, so the browser can
 * never accept a password the API will then reject. Each requirement is ticked
 * as it is met, so the person typing sees exactly what is still missing rather
 * than a vague "too weak".
 *
 * Shown before anything is typed too: the rules are short enough to read up
 * front, and knowing them first saves a rejected attempt.
 *
 * The wording comes from the dictionary rather than from the assessment, which
 * returns English. The assessment's stable codes are what the two sides agree
 * on.
 */
export function PasswordStrength({ password }: { password: string }) {
  const { d } = useLanguage();
  const copy = d.auth.password;

  const missing = new Set(assessPasswordStrength(password).codes);
  // Nothing typed yet is not a failure; the list is neutral until it is.
  const started = password.length > 0;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <p className="text-xs font-semibold text-ink-muted">{copy.requirementsTitle}</p>
      <ul className="space-y-1">
        {PASSWORD_REQUIREMENTS.map((code) => {
          const met = !missing.has(code);
          const Icon = met ? Check : X;
          return (
            <li
              key={code}
              className={cn(
                "flex items-center gap-2 text-xs",
                met
                  ? "font-medium text-emerald-700"
                  : started
                    ? "text-red-600"
                    : "text-ink-muted"
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{copy.requirement[code]}</span>
              <span className="sr-only">
                ({met ? copy.met : copy.missing})
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The translated error for a password that does not meet the rules, naming
 * what is missing — or null when it meets them all.
 */
export function passwordMissingMessage(
  password: string,
  d: DashboardDictionary
): string | null {
  const { codes } = assessPasswordStrength(password);
  if (codes.length === 0) return null;
  const copy = d.auth.password;
  return fill(copy.missingList, {
    items: codes.map((code) => copy.requirement[code].toLowerCase()).join(", "),
  });
}
