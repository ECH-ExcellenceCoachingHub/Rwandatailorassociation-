import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  Coins,
  HandCoins,
  PiggyBank,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getPolicyEnsured, listRules } from "@/lib/services/rulebook";
import { getMemberStanding } from "@/lib/services/contributions";
import { assessBorrowing, wholeMonthsBetween } from "@/lib/rules/borrowing";
import { formatMoney, toMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { RuleBook } from "@/components/dashboard/RuleBook";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * THE MEMBER'S OWN COPY OF THE RULES.
 *
 * Not a policy document. The rules are here, in full and in the member's
 * language, but the page opens with where THEY stand against them: how many
 * days they have paid for, how many they owe, what one payment would clear,
 * and how long before a fine. A rulebook that makes a member work out their own
 * position from a percentage is a rulebook they will not read.
 *
 * THE ORDER IS THE ARGUMENT. Standing first, because it is actionable today.
 * Borrowing second, because it is what most members came to find out. The
 * rules themselves last, because they explain the two sections above rather
 * than the other way round.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.rules.member.title} | RTA` };
}

export const dynamic = "force-dynamic";

export default async function MemberRulesPage() {
  const context = await requireMember("/dashboard/rules");
  const { d, locale } = await getDashboardCopy();
  const copy = d.rules;

  const associationId = context.user.associationId;
  const memberId = context.member!.id;

  if (!associationId) {
    return (
      <div>
        <PageHeader title={copy.member.title} description={copy.member.description} />
        <EmptyState
          icon={Scale}
          title={copy.member.noRules}
          description={copy.member.noRulesBody}
        />
      </div>
    );
  }

  // Seeded on first read. A member opening this page before any officer has
  // touched the rulebook still gets the complete, documented default policy
  // rather than an empty screen implying the association has no rules.
  const policy = await getPolicyEnsured(associationId);

  const [rules, standing, member] = await Promise.all([
    listRules(associationId, { includeInactive: false }),
    getMemberStanding(memberId),
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        joinedAt: true,
        createdAt: true,
        approvedAt: true,
        paymentReference: true,
        association: { select: { currency: true, createdAt: true } },
        loans: {
          where: {
            status: { in: ["PENDING_DISBURSEMENT", "DISBURSED", "ACTIVE", "OVERDUE"] },
          },
          select: { id: true },
        },
      },
    }),
  ]);

  const currency = member?.association.currency ?? "RWF";
  const now = new Date();
  const since = member?.approvedAt ?? member?.joinedAt ?? member?.createdAt ?? now;

  const borrowing = assessBorrowing({
    policy,
    savingsBalance: standing?.savingsBalance ?? "0.00",
    membershipMonths: wholeMonthsBetween(since, now),
    associationMonths: wholeMonthsBetween(
      member?.association.createdAt ?? now,
      now
    ),
    missedDays: standing?.missedDays ?? 0,
    outstandingFines: standing?.outstandingFineAmount ?? "0.00",
    hasActiveLoan: (member?.loans.length ?? 0) > 0,
    // An illustration of what the member could actually take, so the numbers
    // below are their own rather than a textbook example.
    requestedAmount: standing?.savingsBalance
      ? assessBorrowing({
          policy,
          savingsBalance: standing.savingsBalance,
          membershipMonths: 0,
          associationMonths: 0,
          missedDays: 0,
          outstandingFines: "0.00",
          hasActiveLoan: false,
        }).ownShareLimit
      : null,
  });

  return (
    <div className="space-y-8">
      <PageHeader title={copy.member.title} description={copy.member.description} />

      {standing && <StandingPanel standing={standing} copy={copy} policy={policy} currency={currency} locale={locale} />}

      {/* --- What you can borrow ------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-ink">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <HandCoins className="size-4" aria-hidden="true" />
          </span>
          {copy.member.borrowingTitle}
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {copy.member.borrowingDescription}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Figure
            label={copy.member.withoutCollateral}
            value={formatMoney(borrowing.ownShareLimit, { currency })}
            hint={fill(copy.member.withoutCollateralHint, {
              percent: toMoney(policy.ownSavingsPercent).toDecimalPlaces(2).toString(),
              savings: formatMoney(standing?.savingsBalance ?? 0, { currency }),
            })}
            tone="primary"
          />
          <Figure
            label={copy.member.aboveThat}
            value={copy.member.aboveThatValue}
            hint={copy.member.aboveThatHint}
          />
        </div>

        {borrowing.canBorrow ? (
          <Alert variant="success" className="mt-5" title={copy.member.canBorrowNow}>
            <Link
              href="/dashboard/loans/apply"
              className="font-semibold underline underline-offset-2"
            >
              {d.nav.applyLoan}
            </Link>
          </Alert>
        ) : (
          <Alert variant="warning" className="mt-5" title={copy.member.cannotBorrowYet}>
            <p className="mb-1.5 font-medium">{copy.member.whatIsStopping}</p>
            <ul className="list-inside list-disc space-y-1">
              {borrowing.blockers.map((blocker) => (
                <li key={blocker.rule}>
                  {fill(copy.blockers[blocker.rule], blocker.params)}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {/* What it would actually cost. The line members most want and are
            least often given: interest charged, interest returned, net cost. */}
        {borrowing.illustration && (
          <div className="mt-5 rounded-xl border border-border bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">{copy.member.exampleTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {fill(copy.member.exampleBody, {
                principal: formatMoney(borrowing.illustration.principal, { currency }),
                months: borrowing.illustration.termMonths,
                rate: borrowing.illustration.monthlyRate,
              })}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <CostRow
                label={copy.member.exampleYouRepay}
                value={formatMoney(borrowing.illustration.totalRepayable, { currency })}
              />
              <CostRow
                label={copy.member.exampleComesBack}
                value={`+ ${formatMoney(borrowing.illustration.memberShareOfInterest, { currency })}`}
                tone="success"
              />
              <CostRow
                label={copy.member.exampleRealCost}
                value={formatMoney(borrowing.illustration.netCostToMember, { currency })}
                emphasis
              />
            </dl>
          </div>
        )}
      </section>

      {/* --- The rules themselves ------------------------------------------ */}
      <section>
        <h2 className="mb-4 font-heading text-xl font-bold text-ink">
          {copy.member.theRules}
        </h2>

        {/* THE SUM, BEFORE THE TWO RULES THAT MAKE IT UP. The daily saving and
            the service fee are separate entries below, and a member who meets
            them one at a time does not add them together — so they pay the
            savings half exactly, believe they are square, and are found behind
            by the fee. Stating the total first is what stops that. */}
        <Alert
          variant="info"
          className="mb-4"
          title={fill(copy.member.dailyCostRule, {
            total: formatMoney(policy.dailyTotal, { currency }),
          })}
        >
          {fill(copy.member.dailyCostRuleBody, {
            savings: formatMoney(policy.dailySavings, { currency }),
            fee: formatMoney(policy.platformFeePerDay, { currency }),
          })}
        </Alert>

        {rules.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={copy.member.noRules}
            description={copy.member.noRulesBody}
          />
        ) : (
          <RuleBook rules={rules} locale={locale} d={d} currency={currency} />
        )}
      </section>

      {member?.paymentReference && (
        <Alert variant="info" title={copy.member.howToPay}>
          {fill(copy.member.howToPayBody, { reference: member.paymentReference })}
        </Alert>
      )}
    </div>
  );
}

/**
 * Where the member stands today.
 *
 * Four tiles and one sentence. The sentence changes with the member's status
 * and is the only part most people will read, so each variant names the amount
 * and the deadline rather than describing the situation in the abstract.
 */
function StandingPanel({
  standing,
  copy,
  policy,
  currency,
  locale,
}: {
  standing: NonNullable<Awaited<ReturnType<typeof getMemberStanding>>>;
  copy: Awaited<ReturnType<typeof getDashboardCopy>>["d"]["rules"];
  policy: Awaited<ReturnType<typeof getPolicyEnsured>>;
  currency: string;
  locale: "en" | "rw";
}) {
  const headline = {
    CURRENT: {
      variant: "success" as const,
      title: copy.member.upToDate,
      body: copy.member.upToDateBody,
    },
    EXEMPT: {
      variant: "info" as const,
      title: copy.member.exemptTitle,
      body: copy.member.exemptBody,
    },
    BEHIND: {
      variant: "warning" as const,
      title: fill(copy.member.behindBy, { days: standing.missedDays }),
      body: fill(copy.member.behindBody, {
        amount: formatMoney(standing.clearingAmount, { currency }),
        remaining: standing.daysUntilFine,
      }),
    },
    AT_RISK: {
      variant: "warning" as const,
      title: fill(copy.member.fineWarning, { days: standing.daysUntilFine }),
      body: fill(copy.member.fineWarningBody, {
        behind: standing.missedDays,
        amount: formatMoney(standing.clearingAmount, { currency }),
      }),
    },
    FINABLE: {
      variant: "error" as const,
      title: copy.member.finedTitle,
      body: fill(copy.member.finedBody, {
        behind: standing.missedDays,
        grace: policy.graceDays,
        amount: formatMoney(standing.clearingAmount, { currency }),
      }),
    },
  }[standing.status];

  return (
    <section className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-ink">
        {copy.member.yourStanding}
      </h2>

      <Alert variant={headline.variant} title={headline.title}>
        {headline.body}
      </Alert>

      <StatGrid columns={4}>
        <StatCard
          label={copy.member.payToClear}
          value={formatMoney(standing.clearingAmount, { currency })}
          hint={copy.member.payToClearHint}
          icon={Coins}
          tone={standing.missedDays > 0 ? "danger" : "success"}
        />
        <StatCard
          label={copy.member.daysCovered}
          value={String(standing.coveredDays)}
          hint={fill(copy.member.daysCoveredHint, { owed: standing.dueDays })}
          icon={CalendarCheck}
        />
        <StatCard
          label={copy.member.oneDayCosts}
          value={formatMoney(standing.dailyTotal, { currency })}
          hint={fill(copy.member.oneDayCostsHint, {
            savings: formatMoney(policy.dailySavings, { currency }),
            fee: formatMoney(policy.platformFeePerDay, { currency }),
          })}
          icon={PiggyBank}
        />
        <StatCard
          label={copy.standing[standing.status]}
          value={
            standing.missedDays > 0 ? String(standing.missedDays) : String(standing.dueDays)
          }
          hint={
            standing.missedDays > 0
              ? fill(copy.member.behindBy, { days: standing.missedDays })
              : copy.member.daysOwed
          }
          icon={standing.missedDays > 0 ? TriangleAlert : CalendarCheck}
          tone={
            standing.status === "FINABLE"
              ? "danger"
              : standing.status === "AT_RISK" || standing.status === "BEHIND"
                ? "warning"
                : "success"
          }
        />
      </StatGrid>

      {standing.fines.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="mb-3 font-heading text-base font-semibold text-ink">
            {copy.member.yourFines}
          </h3>
          <ul className="divide-y divide-border">
            {standing.fines.map((fine) => (
              <li key={fine.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-ink-muted">{fine.reference}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {fill(copy.member.fineOn, {
                      date: formatDate(fine.assessedAt, locale),
                      days: fine.missedDays,
                    })}
                  </p>
                  {fine.waiverReason && (
                    <p className="mt-1 text-xs italic text-ink-muted">
                      {fine.waiverReason}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-ink">
                    {formatMoney(fine.amount, { currency })}
                  </p>
                  <p
                    className={
                      fine.status === "OUTSTANDING"
                        ? "text-xs font-semibold text-red-600"
                        : "text-xs text-ink-muted"
                    }
                  >
                    {fine.status === "OUTSTANDING"
                      ? copy.member.fineOutstanding
                      : fine.status === "WAIVED"
                        ? copy.member.fineWaived
                        : copy.member.fineSettled}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "primary";
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-heading text-xl font-bold tabular-nums ${
          tone === "primary" ? "text-primary" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</p>
    </div>
  );
}

function CostRow({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "success";
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        emphasis ? "border-t border-border pt-2" : ""
      }`}
    >
      <dt className={emphasis ? "font-semibold text-ink" : "text-ink-muted"}>{label}</dt>
      <dd
        className={`tabular-nums ${
          tone === "success"
            ? "font-semibold text-success"
            : emphasis
              ? "font-bold text-ink"
              : "font-medium text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
