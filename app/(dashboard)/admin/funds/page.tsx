import type { Metadata } from "next";
import { Coins, HandCoins, PiggyBank, Scale, TriangleAlert } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getFundSeparation } from "@/lib/services/funds";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { RemitFeesButton } from "@/components/dashboard/RemitFeesButton";
import { FundsFlowChart } from "@/components/dashboard/charts/SavingsChart";
import { Alert } from "@/components/ui/alert";

/**
 * WHOSE MONEY IS WHOSE.
 *
 * Four panels, never a total. The association holds members' savings, the
 * platform's service fee, its own earned income, and has already paid out the
 * borrowers' half of the loan interest — and those are four different things
 * with four different owners.
 *
 * THE PAGE IS LAID OUT AS AN ARGUMENT, top to bottom: what is owed to members,
 * what is owed to the operator, what the association has actually earned, and
 * what it has already given back. An officer who reads only the four headline
 * figures should still come away knowing which one they may spend.
 *
 * The closing note says explicitly that the figures are not added up. Somebody
 * will otherwise do it with a calculator and put the result in a report.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.rules.funds.title };
}

export const dynamic = "force-dynamic";

export default async function AdminFundsPage() {
  const context = await requirePermission(
    PERMISSIONS.PLATFORM_FEES_VIEW,
    "/admin/funds"
  );
  const associationId = resolveAssociationScope(context);
  const { d } = await getDashboardCopy();
  const copy = d.rules.funds;

  if (!associationId) {
    return (
      <div>
        <PageHeader title={copy.title} description={copy.description} />
        <Alert variant="info" title={copy.noAssociation}>
          {d.admin.settings.noAssociationBody}
        </Alert>
      </div>
    );
  }

  const funds = await getFundSeparation(associationId);
  const currency = funds.currency;
  const canRemit = context.permissions.has(PERMISSIONS.PLATFORM_FEES_REMIT);

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Owed to members. */}
        <Pot
          icon={PiggyBank}
          tone="neutral"
          title={copy.membersSavings}
          amount={formatMoney(funds.memberSavings.total, { currency })}
          hint={fill(copy.membersSavingsHint, { savers: funds.memberSavings.savers })}
          note={copy.membersSavingsNote}
          rows={[
            {
              label: copy.availableNow,
              value: formatMoney(funds.memberSavings.available, { currency }),
            },
            {
              label: copy.pledged,
              value: formatMoney(funds.memberSavings.locked, { currency }),
            },
          ]}
        />

        {/* 2. Owed to the platform operator. Never the association's. */}
        <Pot
          icon={Coins}
          tone="warning"
          title={copy.serviceFee}
          amount={formatMoney(funds.platformFee.owedToOperator, { currency })}
          hint={fill(copy.serviceFeeHint, { members: funds.platformFee.membersCharged })}
          note={copy.serviceFeeNote}
          rows={[
            {
              label: copy.collected,
              value: formatMoney(funds.platformFee.collected, { currency }),
            },
            {
              label: copy.remitted,
              value: formatMoney(funds.platformFee.remitted, { currency }),
            },
          ]}
          action={
            canRemit && Number(funds.platformFee.owedToOperator) > 0 ? (
              <RemitFeesButton
                owed={funds.platformFee.owedToOperator}
                currency={currency}
              />
            ) : undefined
          }
        />

        {/* 3. The only pot the committee decides about. */}
        <Pot
          icon={HandCoins}
          tone="primary"
          title={copy.associationIncome}
          amount={formatMoney(funds.associationIncome.total, { currency })}
          hint={copy.associationIncomeHint}
          note={copy.associationIncomeNote}
          rows={[
            {
              label: copy.incomeLoanInterest,
              value: formatMoney(funds.associationIncome.loanInterestShare, { currency }),
            },
            {
              label: copy.incomeFines,
              value: formatMoney(funds.associationIncome.contributionFines, { currency }),
            },
            {
              label: copy.incomeLoanFees,
              value: formatMoney(funds.associationIncome.loanFees, { currency }),
            },
            {
              label: copy.incomeLoanPenalties,
              value: formatMoney(funds.associationIncome.loanPenalties, { currency }),
            },
            {
              label: copy.incomeAccountFees,
              value: formatMoney(funds.associationIncome.accountFees, { currency }),
            },
          ]}
        />

        {/* 4. Already given back, under the interest-sharing rule. */}
        <Pot
          icon={Scale}
          tone="success"
          title={copy.memberInterest}
          amount={formatMoney(funds.memberInterest.total, { currency })}
          hint={copy.memberInterestHint}
          note={copy.memberInterestNote}
          rows={[
            {
              label: copy.fromLoans,
              value: formatMoney(funds.memberInterest.creditedFromLoans, { currency }),
            },
            {
              label: copy.otherInterest,
              value: formatMoney(funds.memberInterest.otherInterestPaid, { currency }),
            },
          ]}
        />
      </div>

      {/* Fines: raised, taken, forgiven, still owed. Four figures rather than
          one, because "fines: 40,000" hides whether the association is
          collecting them or waiving them, and those describe two very
          different committees. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-ink">
          <span className="flex size-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <TriangleAlert className="size-4" aria-hidden="true" />
          </span>
          {copy.finesTitle}
        </h2>

        <div className="grid gap-4 sm:grid-cols-4">
          <FineFigure
            label={copy.finesAssessed}
            value={formatMoney(funds.fines.assessed, { currency })}
          />
          <FineFigure
            label={copy.finesOutstanding}
            value={formatMoney(funds.fines.outstanding, { currency })}
            tone="danger"
            hint={`${funds.fines.outstandingCount}`}
          />
          <FineFigure
            label={copy.finesSettled}
            value={formatMoney(funds.fines.settled, { currency })}
            tone="success"
          />
          <FineFigure
            label={copy.finesWaived}
            value={formatMoney(funds.fines.waived, { currency })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.chartTitle}
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">{copy.chartHint}</p>

        <FundsFlowChart
          data={funds.monthly}
          labels={{
            fee: copy.seriesFee,
            association: copy.seriesAssociation,
            member: copy.seriesMember,
          }}
        />
      </section>

      <Alert variant="info">{copy.notATotal}</Alert>
    </div>
  );
}

/**
 * One pot of money.
 *
 * The headline amount is the one that answers "how much of this is at stake" —
 * for the service fee that is what is still OWED to the operator, not what has
 * ever been collected, because the collected figure is history and the owed
 * figure is a liability somebody has to settle.
 */
function Pot({
  icon: Icon,
  tone,
  title,
  amount,
  hint,
  note,
  rows,
  action,
}: {
  icon: typeof Coins;
  tone: "neutral" | "primary" | "warning" | "success";
  title: string;
  amount: string;
  hint: string;
  note: string;
  rows: { label: string; value: string }[];
  action?: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink/[0.05] text-ink-muted",
    primary: "bg-primary-50 text-primary",
    warning: "bg-gold/15 text-amber-700",
    success: "bg-success/10 text-success",
  }[tone];

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex size-8 items-center justify-center rounded-lg ${tones}`}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
        </div>
        {action}
      </div>

      <p className="mt-4 font-heading text-3xl font-bold tabular-nums text-ink">
        {amount}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>

      <dl className="mt-4 divide-y divide-border border-t border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd className="font-medium tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      {/* The sentence that says who this money belongs to. It is the reason
          the panel exists, so it is not a tooltip. */}
      <p className="mt-4 rounded-xl bg-canvas p-3 text-xs leading-relaxed text-ink-muted">
        {note}
      </p>
    </section>
  );
}

function FineFigure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-heading text-lg font-bold tabular-nums ${
          tone === "danger"
            ? "text-red-700"
            : tone === "success"
              ? "text-success"
              : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
