"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { toCircularPng } from "@/lib/images/prepare";

/**
 * The photograph that goes on the front of the membership card.
 *
 * Replacing a photograph on an account that already exists, which is what
 * separates this from the photograph fields on the registration and enrolment
 * forms: there is a member to upload against, so the bytes go straight to the
 * server instead of waiting in a form's state. The crop itself is the same one
 * — see lib/images/prepare.ts for why it happens in the browser.
 *
 * The server does not take the client's word for any of it — the bytes are
 * re-identified from their own magic numbers on arrival. This component is
 * about sparing the member a slow upload, not about establishing trust.
 */

export function CardPhotoUpload({ hasPhoto }: { hasPhoto: boolean }) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.account.card;

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after every change so the <img> refetches rather than showing the
  // browser's cached copy of the photograph that was just replaced.
  const [version, setVersion] = useState(0);

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    try {
      const circular = await toCircularPng(file);

      const body = new FormData();
      body.append("file", circular, "card-photo.png");

      const response = await fetch("/api/account/avatar", { method: "POST", body });
      if (!response.ok) {
        // The route explains refusals — too small, wrong format — and that
        // wording is more useful to the member than a generic failure.
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error?.message ?? "upload failed");
      }

      setVersion((v) => v + 1);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "upload failed"
        ? cause.message
        : copy.photoFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      setError(copy.photoFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="font-heading text-base font-semibold text-ink">
        {copy.photoTitle}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.photoBody}</p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-primary/30 bg-ink/[0.04]">
          {hasPhoto ? (
            // A plain <img>, not next/image: the bytes come from an
            // authenticated route that the image optimiser cannot fetch on the
            // member's behalf, and the photograph is already 512px.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/account/avatar?v=${version}`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <UserRound className="size-9 text-ink-muted" aria-hidden="true" />
          )}
        </span>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="size-3.5" aria-hidden="true" />
            )}
            {busy
              ? copy.uploading
              : hasPhoto
                ? copy.replacePhoto
                : copy.choosePhoto}
          </Button>

          {hasPhoto && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-red-600 hover:bg-red-50"
              onClick={() => void remove()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {copy.removePhoto}
            </Button>
          )}
        </div>
      </div>

      {!hasPhoto && !error && (
        <p className="mt-3 text-sm text-ink-muted">{copy.noPhotoYet}</p>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
