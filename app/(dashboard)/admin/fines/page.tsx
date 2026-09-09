import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Gavel, Scale, Users } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  FINE_KINDS,
  FINE_STATUSES,
  getFinesOverview,
  listFines,
  type FineKind,
  type FineRow,
  type FineStatus,
} from "@/lib/services/fines";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { ActionGroup } from "@/components/dashboard/ComplianceActions";
import { SettleFineAction, WaiveFineAction } from "@/components/dashboard/FineActions";
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
 * EVERY FINE THE ASSOCIATION HAS RAISED.
 *
 * Distinct from the compliance screen next door, which answers "who do I call
 * today". This one answers "what have we raised, collected and forgiven" — the
 * question a committee is asked at a meeting, and the one neither existing
 * screen could answer, because fines for missed saving lived as a column on the
 * arrears list and fines for late warehouse instalments lived inside individual
 * credit cards. Both are here, in one table, sorted newest first.
 *
 * WAIVING THE TWO KINDS NEEDS DIFFERENT PERMISSIONS, and that is not an
 * oversight to paper over. Forgiving a contribution fine is COMPLIANCE_ACT;
 * forgiving a warehouse-credit fine is WAREHOUSE_ADJUST, which the default
 * admin role deliberately does not hold — the officer who issues stock should
 * not also be the one who can quietly forgive the penalty for not paying for
 * it. So the buttons are gated separately, and an officer with one permission
 * and not the other sees exactly the actions they may take.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.rules.fines.title} | RTA` };
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminFinesPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const context = await requirePermission(PERMISSIONS.COMPLIANCE_VIEW, "/admin/fines");
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.rules.fines;

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
  const kind = (
    FINE_KINDS.includes(params.kind as FineKind) ? params.kind : "ALL"
  ) as FineKind | "ALL";
  const status = (
    FINE_STATUSES.includes(params.status as FineStatus) ? params.status : "ALL"
  ) as FineStatus | "ALL";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [overview, fines, association] = await Promise.all([
    getFinesOverview(associationId),
    listFines(associationId, {
      kind,
      status,
      search: params.q,
      page,
      pageSize: PAGE_SIZE,
    }),
    prisma.association.findUnique({
      where: { id: associationId },
      select: { currency: true },
    }),
  ]);

  const currency = association?.currency ?? "RWF";
  const canActOnContribution = context.permissions.has(PERMISSIONS.COMPLIANCE_ACT);
  const canActOnWarehouse = context.permissions.has(PERMISSIONS.WAREHOUSE_ADJUST);

  // Distinguishes "nothing matches this filter" from "this association has
  // never fined anybody" — the second is good news and should not be reported
  // as an empty search result.
  const everFined =
    overview.outstandingCount + overview.settledCount + overview.waivedCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.tileOutstanding}
          value={formatMoney(overview.outstandingAmount, { currency })}
          hint={copy.tileOutstandingHint}
          icon={Gavel}
          tone={overview.outstandingCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label={copy.tileMembers}
          value={String(overview.membersAffected)}
          hint={copy.tileMembersHint}
          icon={Users}
          tone={overview.membersAffected > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.tileSettled}
          value={formatMoney(overview.settledAmount, { currency })}
          hint={copy.tileSettledHint}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label={copy.tileWaived}
          value={formatMoney(overview.waivedAmount, { currency })}
          hint={copy.tileWaivedHint}
          icon={Scale}
        />
      </StatGrid>

      <SearchFilterForm
        action="/admin/fines"
        search={params.q ?? ""}
        placeholder={copy.searchPlaceholder}
        selects={[
          {
            name: "kind",
            label: copy.typeLabel,
            value: kind,
            width: "sm:w-52",
            options: [
              { value: "ALL", label: copy.typeAll },
              { value: "CONTRIBUTION", label: copy.typeContribution },
              { value: "WAREHOUSE_CREDIT", label: copy.typeWarehouse },
            ],
          },
          {
            name: "status",
            label: copy.statusLabel,
            value: status,
            width: "sm:w-48",
            options: [
              { value: "ALL", label: copy.statusAll },
              ...FINE_STATUSES.map((option) => ({
                value: option,
                label: copy.state[option],
              })),
            ],
          },
        ]}
      />

      {fines.rows.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={everFined ? copy.noneTitle : copy.cleanTitle}
          description={everFined ? copy.noneBody : copy.cleanBody}
        />
      ) : (
        <>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.colMember}</TableHead>
                  <TableHead>{copy.colWhy}</TableHead>
                  <TableHead className="text-right">{copy.colAmount}</TableHead>
                  <TableHead>{copy.colState}</TableHead>
                  <TableHead>{copy.colAssessed}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fines.rows.map((fine) => {
                  const mayWaive =
                    fine.status === "OUTSTANDING" &&
                    (fine.kind === "CONTRIBUTION"
                      ? canActOnContribution
                      : canActOnWarehouse);

                  return (
                    <TableRow key={`${fine.kind}-${fine.id}`}>
                      <TableCell>
                        <Link
                          href={`/admin/members/${fine.memberId}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {fine.memberName}
                        </Link>
                        <p className="font-mono text-xs text-ink-muted">
                          {fine.memberNumber}
                        </p>
                      </TableCell>

                      <TableCell>
                        <KindPill
                          kind={fine.kind}
                          label={
                            fine.kind === "CONTRIBUTION"
                              ? copy.typeContribution
                              : copy.typeWarehouse
                          }
                        />
                        <p className="mt-1 text-sm text-ink">
                          {describe(fine, copy)}
                        </p>
                        {/* The sum, never a bare figure: the rate that was in
                            force and the arrears it was applied to. */}
                        <p className="text-xs text-ink-muted">
                          {fill(copy.sum, {
                            rate: fine.rate,
                            arrears: formatMoney(fine.arrearsAmount, {
                              currency: fine.currency,
                            }),
                          })}
                        </p>
                        {fine.waiverReason && (
                          <p className="mt-1 text-xs italic text-ink-muted">
                            {fill(copy.waivedBecause, { reason: fine.waiverReason })}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatMoney(fine.amount, { currency: fine.currency })}
                      </TableCell>

                      <TableCell>
                        <StatePill
                          status={fine.status}
                          label={copy.state[fine.status]}
                        />
                      </TableCell>

                      <TableCell className="text-sm text-ink-muted">
                        <span className="whitespace-nowrap">
                          {formatDate(fine.assessedAt, locale)}
                        </span>
                        <p className="font-mono text-xs">{fine.reference}</p>
                      </TableCell>

                      <TableCell className="text-right">
                        <ActionGroup>
                          {fine.canSettle && canActOnContribution && (
                            <SettleFineAction
                              fineId={fine.id}
                              amount={fine.amount}
                              currency={fine.currency}
                            />
                          )}
                          {mayWaive && (
                            <WaiveFineAction
                              fineId={fine.id}
                              kind={fine.kind}
                              amount={fine.amount}
                              currency={fine.currency}
                            />
                          )}
                        </ActionGroup>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrapper>

          <PaginationLinks
            page={fines.page}
            pageSize={fines.pageSize}
            total={fines.total}
            totalPages={fines.totalPages}
          />
        </>
      )}

      {/* Said once, at the foot, rather than as a disabled button on every
          warehouse row: the reason those rows offer no "collect" is that the
          money path runs through the credit, not through savings. */}
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.warehouseSettleNote}
      </p>
    </div>
  );
}

type FinesCopy = Awaited<ReturnType<typeof getDashboardCopy>>["d"]["rules"]["fines"];

/** What the fine was raised for, in the terms of the rule that raised it. */
function describe(fine: FineRow, copy: FinesCopy): string {
  if (fine.kind === "CONTRIBUTION") {
    return pluralize(copy.whyContribution, fine.missedDays ?? 0, {
      days: fine.missedDays ?? 0,
    });
  }

  return pluralize(copy.whyWarehouse, fine.daysLate ?? 0, {
    number: fine.installmentNumber ?? 0,
    days: fine.daysLate ?? 0,
  });
}

/** Which rulebook raised it. Colour and word together, never colour alone. */
function KindPill({ kind, label }: { kind: FineKind; label: string }) {
  const tone =
    kind === "CONTRIBUTION"
      ? "border-gold/40 bg-gold/10 text-amber-800"
      : "border-primary/30 bg-primary/10 text-primary";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function StatePill({ status, label }: { status: FineStatus; label: string }) {
  const tone = {
    OUTSTANDING: "border-red-300 bg-red-50 text-red-700",
    SETTLED: "border-success/30 bg-success/10 text-emerald-700",
    WAIVED: "border-ink/12 bg-ink/[0.04] text-ink-muted",
    CANCELLED: "border-ink/12 bg-ink/[0.04] text-ink-muted",
  }[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}
