"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Gives a member a new temporary password.
 *
 * Asks first, because the member's current password stops working at once and
 * they are signed out everywhere. The new password is shown here once and is
 * gone when the page is left — only its hash is stored.
 */
export function MemberPasswordReset({ memberId }: { memberId: string }) {
  const { d } = useLanguage();
  const copy = d.admin.manage;

  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reset() {
    setWorking(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}/password`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? copy.actionFailed);
      }

      setPassword(payload.temporaryPassword);
      setCopied(false);
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.actionFailed);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
        {copy.passwordTitle}
      </h2>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <p className="text-sm leading-relaxed text-ink-muted">{copy.passwordIntro}</p>

        {password && (
          <Alert variant="success" title={copy.passwordDone}>
            <p className="mt-1 text-sm text-ink-muted">{copy.passwordNew}</p>
            <p className="font-mono text-lg font-semibold tracking-wide text-ink">
              {password}
            </p>
            <p className="mt-1 text-xs leading-relaxed">{copy.passwordNewHint}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard?.writeText(password).then(() => setCopied(true));
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? d.common.copied : copy.passwordCopy}
            </Button>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">{copy.passwordConfirm}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={reset} disabled={working}>
                {working ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-3.5" aria-hidden="true" />
                )}
                {copy.passwordConfirmButton}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={working}
              >
                {d.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirming(true);
              setError(null);
            }}
          >
            <KeyRound className="size-3.5" aria-hidden="true" />
            {copy.passwordReset}
          </Button>
        )}
      </div>
    </section>
  );
}
