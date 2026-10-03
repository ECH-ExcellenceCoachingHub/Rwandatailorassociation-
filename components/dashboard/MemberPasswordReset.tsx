"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  PasswordStrength,
  passwordMissingMessage,
} from "@/components/ui/password-strength";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Lets an administrator type a new password for a member.
 *
 * The password works at once and is final — the member is not made to change
 * it again at their next sign-in. Their current password stops working and
 * they are signed out everywhere, which the form says beside the save button.
 */
export function MemberPasswordReset({ memberId }: { memberId: string }) {
  const { d } = useLanguage();
  const copy = d.admin.manage;

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
    setConfirmPassword("");
    setErrors({});
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const next: Record<string, string[]> = {};
    const missing = passwordMissingMessage(password, d);
    if (missing) next.password = [missing];
    if (!confirmPassword) next.confirmPassword = [copy.passwordConfirmEmpty];
    else if (password !== confirmPassword) next.confirmPassword = [copy.passwordMismatch];
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setWorking(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // Field errors come back in English; the checks above already say the
        // same things in the reader's language.
        if (payload?.error?.details) {
          const details = payload.error.details as Record<string, string[]>;
          setErrors({
            ...(details.password && {
              password: [passwordMissingMessage(password, d) ?? copy.actionFailed],
            }),
            ...(details.confirmPassword && {
              confirmPassword: [copy.passwordMismatch],
            }),
          });
          return;
        }
        throw new Error(payload?.error?.message ?? copy.actionFailed);
      }

      close();
      setDone(true);
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

        {done && <Alert variant="success">{copy.passwordDone}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {open ? (
          <form onSubmit={save} noValidate className="space-y-3">
            <fieldset className="space-y-3" disabled={working}>
              <Field
                id="admin-new-password"
                label={copy.passwordNew}
                error={errors.password}
                required
              >
                {(props) => (
                  <div className="relative">
                    <Input
                      {...props}
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrors(({ password: _, ...rest }) => rest);
                      }}
                      autoComplete="new-password"
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? copy.passwordHide : copy.passwordShow}
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
                id="admin-confirm-password"
                label={copy.passwordConfirmNew}
                error={errors.confirmPassword}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    type={show ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrors(({ confirmPassword: _, ...rest }) => rest);
                    }}
                    autoComplete="new-password"
                  />
                )}
              </Field>

              <p className="text-xs leading-relaxed text-ink-muted">
                {copy.passwordWarning}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm">
                  {working ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="size-3.5" aria-hidden="true" />
                  )}
                  {working ? copy.passwordSaving : copy.passwordSave}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  {d.common.cancel}
                </Button>
              </div>
            </fieldset>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(true);
              setDone(false);
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
