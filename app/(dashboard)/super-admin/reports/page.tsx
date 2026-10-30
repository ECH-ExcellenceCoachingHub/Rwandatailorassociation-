import type { Metadata } from "next";
import { AlertTriangle, Building2, HandCoins, PiggyBank } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getReportBundle } from "@/lib/services/admin-queries";
import { getAdminDashboard } from "@/lib/services/admin-dashboard";
import { listAssociations } from "@/lib/services/associations";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ReportsView } from "@/components/dashboard/ReportsView";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.reports.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformReportsPage() {
  await requireSuperAdmin("/super-admin/reports");
  const { d } = await getDashboardCopy();
  const copy = d.platform.reports;

  const [summary, reports, directory] = await Promise.all([
    getAdminDashboard(null),
    getReportBundle(null),
    listAssociations(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.savingsHeld}
          value={formatMoney(summary.savings.totalBalance)}
          hint={pluralize(copy.membersPlatformWide, summary.members.total)}
          icon={PiggyBank}
          tone="primary"
        />
        <StatCard
          label={copy.loansOutstanding}
          value={formatMoney(summary.loans.outstanding)}
          hint={pluralize(copy.activeLoans, summary.loans.activeCount)}
          icon={HandCoins}
        />
        <StatCard
          label={copy.inArrears}
          value={formatMoney(summary.loans.overdueAmount)}
          hint={fill(copy.overdueCount, { count: summary.loans.overdueCount })}
          icon={AlertTriangle}
          tone={summary.loans.overdueCount > 0 ? "danger" : "success"}
        />
        <StatCard
          label={copy.associations}
          value={String(directory.totals.associations)}
          hint={fill(copy.activeCount, { count: directory.totals.active })}
          icon={Building2}
          href="/super-admin/associations"
        />
      </StatGrid>

      {/* Per-tenant comparison: the one report an association admin can never
          see, and the reason this screen is separate from /admin/reports. */}
      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.byAssociation}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colAssociation}</TableHead>
                <TableHead align="right">{copy.colMembers}</TableHead>
                <TableHead align="right">{copy.colSavings}</TableHead>
                <TableHead align="right">{copy.colLoansOwing}</TableHead>
                <TableHead align="right">{copy.colOverdue}</TableHead>
                <TableHead align="right">{copy.colUnmatched}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directory.associations.map((association) => (
                <TableRow key={association.id}>
                  <TableCell>
                    <span className="block font-medium text-ink">
                      {association.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                      {association.code}
                    </span>
                  </TableCell>
                  <TableCell align="right" tabular>
                    {association.members.total}
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
                  </TableCell>
                  <TableCell align="right" tabular>
                    <span
                      className={
                        association.loans.overdueCount > 0
                          ? "text-red-600"
                          : "text-ink-muted"
                      }
                    >
                      {association.loans.overdueCount}
                    </span>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <ReportsView data={reports} />
    </div>
  );
}
