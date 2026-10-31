"use client";

import { useState, type FormEvent } from "react";

import { CheckCircle2, HandCoins, Loader2, TriangleAlert } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatMoney } from "@/lib/money";
import type { PoolDeductionPlan } from "@/lib/services/pool-deductions";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Taking money out of the members' pool.
 *
 * Two steps, deliberately. The officer first sees exactly what every member
 * will lose — and who cannot cover their part — and only then can post, behind
 * a confirmation that says in plain words what is about to happen. Changing
 * the amount or the split throws the preview away, so what is confirmed is
 * always what was looked at. The server re-works the split on the locked
 * balances regardless.
 */

const PURPOSES = ["MEMBER_LOAN", "ASSOCIATION_PROJECT", "ASSOCIATION_EXPENSE", "OTHER"] as const;
const ALLOCATIONS = ["BY_BALANCE", "BY_SHARES", "EQUAL"] as const;

export interface BeneficiaryOption {
  id: string;
  memberNumber: string;
  name: string;
}

export function NewPoolDeductionButton({
  members,
  currency,
}: {
  members: BeneficiaryOption[];
  currency: string;
}) {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.admin.poolDeductions;

  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>("ASSOCIATION_PROJECT");
  const [allocation, setAllocation] = useState<(typeof ALLOCATIONS)[number]>("BY_BALANCE");
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<PoolDeductionPlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "post" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const money = (value: string) => formatMoney(value, { currency });

  function resetPlan() {
    setPlan(null);
    setConfirmed(false);
  }

  async function call(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error?.message ?? d.common.serverUnreachable);
      setFieldErrors(payload?.error?.details ?? {});
      return null;
    }
    return payload;
  }

  async function handlePreview() {
    setError(null);
    setFieldErrors({});
    setBusy("preview");
    try {
      const result = await call("/api/admin/pool-deductions/preview", {
        totalAmount: amount,
        allocation,
      });
      if (result) setPlan(result as PoolDeductionPlan);
    } catch {
      setError(d.common.serverUnreachable);
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || plan.shortfalls > 0 || !confirmed) return;

    const form = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});
    setBusy("post");

    try {
      const result = await call("/api/admin/pool-deductions", {
        purpose,
        title: form.get("title"),
        reason: form.get("reason"),
        totalAmount: amount,
        allocation,
        beneficiaryMemberId: form.get("beneficiaryMemberId") || null,
      });
      if (!result) return;

      setSuccess(fill(copy.posted, { count: result.membersAffected }));
      router.refresh();
      setTimeout(() => {
        setSuccess(null);
        setOpen(false);
        resetPlan();
        setAmount("");
      }, 2000);
    } catch {
      setError(d.common.serverUnreachable);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <HandCoins className="size-4" aria-hidden="true" />
          {copy.newDeduction}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <div>
          <DialogTitle>{copy.formTitle}</DialogTitle>
          <DialogDescription className="mt-1">{copy.formIntro}</DialogDescription>
        </div>

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
            <Field id="purpose" label={copy.purposeLabel} error={fieldErrors.purpose} required>
              {(props) => (
                <NativeSelect
                  {...props}
                  name="purpose"
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value as (typeof PURPOSES)[number])
                  }
                >
                  {PURPOSES.map((value) => (
                    <option key={value} value={value}>
                      {copy.purposes[value]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              id="beneficiaryMemberId"
              label={copy.beneficiaryLabel}
              error={fieldErrors.beneficiaryMemberId}
            >
              {(props) => (
                <NativeSelect {...props} name="beneficiaryMemberId" defaultValue="">
                  <option value="">{copy.beneficiaryNone}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.memberNumber} · {member.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <Field
            id="title"
            label={copy.titleLabel}
            hint={copy.titleHint}
            error={fieldErrors.title}
            required
          >
            {(props) => <Input {...props} name="title" maxLength={120} required />}
          </Field>

          <Field
            id="reason"
            label={copy.reasonLabel}
            hint={copy.reasonHint}
            error={fieldErrors.reason}
            required
          >
            {(props) => (
              <Textarea {...props} name="reason" rows={3} minLength={15} maxLength={1000} required />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="totalAmount"
              label={copy.amountLabel}
              error={fieldErrors.totalAmount}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  name="totalAmount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    resetPlan();
                  }}
                  required
                />
              )}
            </Field>

            <Field
              id="allocation"
              label={copy.allocationLabel}
              hint={copy.allocationHints[allocation]}
              error={fieldErrors.allocation}
              required
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="allocation"
                  value={allocation}
                  onChange={(event) => {
                    setAllocation(event.target.value as (typeof ALLOCATIONS)[number]);
                    resetPlan();
                  }}
                >
                  {ALLOCATIONS.map((value) => (
                    <option key={value} value={value}>
                      {copy.allocations[value]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          {!plan && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={busy !== null || !amount.trim()}
            >
              {busy === "preview" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {copy.previewButton}
            </Button>
          )}

          {plan && (
            <div className="space-y-3">
              <p className="text-sm text-ink">
                {fill(copy.previewSummary, {
                  count: plan.lines.length,
                  amount: money(plan.totalAmount),
                  pool: money(plan.poolBalance),
                })}
              </p>

              {plan.shortfalls > 0 && (
                <Alert variant="warning">
                  <span className="inline-flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {fill(copy.shortfallWarning, { count: plan.shortfalls })}
                  </span>
                </Alert>
              )}

              <TableWrapper className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.colMember}</TableHead>
                      <TableHead className="text-right">{copy.colShares}</TableHead>
                      <TableHead className="text-right">{copy.colBalance}</TableHead>
                      <TableHead className="text-right">{copy.colPart}</TableHead>
                      <TableHead className="text-right">{copy.colAfter}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.lines.map((line) => (
                      <TableRow key={line.memberId}>
                        <TableCell className="text-sm">
                          <span className="font-mono text-xs text-ink-muted">
                            {line.memberNumber}
                          </span>{" "}
                          {line.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{line.shares}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(line.balance)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rose-600">
                          -{money(line.amount)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${line.shortfall ? "font-semibold text-rose-600" : ""}`}
                        >
                          {money(line.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>

              {plan.shortfalls === 0 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span className="text-sm text-ink">{copy.confirmLabel}</span>
                </label>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {d.common.cancel}
            </Button>
            {plan && (
              <Button
                type="submit"
                disabled={busy !== null || plan.shortfalls > 0 || !confirmed}
              >
                {busy === "post" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {fill(copy.postButton, { amount: money(plan.totalAmount) })}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
