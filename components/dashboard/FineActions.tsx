"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatMoney } from "@/lib/money";
import type { FineKind } from "@/lib/services/fines";

/**
 * THE TWO WAYS A FINE ENDS, from the register.
 *
 * ONE COMPONENT, TWO ENDPOINTS. The register shows both kinds of fine in one
 * table, so the buttons in a row have to know which service owns the record
 * behind it — a contribution fine is waived through the compliance API and a
 * warehouse-credit fine through the warehouse one. Routing that here, off
 * `kind`, is what lets the page stay a single table instead of two.
 *
 * COLLECTING IS OFFERED FOR CONTRIBUTION FINES ONLY. There is no endpoint that
 * takes a credit fine out of savings, because that is not how a credit is
 * repaid — it is cleared by paying the instalment it hangs off. Rendering a
 * disabled button would imply the action exists and is merely unavailable; the
 * page carries a sentence explaining the real path instead.
 *
 * Both waivers demand a written reason of at least ten characters, matching the
 * schema on both routes. That is not a form nicety: waiving is an officer
 * choosing not to collect the association's money, and the reason is what the
 * audit log has to show for it.
 */

async function post(url: string, method: "POST" | "PATCH", body: unknown, fallback: string) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // The service's own message is the useful one — "their savings do not
    // cover the fine" is an outcome an officer must read, not a generic error.
    throw new Error(payload?.error?.message ?? fallback);
  }

  return response.json().catch(() => null);
}

export function SettleFineAction({
  fineId,
  amount,
  currency,
}: {
  fineId: string;
  amount: string;
  currency: string;
}) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <HandCoins className="size-3.5" aria-hidden="true" />
        {copy.settleFine}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.settleFine}
        description={fill(copy.settleFineConfirm, {
          amount: formatMoney(amount, { currency }),
        })}
        confirmLabel={copy.settleFine}
        onConfirm={async () => {
          await post(
            `/api/admin/compliance/fines/${fineId}`,
            "PATCH",
            { action: "SETTLE" },
            d.common.serverUnreachable
          );
          router.refresh();
        }}
      />
    </>
  );
}

export function WaiveFineAction({
  fineId,
  kind,
  amount,
  currency,
}: {
  fineId: string;
  kind: FineKind;
  amount: string;
  currency: string;
}) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.rules.compliance;

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Gavel className="size-3.5" aria-hidden="true" />
        {copy.waiveFine}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${copy.waiveFineTitle} — ${formatMoney(amount, { currency })}`}
        description={copy.waiveReason}
        confirmLabel={copy.waiveFine}
        tone="danger"
        requireReason
        reasonLabel={copy.waiveReason}
        reasonMinLength={10}
        onConfirm={async (reason) => {
          if (kind === "CONTRIBUTION") {
            await post(
              `/api/admin/compliance/fines/${fineId}`,
              "PATCH",
              { action: "WAIVE", reason },
              d.common.serverUnreachable
            );
          } else {
            await post(
              `/api/admin/warehouse/fines/${fineId}/waive`,
              "POST",
              { reason },
              d.common.serverUnreachable
            );
          }
          router.refresh();
        }}
      />
    </>
  );
}
