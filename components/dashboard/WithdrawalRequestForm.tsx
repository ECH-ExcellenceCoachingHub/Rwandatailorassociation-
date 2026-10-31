"use client";

import { useMemo, useState, type FormEvent } from "react";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, split } from "@/lib/i18n/fill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  add,
  formatMoney,
  gt,
  lt,
  parseMoneyInput,
  percentageOf,
  subtract,
  toMoneyString,
} from "@/lib/money";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Withdrawal request form.
 *
 * Shows the fee and the net amount live as the member types. Association
 * withdrawal fees are a common source of complaint precisely because members
 * discover them after the fact — computing it in front of them, with the same
 * `computeCharge` rules the server uses, removes the surprise.
 *
 * All validation here is advisory. The server recomputes the fee, re-checks
 * the available balance under a row lock, and is the only thing that decides.
 */
export function WithdrawalRequestForm({
  available,
  balance,
  minimum,
  maximum,
  minimumBalance,
  feeType,
  feeValue,
  requiresApproval,
}: {
  available: string;
  balance: string;
  minimum: string;
  maximum: string | null;
  minimumBalance: string;
  feeType: "FIXED" | "PERCENTAGE";
  feeValue: string;
  requiresApproval: boolean;
}) {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.member.withdrawals;

  // Both sentences put a bold figure mid-phrase, and Kinyarwanda does not put
  // it in the same place English does, so the translation is split around the
  // placeholder rather than assembled from fragments.
  const [availableBefore, availableAfter] = split(copy.availableNow, "amount");
  const [referenceBefore, referenceAfter] = split(
    copy.successReference,
    "reference"
  );

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [channel, setChannel] = useState("MOBILE_MONEY");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const preview = useMemo(() => {
    const parsed = parseMoneyInput(amount, { allowZero: false });
    if (!parsed.ok) return null;

    // Mirrors computeCharge() on the server: a percentage fee scales with the
    // amount, a fixed one does not.
    const feeString =
      feeType === "PERCENTAGE"
        ? toMoneyString(percentageOf(parsed.value, feeValue))
        : toMoneyString(feeValue);

    const total = add(parsed.value, feeString);
    const net = subtract(parsed.value, feeString);

    return {
      amount: toMoneyString(parsed.value),
      fee: feeString,
      total: toMoneyString(total),
      net: toMoneyString(net),
      exceedsAvailable: gt(total, available),
      belowMinimum: lt(parsed.value, minimum),
      aboveMaximum: maximum ? gt(parsed.value, maximum) : false,
      breaksMinimumBalance: lt(subtract(balance, total), minimumBalance),
    };
  }, [amount, feeType, feeValue, available, balance, minimum, maximum, minimumBalance]);

  const canSubmit =
    preview !== null &&
    !preview.exceedsAvailable &&
    !preview.belowMinimum &&
    !preview.aboveMaximum &&
    !preview.breaksMinimumBalance &&
    !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: preview?.amount,
          reason: reason.trim() || undefined,
          channel,
          destinationDetail: destination.trim() || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.details) setFieldErrors(payload.error.details);
        setError(payload?.error?.message ?? copy.submitFailed);
        setSubmitting(false);
        return;
      }

      setSuccess(payload.reference);
      setAmount("");
      setReason("");
      setDestination("");
      setSubmitting(false);
      router.refresh();
    } catch {
      setError(d.common.serverUnreachable);
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Alert variant="success" title={copy.successTitle}>
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {referenceBefore}
            <strong>{success}</strong>
            {referenceAfter}{" "}
            {requiresApproval ? copy.successUnderReview : copy.successPayingOut}
          </span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="font-semibold underline"
          >
            {copy.makeAnother}
          </button>
        </span>
      </Alert>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface p-5 shadow-card"
      noValidate
    >
      <h2 className="font-heading text-base font-semibold text-ink">
        {copy.formTitle}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {availableBefore}
        <strong className="text-ink">{formatMoney(available)}</strong>
        {availableAfter}
      </p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field
          id="wd-amount"
          label={d.common.amount}
          error={fieldErrors.amount}
          hint={
            maximum
              ? fill(copy.hintMinMax, {
                  min: formatMoney(minimum),
                  max: formatMoney(maximum),
                })
              : fill(copy.hintMin, { min: formatMoney(minimum) })
          }
          required
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
            />
          )}
        </Field>

        <Field id="wd-channel" label={copy.payoutMethod} required>
          {() => (
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="wd-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MOBILE_MONEY">
                  {copy.methodMobileMoney}
                </SelectItem>
                <SelectItem value="BANK_TRANSFER">{copy.methodBank}</SelectItem>
                <SelectItem value="CASH">{copy.methodCash}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {channel !== "CASH" && (
        <div className="mt-5">
          <Field
            id="wd-destination"
            label={
              channel === "MOBILE_MONEY" ? copy.mobileNumber : copy.bankAccount
            }
            hint={copy.destinationHint}
          >
            {(props) => (
              <Input
                {...props}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={
                  channel === "MOBILE_MONEY"
                    ? "0788123456"
                    : copy.accountNumberPlaceholder
                }
              />
            )}
          </Field>
        </div>
      )}

      <div className="mt-5">
        <Field id="wd-reason" label={copy.reasonLabel}>
          {(props) => (
            <Textarea
              {...props}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.reasonPlaceholder}
              rows={2}
            />
          )}
        </Field>
      </div>

      {preview && (
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{copy.amountRequested}</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(preview.amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{copy.withdrawalFee}</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(preview.fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-semibold text-ink">{copy.youReceive}</dt>
              <dd className="font-heading text-base font-bold tabular-nums text-ink">
                {formatMoney(preview.net)}
              </dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-ink-muted">{copy.deductedFromBalance}</dt>
              <dd className="tabular-nums text-ink-muted">{formatMoney(preview.total)}</dd>
            </div>
          </dl>

          {preview.exceedsAvailable && (
            <p className="mt-3 text-xs font-medium text-red-600">
              {fill(copy.errExceedsAvailable, {
                amount: formatMoney(available),
              })}
            </p>
          )}
          {preview.belowMinimum && (
            <p className="mt-3 text-xs font-medium text-red-600">
              {fill(copy.errBelowMinimum, { amount: formatMoney(minimum) })}
            </p>
          )}
          {preview.aboveMaximum && maximum && (
            <p className="mt-3 text-xs font-medium text-red-600">
              {fill(copy.errAboveMaximum, { amount: formatMoney(maximum) })}
            </p>
          )}
          {preview.breaksMinimumBalance && (
            <p className="mt-3 text-xs font-medium text-red-600">
              {fill(copy.errMinimumBalance, {
                amount: formatMoney(minimumBalance),
              })}
            </p>
          )}
        </div>
      )}

      <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={!canSubmit}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {d.common.submitting}
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden="true" />
            {copy.submitRequest}
          </>
        )}
      </Button>

      {requiresApproval && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {copy.approvalNote}
        </p>
      )}
    </form>
  );
}
