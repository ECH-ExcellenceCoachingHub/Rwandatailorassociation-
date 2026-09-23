"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/components/LanguageProvider";
import { formatDate } from "@/lib/i18n/dates";
import { fill } from "@/lib/i18n/fill";
import { ruleInputValue } from "@/lib/rules/format";
import type {
  RuleCategory,
  RuleValueType,
} from "@/lib/generated/prisma/enums";

/**
 * AMENDING THE RULEBOOK.
 *
 * Three dialogs, because they are three different acts: changing a rule the
 * software enforces, writing one the committee wants published, and reading
 * what a rule used to say.
 *
 * TWO THINGS THE FORMS INSIST ON, and both are here rather than only on the
 * server because a rule someone half-changed is worse than one they did not:
 *
 *  1. A REASON. Not optional, anywhere. Six months from now somebody will ask
 *     why the fine went from 7% to 10%, and the answer has to be in the
 *     record rather than in whoever happened to be in the office.
 *
 *  2. BOTH LANGUAGES. A rule with only an English wording is a rule most of
 *     this association's members cannot read. The fields sit side by side so
 *     the omission is obvious while it is being made.
 *
 * The value field is a plain text input rather than a typed one: the server
 * normalises "7%", "7" and " 7 " to the same stored value, and a number input
 * that silently rejects a typed percent sign teaches people the form is
 * broken.
 */

/** Shared submit plumbing: send JSON, surface field errors, refresh the page. */
function useRuleSubmit(onDone: () => void) {
  const router = useRouter();
  const { d } = useLanguage();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    successMessage: string
  ) {
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? d.common.serverUnreachable);
        setFieldErrors(payload?.error?.details ?? {});
        return false;
      }

      setSuccess(successMessage);
      // The rulebook is server-rendered, so nothing changes on screen until
      // the server re-renders it.
      router.refresh();
      setTimeout(() => {
        setSuccess(null);
        onDone();
      }, 1200);
      return true;
    } catch {
      setError(d.common.serverUnreachable);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error, fieldErrors, success };
}

function FormShell({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export interface EditableRule {
  id: string;
  key: string;
  valueType: RuleValueType;
  value: string | null;
  isSystem: boolean;
  isActive: boolean;
  enforcement: string;
  titleEn: string;
  titleRw: string;
  bodyEn: string;
  bodyRw: string;
}

export function EditRuleButton({ rule }: { rule: EditableRule }) {
  const { d } = useLanguage();
  const copy = d.rules.admin;

  const [open, setOpen] = useState(false);
  const { submit, submitting, error, fieldErrors, success } = useRuleSubmit(() =>
    setOpen(false)
  );

  const [value, setValue] = useState(ruleInputValue(rule.valueType, rule.value));
  const [titleEn, setTitleEn] = useState(rule.titleEn);
  const [titleRw, setTitleRw] = useState(rule.titleRw);
  const [bodyEn, setBodyEn] = useState(rule.bodyEn);
  const [bodyRw, setBodyRw] = useState(rule.bodyRw);
  const [isActive, setIsActive] = useState(rule.isActive);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(
      `/api/admin/rules/${rule.id}`,
      "PATCH",
      {
        // A TEXT rule has no value to send; sending "" would be rejected as an
        // empty required field rather than understood as "not applicable".
        value: rule.valueType === "TEXT" ? undefined : value,
        titleEn,
        titleRw,
        bodyEn,
        bodyRw,
        isActive,
        changeReason: reason,
        notifyMembers: notify,
      },
      copy.saved
    );
  }

  return (
    <FormShell
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          {copy.editRule}
        </Button>
      }
      title={copy.editRule}
      description={rule.isSystem ? copy.systemRuleHint : copy.customRuleHint}
      open={open}
      onOpenChange={setOpen}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && (
          <Alert variant="success">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {success}
            </span>
          </Alert>
        )}

        {rule.valueType !== "TEXT" && (
          <Field
            id="rule-value"
            label={copy.fieldValue}
            hint={copy.fieldValueHint}
            error={fieldErrors.value}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="decimal"
              />
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rule-title-rw"
            label={copy.fieldTitleRw}
            error={fieldErrors.titleRw}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={titleRw}
                onChange={(event) => setTitleRw(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="rule-title-en"
            label={copy.fieldTitleEn}
            error={fieldErrors.titleEn}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rule-body-rw"
            label={copy.fieldBodyRw}
            error={fieldErrors.bodyRw}
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={5}
                value={bodyRw}
                onChange={(event) => setBodyRw(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="rule-body-en"
            label={copy.fieldBodyEn}
            error={fieldErrors.bodyEn}
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={5}
                value={bodyEn}
                onChange={(event) => setBodyEn(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          id="rule-reason"
          label={copy.fieldReason}
          hint={copy.fieldReasonHint}
          error={fieldErrors.changeReason}
          required
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>

        <div className="space-y-2">
          {/* An AUTOMATIC system rule cannot be switched off — the server
              refuses it — so the control is not offered for one. */}
          {!(rule.isSystem && rule.enforcement === "AUTOMATIC") && (
            <Checkbox
              id="rule-active"
              checked={isActive}
              onChange={setIsActive}
              label={copy.fieldActive}
            />
          )}

          <Checkbox
            id="rule-notify"
            checked={notify}
            onChange={setNotify}
            label={copy.fieldNotify}
            hint={copy.fieldNotifyHint}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            {d.common.cancel}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {d.common.save}
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

const CATEGORIES: RuleCategory[] = [
  "CONTRIBUTIONS",
  "PLATFORM_FEE",
  "PENALTIES",
  "LENDING_ELIGIBILITY",
  "LOAN_TERMS",
  "INTEREST_SHARING",
  "GOVERNANCE",
  "OTHER",
];

const VALUE_TYPES: RuleValueType[] = [
  "TEXT",
  "MONEY",
  "PERCENT",
  "DAYS",
  "MONTHS",
  "COUNT",
  "BOOLEAN",
];

export function NewRuleButton() {
  const { d } = useLanguage();
  const copy = d.rules.admin;

  const [open, setOpen] = useState(false);
  const { submit, submitting, error, fieldErrors, success } = useRuleSubmit(() =>
    setOpen(false)
  );

  const [category, setCategory] = useState<RuleCategory>("GOVERNANCE");
  const [valueType, setValueType] = useState<RuleValueType>("TEXT");
  const [value, setValue] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleRw, setTitleRw] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyRw, setBodyRw] = useState("");
  const [notify, setNotify] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(
      "/api/admin/rules",
      "POST",
      {
        category,
        valueType,
        value: valueType === "TEXT" ? undefined : value,
        titleEn,
        titleRw,
        bodyEn,
        bodyRw,
        notifyMembers: notify,
      },
      copy.added
    );
  }

  return (
    <FormShell
      trigger={
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {copy.addRule}
        </Button>
      }
      title={copy.addRule}
      description={copy.customRuleHint}
      open={open}
      onOpenChange={setOpen}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="new-category" label={copy.fieldCategory} required>
            {(props) => (
              <NativeSelect
                {...props}
                value={category}
                onChange={(event) => setCategory(event.target.value as RuleCategory)}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {d.rules.categories[option]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field id="new-value-type" label={copy.fieldValueType} required>
            {(props) => (
              <NativeSelect
                {...props}
                value={valueType}
                onChange={(event) => setValueType(event.target.value as RuleValueType)}
              >
                {VALUE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>

        {valueType !== "TEXT" && (
          <Field
            id="new-value"
            label={copy.fieldValue}
            error={fieldErrors.value}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="new-title-rw"
            label={copy.fieldTitleRw}
            error={fieldErrors.titleRw}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={titleRw}
                onChange={(event) => setTitleRw(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="new-title-en"
            label={copy.fieldTitleEn}
            error={fieldErrors.titleEn}
            required
          >
            {(props) => (
              <Input
                {...props}
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="new-body-rw"
            label={copy.fieldBodyRw}
            error={fieldErrors.bodyRw}
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={5}
                value={bodyRw}
                onChange={(event) => setBodyRw(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="new-body-en"
            label={copy.fieldBodyEn}
            error={fieldErrors.bodyEn}
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={5}
                value={bodyEn}
                onChange={(event) => setBodyEn(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Checkbox
          id="new-notify"
          checked={notify}
          onChange={setNotify}
          label={copy.fieldNotify}
          hint={copy.fieldNotifyHint}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            {d.common.cancel}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {copy.addRule}
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

interface Revision {
  version: number;
  value: string | null;
  title: { en: string; rw: string };
  isActive: boolean;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: string;
}

/**
 * What a rule used to say.
 *
 * Fetched on open rather than rendered with the page: most rules have never
 * been amended, and loading every rule's history to show one would be a query
 * per rule for a panel almost nobody opens.
 */
export function RuleHistoryButton({
  ruleId,
  ruleTitle,
}: {
  ruleId: string;
  ruleTitle: string;
}) {
  const { d, locale } = useLanguage();
  const copy = d.rules.admin;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);

  async function load(next: boolean) {
    setOpen(next);
    if (!next || revisions) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/rules/${ruleId}`);
      const payload = await response.json().catch(() => null);
      setRevisions(payload?.data?.history ?? payload?.history ?? []);
    } catch {
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="size-3.5" aria-hidden="true" />
          {copy.history}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>{fill(copy.historyFor, { rule: ruleTitle })}</DialogTitle>
        <DialogDescription>{copy.fieldReasonHint}</DialogDescription>

        <div className="mt-4">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {d.common.loading}
            </p>
          )}

          {!loading && revisions?.length === 0 && (
            <p className="text-sm text-ink-muted">{copy.noHistory}</p>
          )}

          {!loading && revisions && revisions.length > 0 && (
            <ol className="space-y-3">
              {revisions.map((revision) => (
                <li
                  key={revision.version}
                  className="rounded-xl border border-border bg-canvas p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">
                      {locale === "rw" ? revision.title.rw : revision.title.en}
                    </p>
                    <p className="shrink-0 text-xs text-ink-muted">
                      {formatDate(new Date(revision.createdAt), locale)}
                    </p>
                  </div>

                  {revision.value !== null && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {fill(copy.changedTo, { value: revision.value })}
                    </p>
                  )}

                  {revision.changeReason && (
                    <p className="mt-1.5 text-sm italic text-ink-muted">
                      “{revision.changeReason}”
                    </p>
                  )}

                  {revision.changedBy && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {fill(copy.changedBy, { name: revision.changedBy })}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRuleButton({ ruleId, isSystem }: { ruleId: string; isSystem: boolean }) {
  const { d } = useLanguage();
  const copy = d.rules.admin;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { submit, submitting, error, fieldErrors } = useRuleSubmit(() => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A fresh reason every time: the last deletion's wording must not be
        // submitted again by mistake.
        if (next) setReason("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
          <Trash2 className="size-3.5" aria-hidden="true" />
          {copy.deleteRule}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{copy.deleteRule}</DialogTitle>
        <DialogDescription>
          {isSystem ? copy.deleteConfirmSystem : copy.deleteConfirm}
        </DialogDescription>

        <Field
          id={`delete-reason-${ruleId}`}
          label={copy.deleteReasonLabel}
          error={fieldErrors.reason}
          required
          className="mt-4"
        >
          {(props) => (
            <Textarea
              {...props}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.deleteReasonPlaceholder}
              rows={3}
              maxLength={500}
              disabled={submitting}
            />
          )}
        </Field>

        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            {d.common.cancel}
          </Button>
          {/* No destructive variant in the button set; the danger is carried
              by the colour override rather than by inventing a variant here. */}
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:border-red-500 hover:text-red-700"
            // Matches the ten characters the endpoint requires.
            disabled={submitting || reason.trim().length < 10}
            onClick={() =>
              void submit(`/api/admin/rules/${ruleId}`, "DELETE", { reason }, copy.removed)
            }
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {copy.deleteRule}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A checkbox with its label and hint.
 *
 * Not the Radix one: these are plain booleans inside a form that is submitted
 * as JSON, and a native input is both smaller and more predictable for a
 * screen reader than a styled div pretending to be one.
 */
function Checkbox({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
      />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
      </label>
    </div>
  );
}
