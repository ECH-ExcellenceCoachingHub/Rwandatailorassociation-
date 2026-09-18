"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";

/** Adds an internal note to a member's file. */
export function MemberNoteForm({ memberId }: { memberId: string }) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.admin.manage;

  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? copy.actionFailed);
      }

      setBody("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.actionFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-card"
    >
      <Label htmlFor="member-note">{copy.noteLabel}</Label>
      <Textarea
        id="member-note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={copy.notePlaceholder}
        rows={3}
        maxLength={2000}
        disabled={saving}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted">{copy.noteHint}</p>
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <StickyNote className="size-3.5" aria-hidden="true" />
          )}
          {copy.noteSave}
        </Button>
      </div>
    </form>
  );
}
