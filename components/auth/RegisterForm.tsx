"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PhotoField } from "@/components/ui/photo-field";
import { RwandaLocationFields } from "@/components/ui/rwanda-location-fields";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, split } from "@/lib/i18n/fill";
import { add, formatMoney, multiply } from "@/lib/money";
import { assessPasswordStrength } from "@/lib/auth/password.shared";
import { isValidRwandanPhone } from "@/lib/phone";
import {
  MAX_APPLICATION_SHARES,
  MAX_INTERN_CAPACITY,
} from "@/lib/application-limits";

/**
 * Membership application form.
 *
 * Replaces the Google Form iframe that previously sat on this page.
 * Applications now land directly in the association's database, which is what
 * lets an administrator review them, and what gives each applicant a payment
 * reference — the key every incoming payment is matched on.
 *
 * Fully bilingual, including the validation messages. This is the first screen
 * a prospective member ever sees, and many tailors read Kinyarwanda far more
 * comfortably than English; a form that asks in Kinyarwanda and then rejects
 * the answer in English would lose them at the last step.
 */

interface SuccessState {
  memberNumber: string;
  paymentReference: string;
}

const INITIAL = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  nationalId: "",
  province: "",
  district: "",
  sharesSubscribed: "",
  hasCompany: "",
  acceptsInterns: "",
  internCapacity: "",
  successorName: "",
  successorPhone: "",
  successorRelation: "",
  successorNationalId: "",
  hasProfessionalCertificate: "",
  // Both photographs are held here as `data:` URLs and submitted with the
  // rest of the form. See components/ui/photo-field.tsx for why they are not
  // uploaded as they are chosen.
  photo: "",
  successorPhoto: "",
  password: "",
  confirmPassword: "",
};

const SHARE_OPTIONS = Array.from({ length: MAX_APPLICATION_SHARES }, (_, i) => i + 1);

export default function RegisterForm({
  sharePrice,
  dailyFee,
}: {
  /// The rulebook's daily saving — the price of one share, per day.
  sharePrice: string;
  /// The platform's service fee, per share per day.
  dailyFee: string;
}) {
  const { d } = useLanguage();
  const copy = d.forms.register;
  const field = d.forms.field;
  const app = d.forms.application;

  const [values, setValues] = useState(INITIAL);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Both photographs are optional, and a camera button on the form reads as
  // "you cannot go on without this". So each field stays hidden behind a link
  // until the applicant asks for it.
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSuccessorPhoto, setShowSuccessorPhoto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [copied, setCopied] = useState(false);

  // What the chosen shares cost each day, shown beside the choice so nobody
  // commits to a figure they first discover on their statement. The saving and
  // the service fee are quoted as one amount: an applicant is deciding what
  // leaves their pocket daily, and how the association splits it afterwards is
  // not a sum they should have to do here.
  const perShareDaily = add(sharePrice, dailyFee);
  const shareCount = Number(values.sharesSubscribed) || 0;
  const sharesHint =
    shareCount > 0
      ? fill(app.sharesTotal, {
          total: formatMoney(multiply(perShareDaily, shareCount)),
        })
      : fill(app.sharesHintRegister, {
          price: formatMoney(perShareDaily),
          max: MAX_APPLICATION_SHARES,
        });

  function update(name: keyof typeof INITIAL, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string[]> = {};

    if (values.firstName.trim().length < 2) next.firstName = [copy.error.firstName];
    if (values.lastName.trim().length < 2) next.lastName = [copy.error.lastName];
    // Only checked when one was given. The phone number is the identifier
    // this form insists on; an email is a second way in for those who have one.
    if (
      values.email.trim() &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())
    ) {
      next.email = [copy.error.email];
    }
    if (!isValidRwandanPhone(values.phone)) {
      next.phone = [copy.error.phone];
    }
    if (values.nationalId && !/^\d{16}$/.test(values.nationalId.trim())) {
      next.nationalId = [copy.error.nationalId];
    }
    if (!values.sharesSubscribed) {
      next.sharesSubscribed = [fill(app.sharesError, { max: MAX_APPLICATION_SHARES })];
    }
    if (!values.hasCompany) {
      next.hasCompany = [app.hasCompanyError];
    }
    if (!values.hasProfessionalCertificate) {
      next.hasProfessionalCertificate = [app.certificateError];
    }
    // Neither photograph is checked: both are optional, so an applicant with
    // no usable picture to hand can still send the application.
    //
    // A successor recorded by name alone is one nobody can act on: the
    // warehouse counter settles who is who on the number. Naming one is
    // optional; naming one without their ID is not.
    if (
      values.successorName.trim() &&
      !/^\d{16}$/.test(values.successorNationalId.trim())
    ) {
      next.successorNationalId = [copy.error.successorNationalId];
    }
    // The interns questions only appear beside a company, so only then can
    // they be left unanswered.
    if (values.hasCompany === "YES" && !values.acceptsInterns) {
      next.acceptsInterns = [app.acceptsInternsError];
    }
    if (values.hasCompany === "YES" && values.acceptsInterns === "YES") {
      const capacity = Number(values.internCapacity);
      if (
        !values.internCapacity.trim() ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > MAX_INTERN_CAPACITY
      ) {
        next.internCapacity = [
          fill(app.internCapacityError, { max: MAX_INTERN_CAPACITY }),
        ];
      }
    }
    if (values.successorPhone && !isValidRwandanPhone(values.successorPhone)) {
      next.successorPhone = [copy.error.phone];
    }

    // The strength assessment reports its own reasons, which are English-only
    // because they are shared with the server. The translated line stands in
    // for them rather than beside them, so the message is never half a
    // language behind.
    const strength = assessPasswordStrength(values.password);
    if (!strength.acceptable) {
      next.password = [copy.error.password];
    }
    if (values.password !== values.confirmPassword) {
      next.confirmPassword = [copy.error.confirmPassword];
    }
    if (!acceptedTerms) {
      next.acceptedTerms = [copy.error.terms];
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, acceptedTerms }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.details) setErrors(payload.error.details);
        setFormError(payload?.error?.message ?? copy.failed);
        setSubmitting(false);
        return;
      }

      setSuccess(payload as SuccessState);
    } catch {
      setFormError(d.common.serverUnreachable);
      setSubmitting(false);
    }
  }

  if (success) {
    const [keepBefore, keepAfter] = split(copy.keepReferenceBody, "reference");

    return (
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-card sm:p-10">
          <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </span>

          <h3 className="mt-6 font-heading text-2xl font-bold text-ink">
            {copy.successTitle}
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            {copy.successBody}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {copy.membershipNumber}
              </dt>
              <dd className="mt-1.5 font-heading text-lg font-bold text-ink">
                {success.memberNumber}
              </dd>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wider text-primary-hover">
                {copy.paymentReference}
              </dt>
              <dd className="mt-1.5 flex items-center gap-2">
                <span className="font-heading text-lg font-bold text-primary-hover">
                  {success.paymentReference}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(success.paymentReference);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
                  aria-label={copy.copyReference}
                >
                  {copied ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </button>
              </dd>
            </div>
          </dl>

          {/*
            The single most important instruction on this page. A payment that
            arrives without this reference cannot be attributed automatically
            and waits in an administrator's unmatched queue.
          */}
          <Alert variant="info" className="mt-6">
            <strong className="font-semibold">{copy.keepReferenceTitle}</strong>{" "}
            {keepBefore}
            <strong>{success.paymentReference}</strong>
            {keepAfter}
          </Alert>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href="/login">{copy.goToSignIn}</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/">{copy.backHome}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8"
    >
      {formError && (
        <Alert variant="error" className="mb-6">
          {formError}
        </Alert>
      )}

      <fieldset className="space-y-5" disabled={submitting}>
        <legend className="sr-only">{copy.legend}</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="firstName" label={field.firstName} error={errors.firstName} required>
            {(props) => (
              <Input
                {...props}
                value={values.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                autoComplete="given-name"
                placeholder={d.forms.placeholder.firstName}
              />
            )}
          </Field>

          <Field id="lastName" label={field.lastName} error={errors.lastName} required>
            {(props) => (
              <Input
                {...props}
                value={values.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                autoComplete="family-name"
                placeholder={d.forms.placeholder.lastName}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="email"
            label={field.email}
            error={errors.email}
            hint={d.forms.hint.emailOptionalRegister}
          >
            {(props) => (
              <Input
                {...props}
                type="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                autoComplete="email"
                placeholder={d.forms.placeholder.email}
              />
            )}
          </Field>

          <Field
            id="phone"
            label={field.phone}
            error={errors.phone}
            hint={d.forms.hint.phoneRegister}
            required
          >
            {(props) => (
              <Input
                {...props}
                type="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                autoComplete="tel"
                placeholder={d.forms.placeholder.phone}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="nationalId"
            label={field.nationalId}
            error={errors.nationalId}
            hint={d.forms.hint.nationalIdRegister}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={values.nationalId}
                onChange={(e) => update("nationalId", e.target.value)}
                placeholder={d.forms.placeholder.nationalId}
                maxLength={16}
              />
            )}
          </Field>
        </div>

        {/*
          Chosen from a list rather than typed, so the association's district
          breakdowns actually add up. Picking a district fills in its province.
        */}
        <div className="grid gap-5 sm:grid-cols-2">
          <RwandaLocationFields
            province={values.province}
            district={values.district}
            onChange={({ province, district }) =>
              setValues((prev) => ({ ...prev, province, district }))
            }
            errors={{ province: errors.province, district: errors.district }}
            districtHint={d.forms.hint.districtRegister}
          />
        </div>

        {showPhoto ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <PhotoField
              id="photo"
              label={app.photo}
              hint={app.photoHintRegister}
              error={errors.photo}
              value={values.photo}
              onChange={(dataUrl) => update("photo", dataUrl)}
            />
          </div>
        ) : (
          <RevealPhotoLink label={app.photoReveal} onClick={() => setShowPhoto(true)} />
        )}

        <hr className="border-border" />

        {/*
          The association's own questions. Shares, the certificate and the
          interns answer are required, because the applicant is here to give
          them; the successor may not be to hand, and an administrator can add
          them at approval.
        */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="sharesSubscribed"
            label={app.shares}
            error={errors.sharesSubscribed}
            hint={sharesHint}
            // What a share costs every day is the commitment being made here,
            // so it reads as a callout rather than small print.
            hintClassName="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-relaxed text-emerald-700"
            required
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={values.sharesSubscribed}
                onChange={(e) => update("sharesSubscribed", e.target.value)}
              >
                <option value="">{app.choose}</option>
                {SHARE_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {fill(app.sharesOption, {
                      count,
                      total: formatMoney(multiply(perShareDaily, count)),
                    })}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="hasCompany"
            label={app.hasCompanyQuestion}
            error={errors.hasCompany}
            required
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={values.hasCompany}
                onChange={(e) => {
                  update("hasCompany", e.target.value);
                  // Answers left behind a "no" would still be sent, and
                  // refused, for questions no longer on screen.
                  if (e.target.value !== "YES") {
                    update("acceptsInterns", "");
                    update("internCapacity", "");
                  }
                }}
              >
                <option value="">{app.choose}</option>
                <option value="YES">{d.common.yes}</option>
                <option value="NO">{d.common.no}</option>
              </NativeSelect>
            )}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="hasProfessionalCertificate"
            label={app.certificateQuestion}
            hint={app.certificateHint}
            error={errors.hasProfessionalCertificate}
            required
          >
            {(props) => (
              <NativeSelect
                {...props}
                value={values.hasProfessionalCertificate}
                onChange={(e) => update("hasProfessionalCertificate", e.target.value)}
              >
                <option value="">{app.choose}</option>
                <option value="YES">{d.common.yes}</option>
                <option value="NO">{d.common.no}</option>
              </NativeSelect>
            )}
          </Field>
        </div>

        {/* Interns are only asked of someone with a company to host them in. */}
        {values.hasCompany === "YES" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="acceptsInterns"
              label={app.acceptsInternsQuestion}
              error={errors.acceptsInterns}
              required
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  value={values.acceptsInterns}
                  onChange={(e) => {
                    update("acceptsInterns", e.target.value);
                    if (e.target.value !== "YES") update("internCapacity", "");
                  }}
                >
                  <option value="">{app.choose}</option>
                  <option value="YES">{d.common.yes}</option>
                  <option value="NO">{d.common.no}</option>
                </NativeSelect>
              )}
            </Field>

            {values.acceptsInterns === "YES" && (
              <Field
                id="internCapacity"
                label={app.internCapacityQuestion}
                error={errors.internCapacity}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_INTERN_CAPACITY}
                    value={values.internCapacity}
                    onChange={(e) => update("internCapacity", e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
        )}

        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold text-ink">
            {app.successor}
          </h3>
          <p className="text-sm leading-relaxed text-ink-muted">
            {app.successorHintRegister}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="successorName" label={app.successorName} error={errors.successorName}>
            {(props) => (
              <Input
                {...props}
                value={values.successorName}
                onChange={(e) => update("successorName", e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>

          <Field id="successorPhone" label={app.successorPhone} error={errors.successorPhone}>
            {(props) => (
              <Input
                {...props}
                type="tel"
                value={values.successorPhone}
                onChange={(e) => update("successorPhone", e.target.value)}
                autoComplete="off"
                placeholder={d.forms.placeholder.phone}
              />
            )}
          </Field>

          <Field
            id="successorNationalId"
            label={app.successorNationalId}
            error={errors.successorNationalId}
            required={Boolean(values.successorName.trim())}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={values.successorNationalId}
                onChange={(e) => update("successorNationalId", e.target.value)}
                autoComplete="off"
                placeholder={d.forms.placeholder.nationalId}
              />
            )}
          </Field>

          <Field
            id="successorRelation"
            label={app.successorRelation}
            error={errors.successorRelation}
          >
            {(props) => (
              <Input
                {...props}
                value={values.successorRelation}
                onChange={(e) => update("successorRelation", e.target.value)}
                placeholder={d.forms.placeholder.relation}
              />
            )}
          </Field>

          {showSuccessorPhoto && (
            <PhotoField
              id="successorPhoto"
              label={app.successorPhoto}
              hint={app.successorPhotoHint}
              error={errors.successorPhoto}
              value={values.successorPhoto}
              onChange={(dataUrl) => update("successorPhoto", dataUrl)}
            />
          )}
        </div>

        {!showSuccessorPhoto && (
          <RevealPhotoLink
            label={app.successorPhotoReveal}
            onClick={() => setShowSuccessorPhoto(true)}
          />
        )}

        <hr className="border-border" />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="password" label={field.password} error={errors.password} required>
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={(e) => update("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={d.forms.placeholder.password}
                  className="pr-12"
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

          <Field
            id="confirmPassword"
            label={field.confirmPassword}
            error={errors.confirmPassword}
            required
          >
            {(props) => (
              <Input
                {...props}
                type={showPassword ? "text" : "password"}
                value={values.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                autoComplete="new-password"
                placeholder={d.forms.placeholder.confirmPassword}
              />
            )}
          </Field>
        </div>

        {values.password && <PasswordStrength password={values.password} />}

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.acceptedTerms;
                  return next;
                });
              }}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--color-primary)]"
            />
            <span className="text-sm leading-relaxed text-ink-muted">
              {copy.terms}
            </span>
          </label>

          {errors.acceptedTerms && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {errors.acceptedTerms[0]}
            </p>
          )}
        </div>
      </fieldset>

      <Button type="submit" size="lg" className="mt-8 w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy.submitting}
          </>
        ) : (
          <>
            <UserPlus className="size-4" aria-hidden="true" />
            {copy.submit}
          </>
        )}
      </Button>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {copy.alreadyMember}{" "}
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {copy.signIn}
        </Link>
      </p>
    </form>
  );
}

/** The link that stands in for a hidden photograph field until it is wanted. */
function RevealPhotoLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
    >
      <Camera className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
