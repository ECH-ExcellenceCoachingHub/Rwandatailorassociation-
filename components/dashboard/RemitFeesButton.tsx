"use client";

import { useState, type FormEvent } from "react";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * RECORDING THAT THE PLATFORM'S FEE HAS BEEN PAID OVER.
 *
 * This button moves no money. It records that money already moved, by whatever
 * means the association pays its operator — bank transfer, mobile money, cash
 * at a meeting. The dialog says so in as many words, because a button on a
 * financial screen that looks like it might initiate a payment and does not is
 * the kind of ambiguity that gets a fee paid twice or not at all.
 *
 * The date defaults to today and is editable: an association recording a
 * payment made last Friday must be able to say so, or fees collected over the
 * weekend would be wrongly marked as covered by it.
 */
export function RemitFeesButton({
  owed,
  currency,
}: {
  owed: string;
  currency: string;
}) {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.rules.funds;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [upTo, setUpTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/admin/funds/remit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upTo, reference: reference || undefined }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? copy.nothingToRemit);
        return;
      }

      const data = payload?.data ?? payload;
      setDone(
        fill(copy.remittanceRecorded, {
          count: data?.count ?? 0,
          amount: formatMoney(data?.amount ?? "0", { currency }),
        })
      );

      router.refresh();
      setTimeout(() => {
        setDone(null);
        setOpen(false);
      }, 2500);
    } catch {
      setError(d.common.serverUnreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Send className="size-3.5" aria-hidden="true" />
          {copy.recordRemittance}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogTitle>{copy.remittanceTitle}</DialogTitle>
        <DialogDescription>{copy.remittanceBody}</DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {done && (
            <Alert variant="success">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {done}
              </span>
            </Alert>
          )}

          <div className="rounded-xl border border-border bg-canvas p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {copy.owedToOperator}
            </p>
            <p className="mt-0.5 font-heading text-xl font-bold tabular-nums text-ink">
              {formatMoney(owed, { currency })}
            </p>
          </div>

          <Field id="remit-upto" label={copy.remittanceUpTo} required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={upTo}
                onChange={(event) => setUpTo(event.target.value)}
              />
            )}
          </Field>

          <Field id="remit-reference" label={copy.remittanceReference}>
            {(props) => (
              <Input
                {...props}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
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
              {d.common.confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
