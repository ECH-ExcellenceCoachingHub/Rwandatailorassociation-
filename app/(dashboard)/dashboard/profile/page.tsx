import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck, UserPen, UserRound } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getMemberSelfProfile } from "@/lib/services/member-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { provinceLabel } from "@/lib/rwanda";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.member.profile.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function MemberProfilePage() {
  const context = await requireMember("/dashboard/profile");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.profile;
  const field = d.forms.field;

  const profile = await getMemberSelfProfile(context.member!.id);

  // The guard guarantees a member record exists; a miss here means it was
  // deleted between the session check and this query.
  if (!profile) notFound();

  const contactIncomplete = !profile.user.email || !profile.user.phone;
  const date = (value: Date | null | undefined) => formatDate(value, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/account/profile">
                <UserPen className="size-3.5" aria-hidden="true" />
                {d.account.edit.editProfile}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/account/password">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {copy.changePassword}
              </Link>
            </Button>
          </div>
        }
      />

      {contactIncomplete && (
        <Alert variant="warning" title={copy.incompleteTitle}>
          {copy.incompleteBody}{" "}
          <Link href="/account/profile" className="font-semibold underline">
            {d.account.edit.editProfile}
          </Link>
        </Alert>
      )}

      {/* Payment reference first — it is the single most consequential thing on
          this page, because a payment made without it may not be credited. */}
      <section className="rounded-2xl border border-primary/25 bg-primary-50 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-primary-hover">
          {copy.yourReference}
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-ink">
          {profile.paymentReference}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {copy.yourReferenceBody}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={UserRound} title={copy.membership}>
          <Row
            label={d.common.fullName}
            value={`${profile.user.firstName} ${profile.user.lastName}`.trim()}
          />
          <Row label={copy.memberNumber} value={profile.memberNumber} mono />
          <Row
            label={d.common.status}
            value={<StatusBadge status={profile.status} size="sm" />}
          />
          <Row
            label={copy.identityCheck}
            value={<StatusBadge status={profile.kycStatus} size="sm" />}
          />
          <Row label={copy.association} value={profile.association.name} />
          <Row label={copy.joined} value={date(profile.joinedAt ?? profile.createdAt)} />
          <Row label={copy.approvedOn} value={date(profile.approvedAt)} />
        </Panel>

        <Panel icon={ShieldCheck} title={copy.contactSecurity}>
          <Row label={d.common.email} value={profile.user.email ?? "—"} />
          <Row
            label={copy.emailVerified}
            value={profile.user.emailVerifiedAt ? d.common.yes : copy.notVerified}
          />
          <Row label={d.common.phone} value={profile.user.phone ?? "—"} />
          <Row
            label={copy.phoneVerified}
            value={profile.user.phoneVerifiedAt ? d.common.yes : copy.notVerified}
          />
          <Row
            label={copy.twoFactor}
            value={profile.user.twoFactorEnabled ? copy.enabled : copy.disabled}
          />
          <Row
            label={copy.passwordChanged}
            value={date(profile.user.passwordChangedAt)}
          />
          <Row label={copy.lastSignIn} value={date(profile.user.lastLoginAt)} />
        </Panel>

        <Panel icon={UserRound} title={copy.personalDetails}>
          <Row label={field.nationalId} value={profile.nationalId ?? "—"} mono />
          <Row label={field.dateOfBirth} value={date(profile.dateOfBirth)} />
          <Row
            label={field.gender}
            value={profile.gender ? translateGender(profile.gender, d) : "—"}
          />
          <Row label={field.occupation} value={profile.occupation ?? "—"} />
          <Row label={copy.business} value={profile.businessName ?? "—"} />
          <Row label={field.district} value={profile.district ?? "—"} />
          <Row label={field.province} value={provinceLabel(profile.province, locale) || "—"} />
          <Row
            label={field.address}
            value={
              [profile.addressLine1, profile.city].filter(Boolean).join(", ") || "—"
            }
          />
        </Panel>

        <Panel icon={ShieldCheck} title={copy.payoutKin}>
          <Row label={copy.mobileMoney} value={profile.mobileMoneyNumber ?? "—"} mono />
          <Row label={copy.bankAccount} value={profile.bankAccountNumber ?? "—"} mono />
          <Row label={copy.nextOfKin} value={profile.nextOfKinName ?? "—"} />
          <Row label={copy.theirPhone} value={profile.nextOfKinPhone ?? "—"} />
          <Row label={copy.relationship} value={profile.nextOfKinRelation ?? "—"} />
        </Panel>
      </div>

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.maintainedNote}{" "}
        {profile.association.email ? (
          <a
            href={`mailto:${profile.association.email}`}
            className="font-semibold text-primary hover:underline"
          >
            {profile.association.email}
          </a>
        ) : (
          copy.anAdministrator
        )}
        {profile.association.phone
          ? ` ${fill(copy.orCall, { phone: profile.association.phone })}`
          : ""}
        .
      </p>
    </div>
  );
}

/** The stored enum, in the reader's language. */
function translateGender(
  gender: string,
  d: Awaited<ReturnType<typeof getDashboardCopy>>["d"]
): string {
  switch (gender) {
    case "MALE":
      return d.forms.gender.male;
    case "FEMALE":
      return d.forms.gender.female;
    case "OTHER":
      return d.forms.gender.other;
    case "UNDISCLOSED":
      return d.forms.gender.undisclosed;
    default:
      return gender;
  }
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {title}
      </h2>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        className={`text-right text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
