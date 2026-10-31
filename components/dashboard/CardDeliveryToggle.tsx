"use client";

import { useState } from "react";

import { CheckCircle2, CircleDollarSign, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { cn } from "@/lib/utils";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Whether a member has received their printed card, with a button to change
 * it. The new state shows at once; if the server refuses, it flips back and
 * says so. The page is refreshed afterwards so the counts and the delivered/
 * not-delivered filter catch up.
 */
export function CardDeliveryToggle({
  memberId,
  deliveredAt,
  canEdit,
}: {
  memberId: string;
  deliveredAt: Date | string | null;
  canEdit: boolean;
}) {
  const router = useSiteRouter();
  const { d, locale } = useLanguage();
  const copy = d.admin.memberCards;
  const [current, setCurrent] = useState<Date | string | null>(deliveredAt);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const delivered = current !== null;

  async function toggle() {
    const previous = current;
    setBusy(true);
    setFailed(false);
    setCurrent(delivered ? null : new Date());

    try {
      const response = await fetch(`/api/admin/members/${memberId}/card-delivery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivered: !delivered }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { cardDeliveredAt?: string | null };
      setCurrent(body.cardDeliveredAt ?? null);
      router.refresh();
    } catch {
      setCurrent(previous);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold",
            delivered ? "text-emerald-700" : "text-amber-700"
          )}
        >
          {delivered ? (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          ) : (
            <CircleDollarSign className="size-3.5" aria-hidden="true" />
          )}
          {delivered
            ? fill(copy.deliveredOn, { date: formatDate(current, locale) })
            : copy.notDelivered}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60",
              delivered
                ? "border-border text-ink-muted hover:border-red-300 hover:text-red-700"
                : "border-primary bg-primary text-white hover:bg-primary-hover"
            )}
          >
            {busy && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            {delivered ? copy.markNotDelivered : copy.markDelivered}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {copy.deliveryFailed}
        </p>
      )}
    </div>
  );
}