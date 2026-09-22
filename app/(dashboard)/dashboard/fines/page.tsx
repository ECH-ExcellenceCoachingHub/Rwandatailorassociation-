import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Gavel, Scale, Warehouse } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { fineSum, listMemberFines, type FineRow } from "@/lib/services/fines";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * WHAT THE MEMBER HAS BEEN FINED, AND WHY.
 *
 * A member could previously learn they had been fined only by opening the
 * rulebook page, or — for a late warehouse instalment — by opening that credit.
 * A penalty against somebody's money should not be something they have to go
 * looking for under a heading that does not contain the word, so this page
 * exists and the sidebar calls it "My fines".
 *
 * EVERY FINE SHOWS ITS ARITHMETIC. Not a bare figure and a date: the rate that
 * was in force, the arrears it was applied to, and what fell behind. A member
 * who cannot check the sum cannot dispute it, and a penalty nobody can dispute
 * is one the association will eventually be accused of inventing.
 *
 * SETTLED AND WAIVED FINES STAY. The page is a record, not a bill — a member
 * needs to be able to show that a fine was forgiven, and by what reason, long
 * after it stopped being owed.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.rules.fines.memberTitle} | RTA` };
}

export const dynamic = "force-dynamic";

export default async function MemberFinesPage() {
  const context = await requireMember("/dashboard/fines");
  const { d, locale } = await getDashboardCopy();
  const copy = d.rules.fines;

  const fines = await listMemberFines(context.member!.id);
  const currency = fines.currency;

  const hasWarehouseFine = fines.rows.some(
    (row) => row.kind === "WAREHOUSE_CREDIT"
  );

  return (
    <div className="space-y-6">
      <PageHeader title={copy.memberTitle} description={copy.memberDescription} />

      {fines.rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={copy.memberNothingTitle}
          description={copy.memberNothingBody}
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/rules">{copy.memberOpenRules}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <StatGrid columns={3}>
            <StatCard
              label={copy.memberOwed}
              value={formatMoney(fines.outstandingAmount, { currency })}
              hint={copy.memberOwedHint}
              icon={Gavel}
              tone={fines.outstandingCount > 0 ? "danger" : "success"}
            />
            <StatCard
              label={copy.memberPaid}
              value={formatMoney(fines.settledAmount, { currency })}
              hint={copy.memberPaidHint}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={copy.memberWaivedCount}
              value={String(fines.waivedCount)}
              hint={copy.memberWaivedHint}
              icon={Scale}
            />
          </StatGrid>

          <ul className="space-y-3">
            {fines.rows.map((fine) => (
              <FineCard
                key={`${fine.kind}-${fine.id}`}
                fine={fine}
                copy={copy}
                locale={locale}
              />
            ))}
          </ul>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              {copy.memberHowToClear}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/rules">
                  <Scale className="size-4" aria-hidden="true" />
                  {copy.memberOpenRules}
                </Link>
              </Button>
              {hasWarehouseFine && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/warehouse">
                    <Warehouse className="size-4" aria-hidden="true" />
                    {copy.memberOpenWarehouse}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type FinesCopy = Awaited<ReturnType<typeof getDashboardCopy>>["d"]["rules"]["fines"];

function FineCard({
  fine,
  copy,
  locale,
}: {
  fine: FineRow;
  copy: FinesCopy;
  locale: Parameters<typeof formatDate>[1];
}) {
  const outstanding = fine.status === "OUTSTANDING";

  const why =
    fine.kind === "CONTRIBUTION"
      ? pluralize(copy.whyContribution, fine.missedDays ?? 0, {
          days: fine.missedDays ?? 0,
        })
      : pluralize(copy.whyWarehouse, fine.daysLate ?? 0, {
          number: fine.installmentNumber ?? 0,
          days: fine.daysLate ?? 0,
        });

  return (
    <li
      className={`rounded-2xl border p-4 ${
        outstanding ? "border-red-200 bg-red-50/50" : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{why}</p>

          {/* The sum, so the member can check it rather than take it on
              trust. */}
          <p className="mt-0.5 text-sm text-ink-muted">
            {fineSum(fine, copy)}
          </p>

          <p className="mt-1 text-xs text-ink-muted">
            {formatDate(fine.assessedAt, locale)} ·{" "}
            <span className="font-mono">{fine.reference}</span>
            {fine.creditReference && (
              <>
                {" · "}
                {fill(copy.creditRef, { reference: fine.creditReference })}
              </>
            )}
          </p>

          {fine.waiverReason && (
            <p className="mt-1.5 text-xs italic text-ink-muted">
              {fill(copy.waivedBecause, { reason: fine.waiverReason })}
            </p>
          )}
        </div>

        <div className="text-right">
          <p
            className={`text-lg font-bold tabular-nums ${
              outstanding ? "text-red-600" : "text-ink"
            }`}
          >
            {formatMoney(fine.amount, { currency: fine.currency })}
          </p>
          <span
            className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              outstanding
                ? "border-red-300 bg-red-50 text-red-700"
                : fine.status === "SETTLED"
                  ? "border-success/30 bg-success/10 text-emerald-700"
                  : "border-ink/12 bg-ink/[0.04] text-ink-muted"
            }`}
          >
            {copy.state[fine.status]}
          </span>
        </div>
      </div>
    </li>
  );
}
