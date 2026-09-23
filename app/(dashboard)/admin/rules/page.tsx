import type { Metadata } from "next";
import { Coins, HandCoins, PiggyBank, Scale, TriangleAlert } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPolicyEnsured, listRules } from "@/lib/services/rulebook";
import { prisma } from "@/lib/db/prisma";
import { add, formatMoney, toMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { RuleBook } from "@/components/dashboard/RuleBook";
import {
  DeleteRuleButton,
  EditRuleButton,
  NewRuleButton,
  RuleHistoryButton,
} from "@/components/dashboard/RuleEditor";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";

/**
 * THE COMMITTEE'S RULEBOOK.
 *
 * The same rules, in the same order, with the same wording a member sees — the
 * only additions are the controls to change them and the summary of the five
 * figures that matter most.
 *
 * WHY THE SUMMARY TILES REPEAT WHAT IS BELOW. An officer amending the fine
 * rate needs to see, without scrolling, what the daily contribution is: 7% of
 * a missed week means one thing at 1,000 a day and another at 5,000. The
 * example in the fine tile is computed from the live daily amount for exactly
 * that reason.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.rules.admin.title} | RTA` };
}

export const dynamic = "force-dynamic";

export default async function AdminRulesPage() {
  const context = await requirePermission(PERMISSIONS.RULES_MANAGE, "/admin/rules");
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.rules;

  if (!associationId) {
    return (
      <div>
        <PageHeader title={copy.admin.title} description={copy.admin.description} />
        <Alert variant="info" title={d.admin.settings.noAssociationTitle}>
          {d.admin.settings.noAssociationBody}
        </Alert>
      </div>
    );
  }

  // Seeds the catalogue on first visit, so a brand-new association opens a
  // complete rulebook rather than a blank page with an "add rule" button.
  const policy = await getPolicyEnsured(associationId, context.user.id);

  const [rules, association] = await Promise.all([
    // Withdrawn rules included: this is the only screen from which one can be
    // put back in force.
    listRules(associationId, { includeInactive: true }),
    prisma.association.findUnique({
      where: { id: associationId },
      select: { currency: true },
    }),
  ]);

  const currency = association?.currency ?? "RWF";

  const interestSum = add(
    policy.interestMemberPoints,
    policy.interestAssociationPoints
  );

  const interestDisagrees = !interestSum.equals(toMoney(policy.loanMonthlyInterest));

  return (
    <div className="space-y-8">
      <PageHeader
        title={copy.admin.title}
        description={copy.admin.description}
        actions={<NewRuleButton />}
      />

      {/* A rule whose stored value could not be read is applying the catalogue
          default. Silent fallback is right at runtime and wrong here — this is
          the screen where somebody can fix it. */}
      {policy.invalidKeys.length > 0 && (
        <Alert
          variant="warning"
          title={fill(copy.admin.invalidValues, { count: policy.invalidKeys.length })}
        >
          <p>{copy.admin.invalidValuesBody}</p>
          <p className="mt-1 font-mono text-xs">{policy.invalidKeys.join(", ")}</p>
        </Alert>
      )}

      {/* The two interest shares are meant to add up to the loan rate. They do
          not have to — an association may deliberately keep a margin — but a
          mismatch is far more often a typo than a decision, and it silently
          changes what every borrower gets back. */}
      {interestDisagrees && (
        <Alert variant="warning" title={copy.categories.INTEREST_SHARING}>
          {fill(copy.admin.interestMismatch, {
            sum: interestSum.toDecimalPlaces(2).toString(),
            rate: toMoney(policy.loanMonthlyInterest).toDecimalPlaces(2).toString(),
          })}
        </Alert>
      )}

      <StatGrid columns={4}>
        <StatCard
          label={copy.admin.summaryDaily}
          value={formatMoney(policy.dailySavings, { currency })}
          hint={fill(copy.admin.summaryDailyHint, {
            fee: formatMoney(policy.platformFeePerDay, { currency }),
            total: formatMoney(policy.dailyTotal, { currency }),
          })}
          icon={PiggyBank}
          tone="primary"
        />

        <StatCard
          label={copy.admin.summaryFee}
          value={formatMoney(policy.platformFeePerDay, { currency })}
          hint={copy.admin.summaryFeeHint}
          icon={Coins}
        />

        <StatCard
          label={fill(copy.admin.summaryFine, { days: policy.graceDays })}
          value={formatMoney(policy.penaltyPerShare, { currency })}
          hint={fill(copy.admin.summaryFineHint, {
            repeat: policy.penaltyRepeatDays,
          })}
          icon={TriangleAlert}
          tone="warning"
        />

        <StatCard
          label={copy.admin.summaryBorrowing}
          value={`${toMoney(policy.ownSavingsPercent).toDecimalPlaces(2).toString()}%`}
          hint={copy.admin.summaryBorrowingHint}
          icon={HandCoins}
        />
      </StatGrid>

      {/* The interest split gets a full-width card of its own: it is the only
          rule whose two halves have to be read together to make sense. */}
      <div>
        <StatCard
          label={copy.categories.INTEREST_SHARING}
          value={fill(copy.admin.summaryInterest, {
            rate: toMoney(policy.loanMonthlyInterest).toDecimalPlaces(2).toString(),
          })}
          hint={fill(copy.admin.summaryInterestHint, {
            member: `${toMoney(policy.interestMemberPoints).toDecimalPlaces(2).toString()}%`,
            association: `${toMoney(policy.interestAssociationPoints).toDecimalPlaces(2).toString()}%`,
          })}
          icon={Scale}
        />
      </div>

      <RuleBook
        rules={rules}
        locale={locale}
        d={d}
        currency={currency}
        actions={(rule) => (
          <>
            <RuleHistoryButton
              ruleId={rule.id}
              ruleTitle={locale === "rw" ? rule.title.rw : rule.title.en}
            />
            <EditRuleButton
              rule={{
                id: rule.id,
                key: rule.key,
                valueType: rule.valueType,
                value: rule.value,
                isSystem: rule.isSystem,
                isActive: rule.isActive,
                enforcement: rule.enforcement,
                titleEn: rule.title.en,
                titleRw: rule.title.rw,
                bodyEn: rule.body.en,
                bodyRw: rule.body.rw,
              }}
            />
            {/* A committee's own rule, or a system rule that is only written
                policy, can be deleted. A rule the system enforces cannot: the
                policy reader would fall back to the catalogue default. The
                server refuses it too — this only avoids offering the button. */}
            {(!rule.isSystem || rule.enforcement === "INFORMATIONAL") && (
              <DeleteRuleButton ruleId={rule.id} isSystem={rule.isSystem} />
            )}
          </>
        )}
      />
    </div>
  );
}
