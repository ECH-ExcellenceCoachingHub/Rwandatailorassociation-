"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Landmark, Banknote } from "lucide-react";
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
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { formatMoney, parseMoneyInput, subtract, toMoneyString } from "@/lib/money";

/**
 * Recording the association's own borrowing.
 *
 * Two dialogs, because they are two different acts by two different people at
 * two different times: taking a facility on, and paying an instalment of it.
 * Collapsing them into one form with a mode switch would put the fields for
 * one act in front of someone performing the other.
 *
 * Both submit to a handler that re-validates everything with the same schema
 * this form imports, and both are followed by `router.refresh()` — the lists
 * behind them are server-rendered, so nothing updates until the server
 * re-renders them.
 */

const LENDER_TYPES = [
  "BANK",
  "MICROFINANCE",
  "SACCO",
  "GOVERNMENT_PROGRAMME",
  "NGO",
  "COOPERATIVE_UNION",
  "OTHER",
] as const;

const CHANNELS = [
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "CASH",
  "CHEQUE",
  "OTHER",
] as const;

/** Shared submit plumbing: POST/PATCH JSON, surface field errors, refresh. */
function useFormSubmit(onDone: () => void) {
  const router = useRouter();
  const { d } = useLanguage();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(
    url: string,
    method: "POST" | "PATCH",
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
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? d.common.serverUnreachable);
        setFieldErrors(payload?.error?.details ?? {});
        return false;
      }

      setSuccess(successMessage);
      router.refresh();
      // Long enough for the confirmation to be read, short enough that the
      // refreshed list is what the administrator turns back to.
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

  return { submit, submitting, error, fieldErrors, success, setError };
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
      <DialogContent className="max-w-2xl">
        <div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record a facility
// ---------------------------------------------------------------------------

export function NewBorrowingButton() {
  const { d } = useLanguage();
  const copy = d.admin.borrowings;
  const [open, setOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  const { submit, submitting, error, fieldErrors, success } = useFormSubmit(() =>
    setOpen(false)
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await submit(
      "/api/admin/borrowings",
      "POST",
      {
        lenderName: form.get("lenderName"),
        lenderType: form.get("lenderType"),
        lenderReference: form.get("lenderReference"),
        purpose: form.get("purpose"),
        principal: form.get("principal"),
        interestRate: form.get("interestRate"),
        interestMethod: form.get("interestMethod"),
        termMonths: form.get("termMonths"),
        totalInterest: form.get("totalInterest"),
        totalFees: form.get("totalFees"),
        collateralDescription: form.get("collateralDescription"),
        collateralAmount: form.get("collateralAmount"),
        disbursedAt: form.get("disbursedAt"),
        firstPaymentDue: form.get("firstPaymentDue"),
        maturityDate: form.get("maturityDate"),
        isPublic,
      },
      copy.saved
    );
  }

  return (
    <FormShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Landmark className="size-4" aria-hidden="true" />
          {copy.addFacility}
        </Button>
      }
      title={copy.formTitle}
      description={copy.formIntro}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && (
          <Alert variant="success">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {success}
            </span>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lenderName" label={copy.lender} error={fieldErrors.lenderName} required>
            {(props) => <Input {...props} name="lenderName" required />}
          </Field>

          <Field id="lenderType" label={copy.lenderType} error={fieldErrors.lenderType}>
            {(props) => (
              <NativeSelect {...props} name="lenderType" defaultValue="BANK">
                {LENDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {statusLabel(type, d.status)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>

        <Field
          id="purpose"
          label={copy.purpose}
          error={fieldErrors.purpose}
          hint={copy.memberViewNote}
          required
        >
          {(props) => <Textarea {...props} name="purpose" rows={3} required />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="principal" label={copy.principal} error={fieldErrors.principal} required>
            {(props) => <Input {...props} name="principal" inputMode="decimal" required />}
          </Field>

          <Field id="interestRate" label={copy.rate} error={fieldErrors.interestRate} required>
            {(props) => (
              <Input {...props} name="interestRate" type="number" step="0.01" min="0" required />
            )}
          </Field>

          <Field id="termMonths" label={copy.term} error={fieldErrors.termMonths} required>
            {(props) => (
              <Input {...props} name="termMonths" type="number" min="1" step="1" required />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="interestMethod"
            label={copy.interestMethod}
            error={fieldErrors.interestMethod}
          >
            {(props) => (
              <NativeSelect {...props} name="interestMethod" defaultValue="REDUCING_BALANCE">
                <option value="REDUCING_BALANCE">{copy.reducing}</option>
                <option value="FLAT">{copy.flat}</option>
              </NativeSelect>
            )}
          </Field>

          <Field
            id="totalInterest"
            label={copy.totalInterest}
            error={fieldErrors.totalInterest}
            hint={copy.totalInterestHint}
          >
            {(props) => <Input {...props} name="totalInterest" inputMode="decimal" />}
          </Field>

          <Field id="totalFees" label={copy.totalFees} error={fieldErrors.totalFees}>
            {(props) => <Input {...props} name="totalFees" inputMode="decimal" />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="disbursedAt"
            label={copy.disbursedAt}
            error={fieldErrors.disbursedAt}
            hint={copy.disbursedAtHint}
          >
            {(props) => <Input {...props} name="disbursedAt" type="date" />}
          </Field>

          <Field
            id="firstPaymentDue"
            label={copy.firstPaymentDue}
            error={fieldErrors.firstPaymentDue}
          >
            {(props) => <Input {...props} name="firstPaymentDue" type="date" />}
          </Field>

          <Field id="maturityDate" label={copy.matures} error={fieldErrors.maturityDate}>
            {(props) => <Input {...props} name="maturityDate" type="date" />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="collateralDescription"
            label={copy.security}
            error={fieldErrors.collateralDescription}
          >
            {(props) => <Input {...props} name="collateralDescription" />}
          </Field>

          <Field
            id="collateralAmount"
            label={copy.collateralAmount}
            error={fieldErrors.collateralAmount}
          >
            {(props) => <Input {...props} name="collateralAmount" inputMode="decimal" />}
          </Field>
        </div>

        <PublishToggle
          checked={isPublic}
          onChange={setIsPublic}
          label={copy.publish}
          hint={copy.publishHint}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {d.common.cancel}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? d.common.saving : d.common.save}
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Record a repayment
// ---------------------------------------------------------------------------

export function RepaymentButton({
  borrowingId,
  reference,
  outstanding,
  currency,
}: {
  borrowingId: string;
  reference: string;
  outstanding: string;
  currency: string;
}) {
  const { d } = useLanguage();
  const copy = d.admin.borrowings;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const { submit, submitting, error, fieldErrors, success } = useFormSubmit(() =>
    setOpen(false)
  );

  // Shown live as the figure is typed, so an administrator sees the facility
  // land on zero before they commit — the server re-checks it under a lock.
  const parsed = parseMoneyInput(amount, { allowZero: false });
  const remaining = parsed.ok ? toMoneyString(subtract(outstanding, parsed.value)) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await submit(
      `/api/admin/borrowings/${borrowingId}/repayments`,
      "POST",
      {
        amount: form.get("amount"),
        interestPortion: form.get("interestPortion"),
        feesPortion: form.get("feesPortion"),
        channel: form.get("channel"),
        externalReference: form.get("externalReference"),
        description: form.get("description"),
        paidAt: form.get("paidAt"),
        nextPaymentDue: form.get("nextPaymentDue"),
      },
      copy.repaymentSaved
    );
  }

  return (
    <FormShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <Banknote className="size-4" aria-hidden="true" />
          {copy.recordRepayment}
        </Button>
      }
      title={copy.repaymentTitle}
      description={`${reference} · ${copy.outstanding}: ${formatMoney(outstanding, { currency })}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && (
          <Alert variant="success">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {success}
            </span>
          </Alert>
        )}

        <Field
          id="amount"
          label={copy.amount}
          error={fieldErrors.amount}
          hint={
            remaining !== null
              ? `${copy.outstanding}: ${formatMoney(remaining, { currency })}`
              : undefined
          }
          required
        >
          {(props) => (
            <Input
              {...props}
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="interestPortion"
            label={copy.interestPortion}
            error={fieldErrors.interestPortion}
            hint={copy.splitHint}
          >
            {(props) => <Input {...props} name="interestPortion" inputMode="decimal" />}
          </Field>

          <Field id="feesPortion" label={copy.feesPortion} error={fieldErrors.feesPortion}>
            {(props) => <Input {...props} name="feesPortion" inputMode="decimal" />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="channel" label={d.common.method} error={fieldErrors.channel}>
            {(props) => (
              <NativeSelect {...props} name="channel" defaultValue="BANK_TRANSFER">
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {statusLabel(channel, d.status)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field id="paidAt" label={copy.paidAt} error={fieldErrors.paidAt}>
            {(props) => <Input {...props} name="paidAt" type="date" />}
          </Field>

          <Field
            id="nextPaymentDue"
            label={copy.nextPayment}
            error={fieldErrors.nextPaymentDue}
          >
            {(props) => <Input {...props} name="nextPaymentDue" type="date" />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="externalReference"
            label={copy.externalReference}
            error={fieldErrors.externalReference}
          >
            {(props) => <Input {...props} name="externalReference" />}
          </Field>

          <Field id="description" label={copy.note} error={fieldErrors.description}>
            {(props) => <Input {...props} name="description" />}
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {d.common.cancel}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? d.common.saving : d.common.save}
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Publish / withhold, as a one-click control on the card.
 *
 * Deliberately not buried inside the edit form. Whether members can see a
 * facility secured on their savings is the most consequential thing on this
 * screen, so it is visible at a glance and changeable without opening a dialog
 * — and every flip of it lands in the audit log.
 */
export function VisibilityToggle({
  borrowingId,
  isPublic,
}: {
  borrowingId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.admin.borrowings;
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await fetch(`/api/admin/borrowings/${borrowingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {isPublic ? copy.hiddenFromMembers : copy.visibleToMembers}
    </Button>
  );
}

/** Checkbox + explanation, used by both create forms. */
export function PublishToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary,#1f4a88)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
          {hint}
        </span>
      </span>
    </label>
  );
}
