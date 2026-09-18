"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useLanguage } from "@/components/LanguageProvider";
import { toCircularPngDataUrl } from "@/lib/images/prepare";

/**
 * A passport photograph inside an ordinary form.
 *
 * NOT AN UPLOAD. The photograph is cropped in the browser and held in the
 * form's own state as a `data:` URL until the form is submitted, because the
 * two places this is used have nowhere to upload to yet: an applicant filling
 * in the registration form has no account, and an administrator enrolling
 * somebody has no member id until the form is saved. A separate upload would
 * mean a photograph belonging to nobody, or a member created and then
 * abandoned halfway through getting one.
 *
 * The cost is base64 in the request body — a third more than the bytes, which
 * on a 512px PNG is tens of kilobytes. The server re-identifies those bytes
 * from their own magic numbers and applies its own limits regardless of what
 * this component sent.
 */
export function PhotoField({
  id,
  label,
  hint,
  error,
  required,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | string[] | null;
  required?: boolean;
  /// The photograph as a `data:` URL, or "" for none yet.
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const { d } = useLanguage();
  const copy = d.forms.photo;

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(file: File) {
    setBusy(true);
    setFailed(false);

    try {
      onChange(await toCircularPngDataUrl(file));
    } catch {
      // The canvas helper throws a code, not a sentence — every word the
      // applicant reads comes out of the dictionary in their own language.
      setFailed(true);
      onChange("");
    } finally {
      setBusy(false);
      // Cleared so choosing the same file again still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={failed ? copy.failed : error}
      required={required}
    >
      {(props) => (
        <div
          className="flex items-center gap-4"
          aria-describedby={props["aria-describedby"]}
        >
          <span
            className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 bg-ink/[0.04] ${
              props.invalid || failed ? "border-red-200" : "border-primary/30"
            }`}
          >
            {value ? (
              // A plain <img>: the source is a data URL the browser already
              // holds, which the image optimiser has nothing to do with.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt={copy.preview} className="size-full object-cover" />
            ) : (
              <UserRound className="size-8 text-ink-muted" aria-hidden="true" />
            )}
          </span>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              id={props.id}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="size-3.5" aria-hidden="true" />
              )}
              {busy ? copy.working : value ? copy.replace : copy.choose}
            </Button>

            {value && !busy && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => onChange("")}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {copy.remove}
              </Button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void choose(file);
            }}
          />
        </div>
      )}
    </Field>
  );
}
