import type { Metadata } from "next";
import { Building2, Info, Smartphone } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/alert";
import { PaymentReferenceCard } from "@/components/dashboard/PaymentReferenceCard";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.member.deposit.title,
  };
}

export const dynamic = "force-dynamic";

/**
 * Deposit instructions.
 *
 * NOTE ON SCOPE: this page tells a member how to pay; it does not initiate a
 * payment. That is deliberate. The platform is a receiver of funds — it reads
 * the association's bank statement and credits members. Letting the app push
 * payments would mean holding credentials that can move money out, for no gain
 * a member cannot get from their own mobile money menu.
 *
 * Everything here therefore centres on the payment reference, because a
 * payment quoting it is credited automatically and one without it waits in an
 * administrator's queue.
 */
export default async function DepositPage() {
  const context = await requireMember("/dashboard/savings/deposit");
  const { d } = await getDashboardCopy();
  const copy = d.member.deposit;

  const [association, rule] = await Promise.all([
    prisma.association.findUniqueOrThrow({
      where: { id: context.user.associationId! },
      select: {
        name: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankBranchCode: true,
        phone: true,
      },
    }),
    prisma.savingsRule.findUnique({
      where: { associationId: context.user.associationId! },
      select: { minimumDeposit: true, monthlyContribution: true, contributionDueDay: true },
    }),
  ]);

  const reference = context.member!.paymentReference;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <PaymentReferenceCard reference={reference} />

      <Alert variant="warning" title={copy.alwaysQuoteTitle}>
        <strong>{reference}</strong> {copy.alwaysQuoteBody}
      </Alert>

      {association.bankAccountNumber ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            {copy.bankTransfer}
          </h2>

          <dl className="mt-4 divide-y divide-border">
            <Row label={copy.bank} value={association.bankName ?? "—"} />
            <Row
              label={copy.accountName}
              value={association.bankAccountName ?? association.name}
            />
            <Row
              label={copy.accountNumber}
              value={association.bankAccountNumber}
              mono
            />
            {association.bankBranchCode && (
              <Row label={copy.branchCode} value={association.bankBranchCode} mono />
            )}
            <Row label={copy.referenceToQuote} value={reference} mono highlight />
          </dl>
        </section>
      ) : (
        <Alert variant="info">
          {copy.noAccountPublished}
          {association.phone
            ? ` ${fill(copy.noAccountPhone, { phone: association.phone })}`
            : ""}{" "}
          {copy.noAccountQuote} <strong>{reference}</strong>.
        </Alert>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
          <Smartphone className="size-4 text-primary" aria-hidden="true" />
          {copy.mobileMoney}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          <strong className="text-ink">{reference}</strong> {copy.mobileMoneyBody}
        </p>
      </section>

      {rule && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
            <Info className="size-4 text-primary" aria-hidden="true" />
            {copy.contributionRules}
          </h2>

          <dl className="mt-4 divide-y divide-border">
            <Row
              label={copy.minimumDeposit}
              value={formatMoney(rule.minimumDeposit.toFixed(2))}
            />
            {rule.monthlyContribution && (
              <Row
                label={copy.monthlyContribution}
                value={formatMoney(rule.monthlyContribution.toFixed(2))}
              />
            )}
            {rule.contributionDueDay && (
              <Row
                label={copy.dueEachMonth}
                value={fill(copy.day, { day: rule.contributionDueDay })}
              />
            )}
          </dl>
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        className={`text-sm font-semibold ${mono ? "font-mono" : ""} ${
          highlight ? "text-primary" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
