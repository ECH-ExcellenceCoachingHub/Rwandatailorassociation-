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
  const [files, setFiles] = useState<File[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [type, setType] = useState<StatementType>("BANK_STATEMENT");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Array.from(e.target.files ?? []);
      setFiles(next);
      setTitles(next.map((f) => f.name));
      setError(null);
      setSuccess(null);
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError(copy.fileRequired);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append("type", type);
      formData.append("title", titles.join("||"));

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
      setFiles([]);
      setTitles([]);
      setType("BANK_STATEMENT");
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
              value={titles.join(", ")}
              onChange={(e) => {
                const value = e.target.value;
                const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
                setTitles(parts.length > 0 ? parts : files.map((f) => f.name));
              }}
              placeholder={copy.titlePlaceholder}
              disabled={uploading}
              className="text-sm h-9"
            />
            <span className="mt-0.5 block text-[11px] text-ink-muted">
              {titles.length > 1
                ? "Comma-separated titles, one per file (in upload order)"
                : copy.titlePlaceholder}
            </span>
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
              {files.length > 0
                ? `${files.length} file(s) selected · ${copy.uploadHint}`
                : copy.uploadHint}
            </span>
            <input
              id="evidence-statement-file"
              type="file"
              accept="application/pdf,.pdf,.png,.jpg,.jpeg"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Selected files
            </span>
            <ul className="space-y-1 text-sm">
              {files.map((file, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface/50">
                  <span className="truncate text-ink">{file.name}</span>
                  <span className="text-[11px] text-ink-muted tabular-nums">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Button
          type="submit"
          disabled={uploading || files.length === 0}
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
