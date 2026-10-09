"use client";

import { useEffect, useRef, useState } from "react";
import { ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { downloadNodeAsPng } from "@/lib/download-image";

/**
 * Captures the growth summary card as a PNG and saves it beside the district
 * report's PDF and CSV exports.
 *
 * The card is found by id rather than passed as a child: the button belongs in
 * the district panel's toolbar, next to the other downloads, while the card
 * itself sits above it on the page.
 */
export function GrowthImageButton({ targetId }: { targetId: string }) {
  const { d } = useLanguage();
  const copy = d.admin.reports.growth;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"ready" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function download() {
    const node = document.getElementById(targetId);
    if (!node || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadNodeAsPng(node, `raporo-imikurire-${stamp}.png`);
      setMessage("ready");
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 6000);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={download} disabled={busy}>
        <ImageDown className="size-3.5" aria-hidden="true" />
        {copy.downloadImage}
      </Button>
      {message && (
        <p
          role="status"
          className={
            message === "ready"
              ? "text-xs font-medium text-[#3f8a26]"
              : "text-xs font-medium text-red-600"
          }
        >
          {message === "ready" ? copy.imageReady : copy.imageFailed}
        </p>
      )}
    </div>
  );
}
