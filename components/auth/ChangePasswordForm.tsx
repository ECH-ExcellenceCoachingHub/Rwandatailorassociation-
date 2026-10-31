"use client";

import { useState, type FormEvent } from "react";

import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useLanguage } from "@/components/LanguageProvider";
import { assessPasswordStrength } from "@/lib/auth/password.shared";
import { useSiteRouter } from "@/hooks/use-site-paths";

export function ChangePasswordForm() {
  const router = useSiteRouter();

  const { d } = useLanguage();
  const copy = d.auth.changePassword;

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const strength = assessPasswordStrength(password);
  const canSubmit =
    currentPassword.length > 0 &&
    strength.acceptable &&
    password === confirmPassword &&
    password !== currentPassword &&
    !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.details) setErrors(payload.error.details);
        setError(payload?.error?.message ?? copy.failed);
        setSubmitting(false);
        return;
      }

      setDone(true);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setSubmitting(false);
      // Refresh so the "must change password" banner clears.
      router.refresh();
    } catch {
      setError(d.common.serverUnreachable);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface p-5 shadow-card"
      noValidate
    >
      <h2 className="font-heading text-base font-semibold text-ink">
        {copy.title}
      </h2>

      {done && (
        <Alert variant="success" className="mt-4">
          {copy.done}
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 space-y-5">
        <Field
          id="current-password"
          label={copy.currentPassword}
          error={errors.currentPassword}
          required
        >
          {(props) => (
            <Input
              {...props}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
        </Field>

        <Field
          id="new-password"
          label={copy.newPassword}
          error={errors.password}
          required
        >
          {(props) => (
            <div className="relative">
              <Input
                {...props}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={copy.newPasswordPlaceholder}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? copy.hidePasswords : copy.showPasswords}
                className="absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {show ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </Field>

        <PasswordStrength password={password} />

        <Field
          id="confirm-new-password"
          label={copy.confirmPassword}
          error={
            confirmPassword && password !== confirmPassword
              ? copy.mismatch
              : errors.confirmPassword
          }
          required
        >
          {(props) => (
            <Input
              {...props}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Button type="submit" className="mt-5" disabled={!canSubmit}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy.submitting}
          </>
        ) : (
          <>
            <KeyRound className="size-4" aria-hidden="true" />
            {copy.submit}
          </>
        )}
      </Button>
    </form>
  );
}
