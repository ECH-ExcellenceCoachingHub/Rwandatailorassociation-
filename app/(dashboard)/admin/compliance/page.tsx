import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { CalendarCheck, Coins, TriangleAlert, UserMinus, Users } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  listStandings,
  type ContributionStatus,
} from "@/lib/services/contributions";
import { getPolicyEnsured } from "@/lib/services/rulebook";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import {
  ActionGroup,
  MemberComplianceButton,
  RunChecksButton,
  SettleFineButton,
  WaiveFineButton,
} from "@/components/dashboard/ComplianceActions";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";

/**
 * WHO IS UP TO DATE, AND WHO IS ABOUT TO BE FINED.
 *
 * The screen an officer opens daily. Sorted worst-first rather than by name,
 * because a list of three hundred members ordered alphabetically is a list
 * nobody acts on — the twelve people who need a phone call today are what this
 * page exists to surface.
 *
 * Every figure comes from the same `computeStanding` the member's own page
 * uses. An officer and a member looking at the same arrears must never see two
 * different numbers, and the only way to guarantee that is one implementation.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.rules.compliance.title };
}

export const dynamic = "force-dynamic";

const STATUSES: (ContributionStatus | "ALL")[] = [
  "ALL",
  "FINABLE",
  "AT_RISK",
  "BEHIND",
  "CURRENT",
  "EXEMPT",
];

export default async function AdminCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const context = await requirePermission(
    PERMISSIONS.COMPLIANCE_VIEW,
    "/admin/compliance"
  );
  const associationId = resolveAssociationScope(context);
  const { d } = await getDashboardCopy();
  const copy = d.rules.compliance;

  if (!associationId) {
    return (
      <div>
        <PageHeader title={copy.title} description={copy.description} />
        <Alert variant="info" title={d.admin.settings.noAssociationTitle}>
          {d.admin.settings.noAssociationBody}
        </Alert>
      </div>
    );
  }

  const params = await searchParams;
  const status = (
    STATUSES.includes(params.status as ContributionStatus) ? params.status : "ALL"
  ) as ContributionStatus | "ALL";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [policy, standings, association] = await Promise.all([
    getPolicyEnsured(associationId, context.user.id),
    listStandings(associationId, { status, search: params.q, page, pageSize: 25 }),
    prisma.association.findUnique({
      where: { id: associationId },
      select: { currency: true },
    }),
  ]);

  const currency = association?.currency ?? "RWF";
  const canAct = context.permissions.has(PERMISSIONS.COMPLIANCE_ACT);
  const { summary } = standings;

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={canAct ? <RunChecksButton /> : undefined}
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.tileUpToDate}
          value={String(summary.current)}
          hint={`${summary.members} ${d.common.members.toLowerCase()}`}
          icon={CalendarCheck}
          tone="success"
        />
        <StatCard
          label={copy.tileBehind}
          value={String(summary.behind)}
          hint={copy.tileArrearsHint}
          icon={Users}
          tone={summary.behind > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.tileFinable}
          value={String(summary.finable)}
          hint={copy.tileFinesHint}
          icon={TriangleAlert}
          tone={summary.finable > 0 ? "danger" : "default"}
        />
        <StatCard
          label={copy.tileExempt}
          value={String(summary.exempt)}
          hint={copy.excuseBody}
          icon={UserMinus}
        />
      </StatGrid>

      <StatGrid columns={3}>
        <StatCard
          label={copy.tileArrears}
          value={formatMoney(summary.totalArrears, { currency })}
          hint={copy.tileArrearsHint}
          icon={Coins}
          tone={summary.behind + summary.finable > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.tileFines}
          value={formatMoney(summary.outstandingFines, { currency })}
          hint={copy.tileFinesHint}
          icon={TriangleAlert}
          tone={Number(summary.outstandingFines) > 0 ? "danger" : "default"}
        />
        <StatCard
          label={copy.tileFeesPending}
          value={formatMoney(summary.feesPending, { currency })}
          hint={copy.tileFeesPendingHint}
          icon={Coins}
        />
      </StatGrid>

      <SearchFilterForm
        action="/admin/compliance"
        search={params.q ?? ""}
        placeholder={copy.searchPlaceholder}
        selects={[
          {
            name: "status",
            label: copy.colStanding,
            value: status,
            width: "sm:w-52",
            options: STATUSES.map((option) => ({
              value: option,
              label:
                option === "ALL"
                  ? copy.filterAll
                  : d.rules.standing[option as ContributionStatus],
            })),
          },
        ]}
      />

      {standings.rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={
            summary.members > 0 && status === "ALL" && !params.q
              ? copy.allCurrentTitle
              : copy.noneTitle
          }
          description={
            summary.members > 0 && status === "ALL" && !params.q
              ? copy.allCurrentBody
              : copy.noneBody
          }
        />
      ) : (
        <>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.colMember}</TableHead>
                  <TableHead>{copy.colStanding}</TableHead>
                  <TableHead className="text-right">{copy.colBehind}</TableHead>
                  <TableHead className="text-right">{copy.colArrears}</TableHead>
                  <TableHead className="text-right">{copy.colFines}</TableHead>
                  <TableHead className="text-right">{copy.colToClear}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {standings.rows.map((row) => (
                  <TableRow key={row.memberId}>
                    <TableCell>
                      <Link
                        href={`/admin/members/${row.memberId}`}
                        className="font-medium text-ink hover:text-primary"
                      >
                        {row.memberName}
                      </Link>
                      <p className="font-mono text-xs text-ink-muted">
                        {row.paymentReference}
                      </p>
                    </TableCell>

                    <TableCell>
                      <StandingPill
                        status={row.status}
                        label={d.rules.standing[row.status]}
                      />
                      {/* The line that turns a status into an action: how long
                          this member has before the fine lands. */}
                      {row.status === "AT_RISK" && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          {row.daysUntilFine === 0
                            ? copy.fineTonight
                            : pluralize(copy.daysToFine, row.daysUntilFine, {
                                days: row.daysUntilFine,
                              })}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {row.missedDays > 0
                        ? pluralize(copy.daysBehind, row.missedDays, {
                            days: row.missedDays,
                          })
                        : "—"}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.arrearsTotal, { currency })}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {Number(row.outstandingFineAmount) > 0 ? (
                        <span className="font-semibold text-red-600">
                          {formatMoney(row.outstandingFineAmount, { currency })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(row.clearingAmount, { currency })}
                    </TableCell>

                    <TableCell className="text-right">
                      {canAct && (
                        <ActionGroup>
                          {/* Only the oldest unpaid fine gets buttons. A member
                              with three is dealt with one at a time, and a row
                              of six buttons is a row nobody reads. */}
                          {row.outstandingFines.slice(0, 1).map((fine) => (
                            <span key={fine.id} className="flex items-center gap-1">
                              <SettleFineButton
                                fineId={fine.id}
                                amount={fine.amount}
                                currency={currency}
                              />
                              <WaiveFineButton fineId={fine.id} />
                            </span>
                          ))}

                          <MemberComplianceButton
                            memberId={row.memberId}
                            memberName={row.memberName}
                            isExempt={row.isExempt}
                            obligationStart={row.obligationStart}
                          />
                        </ActionGroup>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>

          <PaginationLinks
            page={page}
            pageSize={25}
            total={standings.total}
            totalPages={Math.max(1, Math.ceil(standings.total / 25))}
          />
        </>
      )}

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {fill(d.rules.admin.dailyTotalNote, {
          total: formatMoney(policy.dailyTotal, { currency }),
        })}{" "}
        {copy.runChecksHint}
      </p>
    </div>
  );
}

/** Colour and word together — colour alone tells a colour-blind reader nothing. */
function StandingPill({
  status,
  label,
}: {
  status: ContributionStatus;
  label: string;
}) {
  const tone = {
    CURRENT: "border-success/30 bg-success/10 text-emerald-700",
    AT_RISK: "border-gold/40 bg-gold/10 text-amber-800",
    BEHIND: "border-gold/40 bg-gold/10 text-amber-800",
    FINABLE: "border-red-300 bg-red-50 text-red-700",
    EXEMPT: "border-ink/12 bg-ink/[0.04] text-ink-muted",
  }[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}
