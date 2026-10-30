import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, Building2, PiggyBank, Settings as SettingsIcon } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAssociationSettings, getSettings } from "@/lib/services/admin-queries";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { SettingsTable } from "@/components/dashboard/SettingsTable";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.settings.title,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const context = await requirePermission(
    PERMISSIONS.ASSOCIATION_SETTINGS,
    "/admin/settings"
  );
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.settings;

  // A super admin browsing without choosing a tenant has no single association
  // to configure; the platform screen is the right place for that.
  if (!associationId) {
    return (
      <div>
        <PageHeader title={copy.title} description={copy.descriptionPlain} />
        <Alert variant="info" title={copy.noAssociationTitle}>
          {copy.noAssociationBody}
        </Alert>
      </div>
    );
  }

  const [data, settings] = await Promise.all([
    getAssociationSettings(associationId),
    getSettings("ASSOCIATION", associationId),
  ]);

  if (!data) notFound();

  const { association, savingsRule } = data;
  const currency = association.currency;

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={fill(copy.description, { association: association.name })}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={Building2} title={copy.profile}>
          <Row label={d.common.name} value={association.name} />
          <Row label={copy.legalName} value={association.legalName ?? "—"} />
          <Row label={copy.code} value={association.code} mono />
          <Row
            label={d.common.status}
            value={<StatusBadge status={association.status} size="sm" />}
          />
          <Row label={copy.registrationNo} value={association.registrationNo ?? "—"} mono />
          <Row label={copy.taxId} value={association.taxId ?? "—"} mono />
          <Row label={copy.currency} value={association.currency} />
          <Row label={copy.timezone} value={association.timezone} />
          <Row label={copy.created} value={formatDate(association.createdAt, locale)} />
        </Panel>

        <Panel icon={SettingsIcon} title={copy.contact}>
          <Row label={d.common.email} value={association.email ?? "—"} />
          <Row label={d.common.phone} value={association.phone ?? "—"} />
          <Row label={copy.website} value={association.website ?? "—"} />
          <Row
            label={d.forms.field.address}
            value={
              [
                association.addressLine1,
                association.addressLine2,
                association.city,
                association.district,
                association.province,
                association.country,
              ]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row label={d.common.members} value={String(association._count.members)} />
          <Row label={copy.administrators} value={String(association._count.users)} />
          <Row label={copy.loanProducts} value={String(association._count.loanProducts)} />
        </Panel>

        <Panel icon={Banknote} title={copy.collectionAccount}>
          <Row label={copy.bank} value={association.bankName ?? "—"} />
          <Row label={copy.accountName} value={association.bankAccountName ?? "—"} />
          <Row
            label={copy.accountNumber}
            value={association.bankAccountNumber ?? "—"}
            mono
          />
          <Row label={copy.branchCode} value={association.bankBranchCode ?? "—"} mono />
          <Row
            label={copy.referenceSequence}
            value={String(association.memberRefSequence)}
            hint={copy.referenceSequenceHint}
          />
        </Panel>

        <Panel icon={PiggyBank} title={copy.rules}>
          {savingsRule ? (
            <>
              <Row
                label={copy.minimumDeposit}
                value={formatMoney(savingsRule.minimumDeposit, { currency })}
              />
              <Row
                label={copy.maximumDeposit}
                value={
                  savingsRule.maximumDeposit
                    ? formatMoney(savingsRule.maximumDeposit, { currency })
                    : copy.noLimit
                }
              />
              <Row
                label={copy.minimumBalance}
                value={formatMoney(savingsRule.minimumBalance, { currency })}
              />
              <Row
                label={copy.withdrawalsLabel}
                value={savingsRule.allowWithdrawals ? copy.allowed : copy.suspended}
              />
              <Row
                label={copy.approvalRequired}
                value={
                  savingsRule.withdrawalRequiresApproval ? d.common.yes : d.common.no
                }
              />
              <Row
                label={copy.withdrawalFee}
                value={
                  savingsRule.withdrawalFeeType === "PERCENTAGE"
                    ? `${savingsRule.withdrawalFeeValue}%`
                    : formatMoney(savingsRule.withdrawalFeeValue, { currency })
                }
              />
              <Row
                label={copy.noticePeriod}
                value={pluralize(copy.noticeDays, savingsRule.withdrawalNoticeDays)}
              />
              <Row
                label={copy.monthlyContribution}
                value={
                  savingsRule.monthlyContribution
                    ? `${formatMoney(savingsRule.monthlyContribution, { currency })}${
                        savingsRule.contributionDueDay
                          ? fill(copy.dueDay, {
                              day: savingsRule.contributionDueDay,
                            })
                          : ""
                      }`
                    : copy.notEnforced
                }
              />
              <Row
                label={copy.annualInterest}
                value={`${savingsRule.annualInterestRate}%`}
              />
            </>
          ) : (
            <p className="py-3 text-sm text-ink-muted">{copy.noRule}</p>
          )}
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.storedConfiguration}
        </h2>
        <SettingsTable settings={settings} emptyMessage={copy.noStoredSettings} />
      </section>

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.readOnlyNote}
      </p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
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
  hint,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-ink-muted/80">{hint}</span>}
      </dt>
      <dd
        className={`text-right text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
