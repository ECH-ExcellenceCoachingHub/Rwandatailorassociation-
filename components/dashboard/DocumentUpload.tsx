"use client";

import { useState, useCallback } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";
import { Label } from "@/components/ui/label";

export function DocumentUpload() {
  const { d } = useLanguage();
  const copy = d.platform.documents;

  type StatementType = "BANK_STATEMENT" | "MOMO_STATEMENT";

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<StatementType>("BANK_STATEMENT");
  const [title, setTitle] = useState("");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      setFile(f);
      setError(null);
      setSuccess(null);
      if (f && !title) setTitle(f.name);
    },
    [title]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(copy.fileRequired);
      return;
    }
    if (!title.trim()) {
      setError(copy.titlePlaceholder);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("title", title.trim());

      const response = await fetch("/api/admin/documents", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(
          (payload as { error?: { message?: string } })?.error?.message ??
            copy.uploadFailed
        );
        setUploading(false);
        return;
      }

      setSuccess(copy.uploaded);
      setFile(null);
      setType("BANK_STATEMENT");
      setTitle("");
      const input = document.getElementById("evidence-statement-file");
      if (input instanceof HTMLInputElement) input.value = "";
    } catch {
      setError(copy.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  const typeOptions: { value: StatementType; label: string }[] = [
    { value: "BANK_STATEMENT", label: copy.bankStatement },
    { value: "MOMO_STATEMENT", label: copy.momoStatement },
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="evidence-statement-title">
              {copy.titlePlaceholder}
            </Label>
            <Input
              id="evidence-statement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={copy.titlePlaceholder}
              disabled={uploading}
              className="text-sm h-9"
            />
          </div>
          <div>
            <Label>{copy.typeRequired}</Label>
            <div className="flex gap-2">
              {typeOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 cursor-pointer rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-primary-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-hover"
                >
                  <input
                    type="radio"
                    name="evidence-statement-type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    disabled={uploading}
                    className="sr-only peer"
                  />
                  <span
                    className={`peer-data-[state=checked]:hidden inline-block ${type === option.value ? "font-semibold text-primary" : "text-ink-muted"}`}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="evidence-statement-file">{copy.chooseFile}</Label>
          <div className="mt-2 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary-50/30">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary mx-auto mb-2">
              {uploading ? (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-6" aria-hidden="true" />
              )}
            </span>
            <span className="block font-heading text-sm font-semibold text-ink">
              {uploading ? "Uploading…" : copy.uploadButton}
            </span>
            <span className="mt-1 block max-w-sm text-xs text-ink-muted">
              {copy.uploadHint}
            </span>
            <input
              id="evidence-statement-file"
              type="file"
              accept="application/pdf,.pdf,.png,.jpg,.jpeg"
              className="sr-only"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Button
          type="submit"
          disabled={uploading || !file || !title.trim()}
          className="w-full sm:w-auto"
        >
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="size-4 mr-2" aria-hidden="true" />
              {copy.uploadButton}
            </>
          )}
        </Button>
      </form>
    </section>
  );
}
