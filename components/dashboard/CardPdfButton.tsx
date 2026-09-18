"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { useFileDownload } from "@/hooks/use-file-download";
import { cn } from "@/lib/utils";

/**
 * A card PDF download for the admin card register — one member's side, or a
 * whole batch. Shows that it is working while the file is generated, which
 * for a batch of fronts can take a few seconds.
 */
export function CardPdfButton({
  href,
  label,
  fallbackName,
  variant = "outline",
  className,
}: {
  href: string;
  label: string;
  fallbackName: string;
  variant?: "primary" | "outline";
  className?: string;
}) {
  const { d } = useLanguage();
  const copy = d.admin.memberCards;
  const { busy, failed, download } = useFileDownload();

  return (
    <div className={cn("flex flex-col", className)}>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className="h-9 w-full px-3 text-xs"
        disabled={busy}
        onClick={() => void download(href, fallbackName)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-3.5" aria-hidden="true" />
        )}
        {busy ? copy.preparing : label}
      </Button>
      {failed && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {copy.failed}
        </p>
      )}
    </div>
  );
}
