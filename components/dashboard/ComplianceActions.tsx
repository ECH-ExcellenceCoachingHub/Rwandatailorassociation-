"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { CheckCircle2, HandCoins, Loader2, PlayCircle, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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
import { fill } from "@/lib/i18n/fill";
import { formatMoney } from "@/lib/money";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * ACTING ON SOMEBODY'S ARREARS.
 *
 * Four things an officer can do from the compliance screen: run today's
 * checks, take a fine out of a member's savings, forgive one, and excuse a
 * member from contributing altogether.
 *
 * THE THREE THAT TOUCH ONE PERSON ALL ASK FOR CONFIRMATION OR A REASON, and
 * the wording of each says what will actually happen to that member —
 * "take 490 from this member's savings", not "confirm". An officer clicking
 * through a generic dialog has not made a decision, and every one of these
 * ends up on a statement the member reads.
 */

function useAction(onDone?: () => void) {
  const router = useSiteRouter();
  const { d } = useLanguage();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string
  ) {
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // The service's own message is the useful one here — "their savings do
        // not cover the fine" is an outcome an officer must read, not a
        // generic failure.
        setError(payload?.error?.message ?? d.common.serverUnreachable);
        return null;
      }

      setDone(successMessage);
      router.refresh();
      setTimeout(() => {
        setDone(null);
        onDone?.();
      }, 2000);

      return payload?.data ?? payload ?? {};
    } catch {
      setError(d.common.serverUnreachable);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, done, setError };
}

/**
 * Runs the nightly work now.
 *
 * Offered because the worker is a separate process that can stop, and an
 * association preparing for a meeting should not have to discover on the day
 * that nobody has been warned all week. Idempotent, so pressing it twice is
 * harmless — which is what makes it safe to put on a screen at all.
 */
export function RunChecksButton() {
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);
  const { run, busy, error, done } = useAction();
  const [result, setResult] = useState<string | null>(null);

  async function handleRun() {
    const data = await run(
      "/api/admin/compliance",
      "POST",
      { tasks: ["FEES", "FINES", "REMINDERS"] },
      copy.runComplete
    );

    if (data) {
      setResult(
        fill(copy.runComplete, {
          fees: data.fees?.charged ?? 0,
          fines: data.fines?.assessed ?? 0,
          reminders: data.reminders?.warned ?? 0,
        })
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlayCircle className="size-4" aria-hidden="true" />
          {copy.runChecks}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{copy.runChecks}</DialogTitle>
        <DialogDescription>{copy.runChecksHint}</DialogDescription>

        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}

        {result && (
          <Alert variant="success" className="mt-3">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {result}
            </span>
          </Alert>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {d.common.close}
          </Button>
          <Button onClick={() => void handleRun()} disabled={busy || done !== null}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? copy.runningChecks : copy.runChecks}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SettleFineButton({
  fineId,
  amount,
  currency,
}: {
  fineId: string;
  amount: string;
  currency: string;
}) {
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);
  const { run, busy, error, done } = useAction(() => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HandCoins className="size-3.5" aria-hidden="true" />
          {copy.settleFine}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{copy.settleFine}</DialogTitle>
        <DialogDescription>
          {fill(copy.settleFineConfirm, {
            amount: formatMoney(amount, { currency }),
          })}
        </DialogDescription>

        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}
        {done && (
          <Alert variant="success" className="mt-3">
            {done}
          </Alert>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {d.common.cancel}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                `/api/admin/compliance/fines/${fineId}`,
                "PATCH",
                { action: "SETTLE" },
                copy.settleFine
              )
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {d.common.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WaiveFineButton({ fineId }: { fineId: string }) {
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, busy, error, done } = useAction(() => setOpen(false));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await run(
      `/api/admin/compliance/fines/${fineId}`,
      "PATCH",
      { action: "WAIVE", reason },
      copy.waiveFine
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {copy.waiveFine}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{copy.waiveFineTitle}</DialogTitle>
        <DialogDescription>{copy.waiveReason}</DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {done && <Alert variant="success">{done}</Alert>}

          <Field id="waive-reason" label={copy.waiveReason} required>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {d.common.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {copy.waiveFine}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Excusing a member, and correcting the day their obligation began.
 *
 * The two live in one dialog because they are the two ways an officer legitimately
 * makes arrears go away without money moving, and somebody looking at a member
 * who "shouldn't be behind" needs both in front of them: either they were
 * admitted later than the record says, or they have an agreed break.
 */
export function MemberComplianceButton({
  memberId,
  memberName,
  isExempt,
  obligationStart,
}: {
  memberId: string;
  memberName: string;
  isExempt: boolean;
  obligationStart: string;
}) {
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [startDate, setStartDate] = useState(obligationStart);
  const { run, busy, error, done } = useAction(() => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserMinus className="size-3.5" aria-hidden="true" />
          {isExempt ? copy.endExcuse : copy.excuseMember}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{copy.excuseTitle}</DialogTitle>
        <DialogDescription>{memberName}</DialogDescription>

        <div className="mt-4 space-y-6">
          {error && <Alert variant="error">{error}</Alert>}
          {done && <Alert variant="success">{done}</Alert>}

          <section className="space-y-3">
            <p className="text-sm text-ink-muted">{copy.excuseBody}</p>

            <Field id="excuse-reason" label={copy.waiveReason} required>
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>

            {!isExempt && (
              <Field
                id="excuse-until"
                label={copy.excuseUntil}
                hint={copy.excuseUntilHint}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                  />
                )}
              </Field>
            )}

            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  `/api/admin/compliance/members/${memberId}`,
                  "PATCH",
                  { isExempt: !isExempt, reason, until: until || undefined },
                  isExempt ? copy.endExcuse : copy.excuseMember
                )
              }
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isExempt ? copy.endExcuse : copy.excuseMember}
            </Button>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <Field
              id="obligation-start"
              label={copy.obligationStart}
              hint={copy.obligationStartHint}
            >
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              )}
            </Field>

            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  `/api/admin/compliance/members/${memberId}`,
                  "PATCH",
                  { startDate, reason },
                  copy.obligationStart
                )
              }
            >
              {d.common.save}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Wraps a row of actions so the table cell keeps them together. */
export function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-1">{children}</div>;
}
