"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";
import { safeRedirectPath } from "@/lib/safe-redirect";

interface LoginResponse {
  role: "MEMBER" | "ADMIN" | "SUPER_ADMIN";
  mustChangePassword: boolean;
  redirectTo: string;
}

/**
 * The sign-in form. Phone number first — it is what every member has — with
 * email one tap away for those who registered with it.
 *
 * With `presetPhone` (the admin-shared link at /in/:token) the number is
 * filled in and not shown, and everything but the password is left out, so
 * the member has exactly one thing to do.
 */
export default function LoginForm({ presetPhone }: { presetPhone?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { d } = useLanguage();
  const copy = d.auth.login;

  const minimal = presetPhone !== undefined;
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [identifier, setIdentifier] = useState(presetPhone ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? copy.failed);
        setSubmitting(false);
        return;
      }

      const data = payload as LoginResponse;

      // The `next` parameter is attacker-controllable, so it is validated to be
      // a same-site path before use. Without that check, a crafted login link
      // would bounce a freshly authenticated user to an external site.
      const requested = safeRedirectPath(searchParams.get("next"));
      const destination = data.mustChangePassword
        ? data.redirectTo
        : (requested ?? data.redirectTo);

      // refresh() so server components re-render with the new session cookie.
      router.replace(destination);
      router.refresh();
    } catch {
      setError(d.common.serverUnreachable);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : (
        searchParams.get("expired") && (
          <Alert variant="info">{copy.sessionExpired}</Alert>
        )
      )}

      {minimal ? (
        // The number came from the link, so it is not shown. It stays in the
        // form, out of sight, so a password manager can still pair it with
        // the password it saves.
        <input
          type="text"
          name="identifier"
          autoComplete="username"
          value={identifier}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      ) : (
        <Field id="identifier" label={mode === "phone" ? copy.phone : copy.email}>
          {(props) => (
            <Input
              {...props}
              name="identifier"
              type={mode === "phone" ? "tel" : "email"}
              inputMode={mode === "phone" ? "tel" : "email"}
              autoComplete="username"
              placeholder={mode === "phone" ? copy.phonePlaceholder : copy.emailPlaceholder}
              value={identifier}
              onChange={(e) => {
                const value = e.target.value;
                setIdentifier(value);
                // A password manager fills whatever it saved — often an email —
                // into this field. Follow it rather than show an email under a
                // "Phone number" label.
                if (mode === "phone" && value.includes("@")) setMode("email");
              }}
              required
              autoFocus
            />
          )}
        </Field>
      )}

      {!minimal && (
        <div className="-mt-2">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "phone" ? "email" : "phone"));
              setIdentifier("");
              setError(null);
            }}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {mode === "phone" ? copy.useEmail : copy.usePhone}
          </button>
        </div>
      )}

      <Field id="password" label={copy.password}>
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder={copy.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
              required
              autoFocus={minimal}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              className="absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </Field>

      {!minimal && (
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.forgotPassword}
          </Link>
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy.submitting}
          </>
        ) : (
          <>
            <LogIn className="size-4" aria-hidden="true" />
            {copy.submit}
          </>
        )}
      </Button>
    </form>
  );
}
