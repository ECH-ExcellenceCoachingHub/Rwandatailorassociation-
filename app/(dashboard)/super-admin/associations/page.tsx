import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, HandCoins, PiggyBank, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listAssociations } from "@/lib/services/associations";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { AssociationStatus } from "@/lib/generated/prisma/enums";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.associations.title,
  };
}

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["PENDING", "ACTIVE", "SUSPENDED", "ARCHIVED"]);

/**
 * Tenant directory.
 *
 * The one screen in the product that shows every association side by side, so
 * it is gated on role rather than permission: association admins have no
 * legitimate reading of another tenant's balances, however senior they are.
 */
export default async function SuperAdminAssociationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireSuperAdmin("/super-admin/associations");

  const params = await searchParams;
  const search = params.q?.trim() || undefined;
  const status =
    params.status && VALID_STATUS.has(params.status)
      ? (params.status as AssociationStatus)
      : undefined;

  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.associations;

  // The filter offers the tenant lifecycle states; the values are the enum the
  // database stores, so only the labels change with the language.
  const statusOptions = [
    { value: "ALL", label: copy.allStatuses },
    { value: "ACTIVE", label: copy.statusActive },
    { value: "PENDING", label: copy.statusPending },
    { value: "SUSPENDED", label: copy.statusSuspended },
    { value: "ARCHIVED", label: copy.statusArchived },
  ];

  const { associations, totals } = await listAssociations({ search, status });
  const filtered = Boolean(search || status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild size="sm">
            <Link href="/super-admin/associations/new">
              <Plus className="size-4" aria-hidden="true" />
              {d.platform.newAssociation.createButton}
            </Link>
          </Button>
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.count}
          value={String(totals.associations)}
          hint={fill(copy.activeCount, { count: totals.active })}
          icon={Building2}
          tone="primary"
        />
        <StatCard
          label={copy.members}
          value={totals.members.toLocaleString("en-US")}
          hint={filtered ? copy.acrossFiltered : copy.acrossAll}
          icon={Users}
        />
        <StatCard
          label={copy.savingsHeld}
          value={formatMoney(totals.savingsBalance)}
          hint={copy.savingsHint}
          icon={PiggyBank}
          tone="success"
        />
        <StatCard
          label={copy.loansOutstanding}
          value={formatMoney(totals.loansOutstanding)}
          hint={
            totals.unmatchedPayments > 0
              ? pluralize(copy.unmatchedHint, totals.unmatchedPayments)
              : copy.allAttributed
          }
          icon={HandCoins}
          tone={totals.unmatchedPayments > 0 ? "warning" : "default"}
        />
      </StatGrid>

      <SearchFilterForm
        action="/super-admin/associations"
        placeholder={copy.searchPlaceholder}
        search={search}
        selects={[
          {
            name: "status",
            label: d.common.status,
            value: status,
            options: statusOptions,
          },
        ]}
      />

      {associations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? copy.noMatchTitle : copy.noneTitle}
          description={filtered ? copy.noMatchBody : copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colAssociation}</TableHead>
                <TableHead>{d.common.status}</TableHead>
                <TableHead align="right">{copy.colMembers}</TableHead>
                <TableHead align="right">{copy.colSavings}</TableHead>
                <TableHead align="right">{copy.colLoansOwing}</TableHead>
                <TableHead align="right">{copy.colUnmatched}</TableHead>
                <TableHead align="right">{copy.colAdmins}</TableHead>
                <TableHead>{copy.colCreated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {associations.map((association) => (
                <TableRow key={association.id}>
                  <TableCell>
                    <span className="block font-medium text-ink">
                      {association.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {association.code}
                      {association.city ? ` · ${association.city}` : ""}
                      {` · ${association.currency}`}
                    </span>
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={association.status} size="sm" />
                  </TableCell>

                  <TableCell align="right" tabular>
                    {association.members.total}
                    {association.members.pendingApproval > 0 && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-amber-700">
                        {fill(copy.pendingSuffix, {
                          count: association.members.pendingApproval,
                        })}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(association.savingsBalance, {
                      currency: association.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(association.loans.outstanding, {
                      currency: association.currency,
                      showSymbol: false,
                    })}
                    {association.loans.overdueCount > 0 && (
                      <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-semibold text-red-600">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {fill(copy.overdueSuffix, {
                          count: association.loans.overdueCount,
                        })}
                      </span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    <span
                      className={
                        association.unmatchedPayments > 0
                          ? "text-amber-700"
                          : "text-ink-muted"
                      }
                    >
                      {association.unmatchedPayments}
                    </span>
                  </TableCell>

                  <TableCell align="right" tabular>
                    {association.admins}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(association.createdAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
