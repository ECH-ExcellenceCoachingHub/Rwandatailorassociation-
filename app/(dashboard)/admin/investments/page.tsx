import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, EyeOff, Sprout, TrendingUp, Users } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listInvestments, summariseInvestments } from "@/lib/services/investments";
import { listBorrowings } from "@/lib/services/borrowings";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import {
  EditInvestmentButton,
  NewInvestmentButton,
} from "@/components/dashboard/InvestmentForm";

/**
 * What the association's money did, from the committee's side.
 *
 * The screen is arranged around the benefit sentence rather than around the
 * amounts, and an entry that has none is called out. A project with a figure
 * and no explanation is the state this feature was built to get away from, so
 * it is shown as an omission to be fixed rather than as a complete record.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.admin.investments.title };
}

export const dynamic = "force-dynamic";

export default async function AdminInvestmentsPage() {
  const context = await requirePermission(
    PERMISSIONS.INVESTMENTS_VIEW,
    "/admin/investments"
  );
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.investments;

  const [investments, totals, facilities] = await Promise.all([
    listInvestments(associationId, { includeUnpublished: true }),
    summariseInvestments(associationId, { includeUnpublished: true }),
    listBorrowings(associationId, { includeUnpublished: true }),
  ]);

  const currency = context.association?.currency ?? "RWF";
  const canManage = context.permissions.has(PERMISSIONS.INVESTMENTS_MANAGE);

  // Every facility, not only the live ones: a project bought years ago was
  // paid for by a facility that has since been repaid, and dropping settled
  // ones from the list would make that link unrecordable.
  const facilityOptions = facilities.map((facility) => ({
    id: facility.id,
    reference: facility.reference,
    lenderName: facility.lenderName,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          canManage ? <NewInvestmentButton facilities={facilityOptions} /> : undefined
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.totalInvested}
          value={formatMoney(totals.totalInvested, { currency })}
          hint={pluralize(d.member.association.projectsCount, totals.count, {
            count: totals.count,
          })}
          icon={Sprout}
          tone="primary"
        />

        <StatCard
          label={copy.totalReturned}
          value={formatMoney(totals.totalReturned, { currency })}
          icon={ArrowDownLeft}
          tone="success"
        />

        <StatCard
          label={copy.projects}
          value={String(totals.count)}
          icon={TrendingUp}
        />

        <StatCard
          label={copy.reach}
          value={String(totals.membersBenefited)}
          hint={copy.reachHint}
          icon={Users}
        />
      </StatGrid>

      <Alert variant="info">
        {copy.memberViewNote}{" "}
        <Link href="/dashboard/association" className="font-semibold underline">
          {d.nav.ourMoney}
        </Link>
      </Alert>

      {investments.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title={copy.noneTitle}
          description={copy.noneBody}
          action={
            canManage ? <NewInvestmentButton facilities={facilityOptions} /> : undefined
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {investments.map((project) => (
            <article
              key={project.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card"
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-semibold text-ink">
                    {project.title}
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-ink-muted">
                    {project.reference} · {statusLabel(project.category, d.status)}
                  </p>
                </div>
                <StatusBadge status={project.status} size="sm" />
              </header>

              {!project.isPublic && (
                <Alert variant="warning" className="mb-3">
                  <span className="inline-flex items-start gap-2">
                    <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {copy.hiddenFromMembers}
                  </span>
                </Alert>
              )}

              <p className="text-sm leading-relaxed text-ink-muted">{project.summary}</p>

              {project.benefitSummary ? (
                <p className="mt-3 rounded-xl border border-success/25 bg-success/[0.07] px-3 py-2.5 text-sm leading-relaxed text-ink">
                  <span className="font-semibold">{copy.benefit}: </span>
                  {project.benefitSummary}
                </p>
              ) : (
                // Not an error, but not finished either. A record with no
                // benefit sentence renders on the members' page as an amount
                // with nothing to justify it.
                <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-ink-muted">
                  {copy.noBenefitRecorded} — {copy.benefitPrompt}
                </p>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Cell
                  label={copy.invested}
                  value={formatMoney(project.amountInvested, {
                    currency: project.currency,
                    showSymbol: false,
                  })}
                />
                <Cell
                  label={copy.returned}
                  value={formatMoney(project.amountReturned, {
                    currency: project.currency,
                    showSymbol: false,
                  })}
                />
                <Cell
                  label={copy.netReturn}
                  value={formatMoney(project.netReturn, {
                    currency: project.currency,
                    showSymbol: false,
                    signed: true,
                  })}
                  hint={
                    project.returnPercent !== null
                      ? fill("{percent}%", { percent: project.returnPercent })
                      : undefined
                  }
                />
                {project.membersBenefited !== null && (
                  <Cell
                    label={d.common.members}
                    value={String(project.membersBenefited)}
                  />
                )}
              </dl>

              <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-xs text-ink-muted">
                <span>
                  {copy.fundingSource}: {statusLabel(project.fundingSource, d.status)}
                </span>
                {project.fundedBy && (
                  <span className="font-mono">
                    {fill(copy.fundedBy, { reference: project.fundedBy.reference })}
                  </span>
                )}
                {project.startedAt && (
                  <span>
                    {copy.started}: {formatDate(project.startedAt, locale)}
                  </span>
                )}
                {canManage && (
                  <span className="ml-auto">
                    <EditInvestmentButton
                      facilities={facilityOptions}
                      investment={{
                        id: project.id,
                        title: project.title,
                        category: project.category,
                        status: project.status,
                        summary: project.summary,
                        description: project.description,
                        benefitSummary: project.benefitSummary,
                        membersBenefited: project.membersBenefited,
                        fundingSource: project.fundingSource,
                        fundedByLoanId: project.fundedBy?.id ?? null,
                        amountInvested: project.amountInvested,
                        amountReturned: project.amountReturned,
                        startedAt: project.startedAt,
                        completedAt: project.completedAt,
                        isPublic: project.isPublic,
                      }}
                    />
                  </span>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-heading text-sm font-bold tabular-nums text-ink">
        {value}
      </dd>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
