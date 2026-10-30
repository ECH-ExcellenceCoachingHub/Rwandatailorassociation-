"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Copy, Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";

/**
 * Super-admin onboarding: a new association and its first administrator.
 *
 * On success the form is replaced by what the super admin has to hand over —
 * the administrator's sign-in and one-time temporary password, and the link
 * members register through. The password is never retrievable again, which is
 * why the result stays on screen until they choose to leave it.
 */

type FieldErrors = Record<string, string[]>;

interface CreatedAssociation {
  associationId: string;
  code: string;
  name: string;
  admin: {
    userId: string;
    phone: string;
    email: string | null;
    temporaryPassword: string;
  };
}

export function AssociationForm() {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.platform.newAssociation;

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedAssociation | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)])
    );

    try {
      const response = await fetch("/api/super-admin/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json();

      if (!response.ok) {
        setErrors(body?.error?.details ?? {});
        setFormError(body?.error?.message ?? copy.failed);
        return;
      }

      setCreated(body);
      // So the directory behind this page lists the new association.
      router.refresh();
    } catch {
      setFormError(d.common.serverUnreachable);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const slug = created.code.toLowerCase();
    const website = `${window.location.origin}/${slug}`;
    const joinLink = `${window.location.origin}/${slug}/register`;
    const signIn = created.admin.email
      ? `${created.admin.phone} · ${created.admin.email}`
      : created.admin.phone;

    return (
      <div className="space-y-5">
        <Alert variant="success" title={copy.createdTitle}>
          {fill(copy.createdBody, { name: created.name, code: created.code })}
        </Alert>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="font-heading text-base font-semibold text-ink">{copy.giveToAdmin}</h2>

          <dl className="mt-4 divide-y divide-border">
            <Detail label={copy.signInWith} value={signIn} />
            <Detail
              label={copy.temporaryPassword}
              value={created.admin.temporaryPassword}
              hint={copy.temporaryPasswordHint}
            />
            <Detail label={copy.website} value={website} hint={copy.websiteHint} />
            <Detail label={copy.joinLink} value={joinLink} hint={copy.joinLinkHint} />
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(
                    `${created.name} (${created.code})\n` +
                      `${copy.signInWith}: ${signIn}\n` +
                      `${copy.temporaryPassword}: ${created.admin.temporaryPassword}\n` +
                      `${copy.website}: ${website}\n` +
                      `${copy.joinLink}: ${joinLink}`
                  )
                  .then(() => setCopied(true));
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? d.common.copied : copy.copyDetails}
            </Button>

            <Button asChild size="sm">
              <Link href="/super-admin/associations">{copy.backToList}</Link>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreated(null);
                setCopied(false);
              }}
            >
              {copy.createAnother}
            </Button>
          </div>
        </div>

        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          {copy.passwordWarning}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Section title={copy.sectionAssociation} description={copy.sectionAssociationHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label={copy.name} required error={errors.name}>
            {(props) => <Input name="name" autoComplete="off" {...props} />}
          </Field>

          <Field id="code" label={copy.code} required error={errors.code} hint={copy.codeHint}>
            {(props) => (
              <Input
                name="code"
                autoComplete="off"
                maxLength={8}
                className="font-mono uppercase"
                {...props}
              />
            )}
          </Field>

          <Field id="legalName" label={copy.legalName} error={errors.legalName}>
            {(props) => <Input name="legalName" autoComplete="off" {...props} />}
          </Field>

          <Field id="email" label={copy.email} error={errors.email}>
            {(props) => <Input name="email" type="email" autoComplete="off" {...props} />}
          </Field>

          <Field id="phone" label={copy.phone} error={errors.phone}>
            {(props) => <Input name="phone" type="tel" autoComplete="off" {...props} />}
          </Field>

          <Field id="district" label={copy.district} error={errors.district}>
            {(props) => <Input name="district" autoComplete="off" {...props} />}
          </Field>

          <Field id="city" label={copy.city} error={errors.city}>
            {(props) => <Input name="city" autoComplete="off" {...props} />}
          </Field>
        </div>
      </Section>

      <Section title={copy.sectionAdmin} description={copy.sectionAdminHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="adminFirstName" label={copy.adminFirstName} required error={errors.adminFirstName}>
            {(props) => <Input name="adminFirstName" autoComplete="off" {...props} />}
          </Field>

          <Field id="adminLastName" label={copy.adminLastName} required error={errors.adminLastName}>
            {(props) => <Input name="adminLastName" autoComplete="off" {...props} />}
          </Field>

          <Field id="adminPhone" label={copy.adminPhone} required error={errors.adminPhone}>
            {(props) => <Input name="adminPhone" type="tel" autoComplete="off" {...props} />}
          </Field>

          <Field id="adminEmail" label={copy.adminEmail} error={errors.adminEmail}>
            {(props) => <Input name="adminEmail" type="email" autoComplete="off" {...props} />}
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy.submitting}
            </>
          ) : (
            <>
              <Building2 className="size-4" aria-hidden="true" />
              {copy.submit}
            </>
          )}
        </Button>

        <Button asChild variant="outline" type="button">
          <Link href="/super-admin/associations">{d.common.cancel}</Link>
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-lg font-semibold tracking-wide text-ink">
        {value}
      </dd>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
