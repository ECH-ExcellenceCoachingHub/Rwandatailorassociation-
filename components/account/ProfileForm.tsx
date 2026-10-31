"use client";

import { useState, type FormEvent } from "react";

import Link from "@/components/SiteLink";
import { Loader2, Save } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { RwandaLocationFields } from "@/components/ui/rwanda-location-fields";
import { useLanguage } from "@/components/LanguageProvider";
import {
  canonicalDistrict,
  canonicalProvince,
  provinceForDistrict,
} from "@/lib/rwanda";
import type { OwnProfileForEdit } from "@/lib/services/profile";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * A person editing their own details.
 *
 * NOT `MemberForm`, though it asks several of the same questions. That form is
 * an administrator transcribing somebody else's paper application: it opens
 * with "the member's first name", it carries an audit note addressed to
 * whoever reads the log, and it offers every field of the file including the
 * ones only an administrator may decide. Reusing it here would have meant
 * threading a "who is looking" flag through every label and section, and the
 * first field added for one audience would have appeared for the other.
 *
 * The two halves of this form are decided by `profile.hasMemberRecord`. Staff
 * who do not save with the association see the contact section and nothing
 * else — not because the rest is forbidden, but because they have no member
 * file for it to be stored in. The route validates against the matching schema
 * for exactly the same reason.
 */

interface FieldErrors {
  [field: string]: string[] | undefined;
}

export function ProfileForm({
  profile,
  /** Where "cancel" and a successful save return to. */
  returnTo,
}: {
  profile: OwnProfileForEdit;
  returnTo: string;
}) {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.account.edit;
  const field = d.forms.field;

  const genders = [
    { value: "", label: d.common.notRecorded },
    { value: "MALE", label: d.forms.gender.male },
    { value: "FEMALE", label: d.forms.gender.female },
    { value: "OTHER", label: d.forms.gender.other },
    { value: "UNDISCLOSED", label: d.forms.gender.undisclosed },
  ];

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The one pair this form has to hold in React: province and district are
  // linked, so each depends on the other's current value. Everything else is
  // uncontrolled and read from FormData on submit.
  //
  // An older file may carry a district with no province — it was free text
  // once. The district settles the question, so the province is filled in from
  // it rather than shown blank for the member to answer again. Both are
  // canonicalised on the way in: a value the dropdown does not recognise has
  // no option to show as selected and would read as empty.
  const [location, setLocation] = useState(() => ({
    province:
      canonicalProvince(profile.province) ??
      provinceForDistrict(profile.district) ??
      "",
    district: canonicalDistrict(profile.district) ?? "",
  }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)])
    );

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json();

      if (!response.ok) {
        setErrors(body?.error?.details ?? {});
        setFormError(body?.error?.message ?? copy.failed);
        return;
      }

      // Saying "saved" over an unchanged record is a small lie that makes
      // people doubt the ones that did save.
      setNotice(body?.changed ? copy.saved : copy.nothingChanged);

      // The header greeting, the sidebar and the profile page all read details
      // this form has just rewritten.
      router.refresh();
    } catch {
      setFormError(d.common.serverUnreachable);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && <Alert variant="error">{formError}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Section title={copy.contactSection} description={copy.contactHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label={field.firstName} required error={errors.firstName}>
            {(props) => (
              <Input
                name="firstName"
                defaultValue={profile.firstName}
                autoComplete="given-name"
                {...props}
              />
            )}
          </Field>

          <Field id="lastName" label={field.lastName} required error={errors.lastName}>
            {(props) => (
              <Input
                name="lastName"
                defaultValue={profile.lastName}
                autoComplete="family-name"
                {...props}
              />
            )}
          </Field>

          <Field id="phone" label={field.phone} required error={errors.phone}>
            {(props) => (
              <Input
                name="phone"
                defaultValue={profile.phone}
                placeholder={d.forms.placeholder.phone}
                autoComplete="tel"
                inputMode="tel"
                {...props}
              />
            )}
          </Field>

          <Field
            id="email"
            label={field.email}
            error={errors.email}
            hint={d.forms.hint.emailOptional}
          >
            {(props) => (
              <Input
                name="email"
                type="email"
                defaultValue={profile.email}
                autoComplete="email"
                {...props}
              />
            )}
          </Field>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          {copy.verificationWarning}
        </p>
      </Section>

      {profile.hasMemberRecord && (
        <>
          <Section title={copy.personalSection} description={copy.personalHint}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="nationalId"
                label={field.nationalId}
                error={errors.nationalId}
                hint={profile.nationalIdLocked ? copy.nationalIdLocked : undefined}
              >
                {(props) => (
                  <Input
                    name="nationalId"
                    defaultValue={profile.nationalId}
                    inputMode="numeric"
                    maxLength={16}
                    // Cosmetic only. The server refuses to change a verified ID
                    // whatever arrives — see lib/services/profile.ts. A disabled
                    // input submits nothing, so this is readOnly: the field has
                    // to keep sending its current value or the save would read
                    // as an attempt to clear it.
                    readOnly={profile.nationalIdLocked}
                    className={
                      profile.nationalIdLocked ? "bg-ink/[0.04] text-ink-muted" : undefined
                    }
                    {...props}
                  />
                )}
              </Field>

              <Field id="dateOfBirth" label={field.dateOfBirth} error={errors.dateOfBirth}>
                {(props) => (
                  <Input
                    name="dateOfBirth"
                    type="date"
                    defaultValue={profile.dateOfBirth}
                    {...props}
                  />
                )}
              </Field>

              <Field id="gender" label={field.gender} error={errors.gender}>
                {(props) => (
                  <NativeSelect name="gender" defaultValue={profile.gender} {...props}>
                    {genders.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
          </Section>

          <Section title={copy.livelihoodSection}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="occupation" label={field.occupation} error={errors.occupation}>
                {(props) => (
                  <Input
                    name="occupation"
                    defaultValue={profile.occupation}
                    placeholder={d.forms.placeholder.occupation}
                    {...props}
                  />
                )}
              </Field>

              <Field
                id="businessName"
                label={field.businessName}
                error={errors.businessName}
              >
                {(props) => (
                  <Input
                    name="businessName"
                    defaultValue={profile.businessName}
                    {...props}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section title={copy.addressSection}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="addressLine1"
                label={field.address}
                error={errors.addressLine1}
                className="sm:col-span-2"
              >
                {(props) => (
                  <Input
                    name="addressLine1"
                    defaultValue={profile.addressLine1}
                    autoComplete="street-address"
                    {...props}
                  />
                )}
              </Field>

              {/* Rwanda's five provinces and thirty districts, from the same
                  fixed list the admin form uses, so a member correcting their
                  own district does not undo the canonical spelling. */}
              <RwandaLocationFields
                province={location.province}
                district={location.district}
                onChange={setLocation}
                errors={{ province: errors.province, district: errors.district }}
                withHiddenInputs
              />

              <Field id="city" label={field.city} error={errors.city}>
                {(props) => (
                  <Input
                    name="city"
                    defaultValue={profile.city}
                    placeholder={d.forms.placeholder.city}
                    {...props}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section title={copy.payoutSection} description={copy.payoutHint}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="mobileMoneyNumber"
                label={field.mobileMoneyNumber}
                error={errors.mobileMoneyNumber}
                hint={d.forms.hint.mobileMoney}
              >
                {(props) => (
                  <Input
                    name="mobileMoneyNumber"
                    defaultValue={profile.mobileMoneyNumber}
                    placeholder={d.forms.placeholder.phone}
                    inputMode="tel"
                    {...props}
                  />
                )}
              </Field>

              <Field
                id="bankAccountNumber"
                label={field.bankAccountNumber}
                error={errors.bankAccountNumber}
              >
                {(props) => (
                  <Input
                    name="bankAccountNumber"
                    defaultValue={profile.bankAccountNumber}
                    {...props}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section title={copy.nextOfKinSection}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="nextOfKinName"
                label={copy.nextOfKinName}
                error={errors.nextOfKinName}
              >
                {(props) => (
                  <Input
                    name="nextOfKinName"
                    defaultValue={profile.nextOfKinName}
                    {...props}
                  />
                )}
              </Field>

              <Field
                id="nextOfKinPhone"
                label={copy.nextOfKinPhone}
                error={errors.nextOfKinPhone}
              >
                {(props) => (
                  <Input
                    name="nextOfKinPhone"
                    defaultValue={profile.nextOfKinPhone}
                    placeholder={d.forms.placeholder.phone}
                    inputMode="tel"
                    {...props}
                  />
                )}
              </Field>

              <Field
                id="nextOfKinRelation"
                label={copy.nextOfKinRelation}
                error={errors.nextOfKinRelation}
              >
                {(props) => (
                  <Input
                    name="nextOfKinRelation"
                    defaultValue={profile.nextOfKinRelation}
                    placeholder={d.forms.placeholder.relation}
                    {...props}
                  />
                )}
              </Field>
            </div>
          </Section>

          {/* The same warning the admin edit form carries, for the same
              reason: these numbers decide where arriving money is attributed,
              and a payment matched to a mobile money number is credited
              without anyone looking at it. */}
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            {copy.matchingWarning}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy.saving}
            </>
          ) : (
            <>
              <Save className="size-4" aria-hidden="true" />
              {copy.save}
            </>
          )}
        </Button>

        <Button asChild variant="outline" type="button">
          <Link href={returnTo}>{copy.cancel}</Link>
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
