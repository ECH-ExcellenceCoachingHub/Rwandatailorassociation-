"use client";

import { Download, Loader2, RectangleHorizontal, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { useFileDownload } from "@/hooks/use-file-download";
import type { CardSide } from "@/lib/cards/geometry";

/**
 * One side of the membership card, offered as its own download. See
 * `useFileDownload` for why it is fetched rather than linked.
 */
export function CardDownloadButton({
  side,
  title,
  body,
  icon,
}: {
  side: CardSide;
  title: string;
  body: string;
  icon: "front" | "back";
}) {
  const { d } = useLanguage();
  const copy = d.account.card;
  const { busy, failed, download } = useFileDownload();

  const Icon = icon === "front" ? ScanLine : RectangleHorizontal;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <h2 className="mt-3 font-heading text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">{body}</p>

      <Button
        className="mt-4 w-full"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void download(`/api/account/card?side=${side}`, `rta-card-${side}.pdf`)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-3.5" aria-hidden="true" />
        )}
        {busy ? copy.preparing : copy.download}
      </Button>

      {failed && (
        <p className="mt-2 text-sm font-medium text-red-600">{copy.failed}</p>
      )}
    </div>
  );
}
