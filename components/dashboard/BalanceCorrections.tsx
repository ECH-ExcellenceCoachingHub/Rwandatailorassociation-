"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, PiggyBank, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { add, formatMoney, subtract } from "@/lib/money";

export interface CorrectableLoan {
  id: string;
  reference: string;
  status: string;
  principal: string;
  interest: string;
  fees: string;
  penalty: string;
}

type Bucket = "principal" | "interest" | "fees" | "penalty";
const BUCKETS: Bucket[] = ["principal", "interest", "fees", "penalty"];
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * Hand corrections to a member's figures, for when the automatic matching or
 * the nightly jobs got them wrong. Every action posts a new ledger row with a
 * written reason; nothing already posted is edited.
 */
export function BalanceCorrections({
  memberId,
  savingsBalance,
  loans,
  can,
}: {
  memberId: string;
  /// Null when the member has no open savings account.
  savingsBalance: string | null;
  loans: CorrectableLoan[];
  can: { deposit: boolean; setBalance: boolean; loans: boolean };
}) {
  const { d } = useLanguage();
  const copy = d.admin.corrections;

  const tabs = [
    can.deposit && savingsBalance !== null && "deposit",
    can.setBalance && savingsBalance !== null && "balance",
    can.loans && "loan",
  ].filter(Boolean) as string[];
  if (tabs.length === 0) return null;

  return (
    <section
      id="corrections"
      className="rounded-2xl border border-border bg-surface p-5 shadow-card"
    >
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <Wrench className="size-4" aria-hidden="true" />
        </span>
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{copy.description}</p>

      <Tabs defaultValue={tabs[0]} className="mt-4">
        <TabsList>
          {tabs.includes("deposit") && <TabsTrigger value="deposit">{copy.tabDeposit}</TabsTrigger>}
          {tabs.includes("balance") && <TabsTrigger value="balance">{copy.tabBalance}</TabsTrigger>}
          {tabs.includes("loan") && <TabsTrigger value="loan">{copy.tabLoan}</TabsTrigger>}
        </TabsList>

        {tabs.includes("deposit") && (
          <TabsContent value="deposit" className="pt-4">
            <DepositForm memberId={memberId} balance={savingsBalance ?? "0"} />
          </TabsContent>
        )}
        {tabs.includes("balance") && (
          <TabsContent value="balance" className="pt-4">
            <BalanceForm memberId={memberId} balance={savingsBalance ?? "0"} />
          </TabsContent>
        )}
        {tabs.includes("loan") && (
          <TabsContent value="loan" className="pt-4">
            <LoanForm loans={loans} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}

/** Posts JSON and throws the API's own message on failure. */
async function submit(url: string, body: unknown, fallback: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? fallback);
  return payload?.data?.message ?? payload?.message ?? null;
}

function useCorrection() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setDone(null);
    try {
      setDone(await action());
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      // Shown under the form once the dialog closes, so the officer can fix
      // the figure and try again without retyping everything.
      setError(caught instanceof Error ? caught.message : String(caught));
      setConfirming(false);
    }
  }

  return { confirming, setConfirming, error, setError, done, run };
}

function DepositForm({ memberId, balance }: { memberId: string; balance: string }) {
  const { d } = useLanguage();
  const copy = d.admin.corrections;
  const state = useCorrection();

  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("CASH");
  const [externalReference, setExternalReference] = useState("");

  const valid = AMOUNT.test(amount.trim()) && Number(amount) > 0;

  function review(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      state.setError(copy.invalidAmount);
      return;
    }
    state.setError(null);
    state.setConfirming(true);
  }

  return (
    <form onSubmit={review} className="space-y-4">
      <p className="text-sm text-ink-muted">{copy.depositHint}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="corr-dep-amount" label={d.common.amount} required>
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="15000"
            />
          )}
        </Field>
        <Field id="corr-dep-channel" label={copy.channel} required>
          {(props) => (
            <NativeSelect {...props} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="CASH">{copy.channelCash}</option>
              <option value="BANK_TRANSFER">{copy.channelBank}</option>
              <option value="MOBILE_MONEY">{copy.channelMobile}</option>
              <option value="OTHER">{copy.channelOther}</option>
            </NativeSelect>
          )}
        </Field>
        <Field id="corr-dep-ref" label={copy.externalReference} hint={copy.optional}>
          {(props) => (
            <Input
              {...props}
              value={externalReference}
              maxLength={120}
              onChange={(e) => setExternalReference(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Feedback error={state.error} done={state.done} />
      <Button type="submit" size="sm">
        <PiggyBank className="size-3.5" aria-hidden="true" />
        {copy.review}
      </Button>

      <ConfirmDialog
        open={state.confirming}
        onOpenChange={state.setConfirming}
        title={copy.depositConfirmTitle}
        description={copy.confirmBody}
        confirmLabel={copy.depositConfirm}
        requireReason
        reasonMinLength={5}
        reasonLabel={copy.reasonLabel}
        reasonPlaceholder={copy.reasonPlaceholder}
        onConfirm={(reason) =>
          state.run(() =>
            submit(
              `/api/admin/members/${memberId}/savings-correction`,
              {
                kind: "deposit",
                amount: amount.trim(),
                channel,
                externalReference: externalReference.trim() || undefined,
                reason,
              },
              d.admin.manage.actionFailed
            )
          )
        }
      >
        <Change
          label={d.admin.file.savingsBalance}
          from={balance}
          to={valid ? add(balance, amount.trim()).toFixed(2) : balance}
        />
      </ConfirmDialog>
    </form>
  );
}

function BalanceForm({ memberId, balance }: { memberId: string; balance: string }) {
  const { d } = useLanguage();
  const copy = d.admin.corrections;
  const state = useCorrection();

  const [target, setTarget] = useState("");
  const valid = AMOUNT.test(target.trim());

  function review(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      state.setError(copy.invalidAmount);
      return;
    }
    state.setError(null);
    state.setConfirming(true);
  }

  return (
    <form onSubmit={review} className="space-y-4">
      <p className="text-sm text-ink-muted">{copy.balanceHint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="corr-bal-current" label={copy.currentBalance}>
          {(props) => <Input {...props} value={formatMoney(balance)} readOnly disabled />}
        </Field>
        <Field id="corr-bal-target" label={copy.correctBalance} required>
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={Number(balance).toFixed(0)}
            />
          )}
        </Field>
      </div>

      <Feedback error={state.error} done={state.done} />
      <Button type="submit" size="sm">
        <PiggyBank className="size-3.5" aria-hidden="true" />
        {copy.review}
      </Button>

      <ConfirmDialog
        open={state.confirming}
        onOpenChange={state.setConfirming}
        title={copy.balanceConfirmTitle}
        description={copy.confirmBody}
        confirmLabel={copy.balanceConfirm}
        tone="danger"
        requireReason
        reasonMinLength={5}
        reasonLabel={copy.reasonLabel}
        reasonPlaceholder={copy.reasonPlaceholder}
        onConfirm={(reason) =>
          state.run(() =>
            submit(
              `/api/admin/members/${memberId}/savings-correction`,
              { kind: "set-balance", targetBalance: target.trim(), reason },
              d.admin.manage.actionFailed
            )
          )
        }
      >
        <Change label={d.admin.file.savingsBalance} from={balance} to={valid ? target.trim() : balance} />
      </ConfirmDialog>
    </form>
  );
}

function LoanForm({ loans }: { loans: CorrectableLoan[] }) {
  const { d } = useLanguage();
  const copy = d.admin.corrections;
  const state = useCorrection();

  const [loanId, setLoanId] = useState(loans[0]?.id ?? "");
  const loan = loans.find((l) => l.id === loanId) ?? null;
  const [figures, setFigures] = useState<Record<Bucket, string>>(() => bucketsOf(loans[0]));

  if (!loan) {
    return <p className="text-sm text-ink-muted">{copy.noLoans}</p>;
  }

  const labels: Record<Bucket, string> = {
    principal: copy.principal,
    interest: copy.interest,
    fees: copy.fees,
    penalty: copy.penalty,
  };
  const valid = BUCKETS.every((b) => AMOUNT.test(figures[b].trim()));
  const before = add(loan.principal, loan.interest, loan.fees, loan.penalty);
  const after = valid ? add(...BUCKETS.map((b) => figures[b].trim())) : before;

  function review(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      state.setError(copy.invalidAmount);
      return;
    }
    state.setError(null);
    state.setConfirming(true);
  }

  return (
    <form onSubmit={review} className="space-y-4">
      <p className="text-sm text-ink-muted">{copy.loanHint}</p>
      <Field id="corr-loan" label={copy.loan} required>
        {(props) => (
          <NativeSelect
            {...props}
            value={loanId}
            onChange={(e) => {
              setLoanId(e.target.value);
              setFigures(bucketsOf(loans.find((l) => l.id === e.target.value)));
              state.setError(null);
            }}
          >
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.reference} · {formatMoney(add(l.principal, l.interest, l.fees, l.penalty))}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map((bucket) => (
          <Field
            key={bucket}
            id={`corr-loan-${bucket}`}
            label={labels[bucket]}
            hint={fill(copy.nowOwed, { amount: formatMoney(loan[bucket]) })}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={figures[bucket]}
                onChange={(e) => setFigures({ ...figures, [bucket]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>

      <Feedback error={state.error} done={state.done} />
      <Button type="submit" size="sm">
        <HandCoins className="size-3.5" aria-hidden="true" />
        {copy.review}
      </Button>

      <ConfirmDialog
        open={state.confirming}
        onOpenChange={state.setConfirming}
        title={fill(copy.loanConfirmTitle, { reference: loan.reference })}
        description={copy.confirmBody}
        confirmLabel={copy.loanConfirm}
        tone="danger"
        requireReason
        reasonMinLength={5}
        reasonLabel={copy.reasonLabel}
        reasonPlaceholder={copy.reasonPlaceholder}
        onConfirm={(reason) =>
          state.run(() =>
            submit(
              `/api/admin/loans/${loan.id}/correction`,
              {
                outstanding: Object.fromEntries(BUCKETS.map((b) => [b, figures[b].trim()])),
                reason,
              },
              d.admin.manage.actionFailed
            )
          )
        }
      >
        <div className="space-y-1">
          {BUCKETS.filter((b) => valid && !subtract(figures[b].trim(), loan[b]).isZero()).map((b) => (
            <Change key={b} label={labels[b]} from={loan[b]} to={figures[b].trim()} />
          ))}
          <Change label={copy.totalOwed} from={before.toFixed(2)} to={after.toFixed(2)} strong />
          {after.isZero() && <p className="text-xs text-emerald-700">{copy.willClose}</p>}
        </div>
      </ConfirmDialog>
    </form>
  );
}

function bucketsOf(loan: CorrectableLoan | undefined): Record<Bucket, string> {
  return {
    principal: trimZeros(loan?.principal),
    interest: trimZeros(loan?.interest),
    fees: trimZeros(loan?.fees),
    penalty: trimZeros(loan?.penalty),
  };
}

function trimZeros(value: string | undefined): string {
  return (value ?? "0").replace(/\.00$/, "");
}

function Change({
  label,
  from,
  to,
  strong,
}: {
  label: string;
  from: string;
  to: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg bg-ink/[0.03] px-3 py-2 text-sm ${strong ? "font-semibold" : ""}`}
    >
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums text-ink">
        {formatMoney(from)} → {formatMoney(to)}
      </span>
    </div>
  );
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) return <Alert variant="error">{error}</Alert>;
  if (done) return <Alert variant="success">{done}</Alert>;
  return null;
}
