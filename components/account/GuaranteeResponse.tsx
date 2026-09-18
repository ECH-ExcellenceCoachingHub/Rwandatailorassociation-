"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";

/**
 * Accept or decline a request to guarantee another member's loan.
 *
 * Both answers go through a confirmation that says, in money, what the answer
 * does. Accepting holds part of the reader's own savings for months; a single
 * tap on a phone at a pay point is not consent to that, so the amount and the
 * condition for getting it back are stated before it happens.
 *
 * The server decides whether the reader has the money — this component does
 * not check, because the figure it could check against might already be stale.
 * A refusal comes back as a sentence and is shown in the dialog.
 */
export function GuaranteeResponse({
  guaranteeId,
  borrowerName,
  amount,
}: {
  guaranteeId: string;
  borrowerName: string;
  /// Already formatted with its currency.
  amount: string;
}) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.account.status;

  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  async function answer(body: Record<string, unknown>) {
    const response = await fetch(`/api/guarantees/${guaranteeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // Thrown so the dialog stays open and shows why.
      throw new Error(payload?.error?.message ?? copy.guaranteeFailed);
    }

    router.refresh();
  }

  return (
    <>
      <span className="mt-2 flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => setAccepting(true)}>
          <Check className="size-3.5" aria-hidden="true" />
          {copy.guaranteeAccept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReason("");
            setDeclining(true);
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
          {copy.guaranteeDecline}
        </Button>
      </span>

      <ConfirmDialog
        open={accepting}
        onOpenChange={setAccepting}
        title={fill(copy.guaranteeAcceptTitle, { name: borrowerName })}
        description={fill(copy.guaranteeAcceptBody, { name: borrowerName, amount })}
        confirmLabel={fill(copy.guaranteeAcceptConfirm, { amount })}
        onConfirm={() => answer({ decision: "accept" })}
      />

      <ConfirmDialog
        open={declining}
        onOpenChange={setDeclining}
        title={copy.guaranteeDeclineTitle}
        description={fill(copy.guaranteeDeclineBody, { name: borrowerName })}
        confirmLabel={copy.guaranteeDecline}
        tone="danger"
        onConfirm={() =>
          answer({ decision: "decline", reason: reason.trim() || undefined })
        }
      >
        <div className="space-y-2">
          <label
            htmlFor={`decline-reason-${guaranteeId}`}
            className="block text-sm font-semibold text-ink"
          >
            {copy.guaranteeDeclineReason}
          </label>
          <Textarea
            id={`decline-reason-${guaranteeId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
