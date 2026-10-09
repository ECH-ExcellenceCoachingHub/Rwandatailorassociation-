import type { Metadata } from "next";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getReportBundle } from "@/lib/services/admin-queries";
import { getAdminDashboard } from "@/lib/services/admin-dashboard";
import { getServiceFeeSummary } from "@/lib/services/member-payments";
import { formatMoney, subtract } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { DistrictReportPanel } from "@/components/dashboard/DistrictReportPanel";
import { GrowthReportCard } from "@/components/dashboard/GrowthReportCard";
import { buildDistrictReport } from "@/lib/services/district-report";
import { buildGrowthReport } from "@/lib/services/growth-report";
import {
  AlertTriangle,
  Clock,
  HandCoins,
  Landmark,
  PiggyBank,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.reports.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const context = await requirePermission(
    PERMISSIONS.REPORTS_VIEW_ASSOCIATION,
    "/admin/reports"
  );
  const associationId = resolveAssociationScope(context);
  const { d } = await getDashboardCopy();
  const copy = d.admin.reports;

  const [summary, reports, fees, districts] = await Promise.all([
    getAdminDashboard(associationId),
    getReportBundle(associationId),
    getServiceFeeSummary(associationId),
    buildDistrictReport(associationId),
  ]);
  // The downloads name every member's balance, so they need what the route
  // checks: export, and sight of all savings.
  const canDownloadDistricts =
    context.permissions.has(PERMISSIONS.REPORTS_EXPORT) &&
    context.permissions.has(PERMISSIONS.SAVINGS_VIEW_ALL);
  // Reuses the district rows already loaded — the register is scanned once.
  const growth = districts ? await buildGrowthReport(associationId, districts) : null;

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.savingsHeld}
          value={formatMoney(summary.savings.totalBalance)}
          hint={pluralize(copy.activeMembers, summary.members.active)}
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
          label={copy.members}
          value={String(summary.members.total)}
          hint={fill(copy.joinedThisMonth, {
            count: summary.members.joinedThisMonth,
          })}
          icon={Users}
        />
      </StatGrid>

      {/*
        The service fee is the platform's money, not the association's. Fees
        for days already paid are taken from savings by the nightly run, so
        until it runs "savings held" still includes them — the last card is
        the figure with them taken out.
      */}
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.feesTitle}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
            {copy.feesIntro}
          </p>
        </div>
        <StatGrid columns={4}>
          <StatCard
            label={copy.feesTaken}
            value={formatMoney(fees.taken)}
            hint={copy.feesTakenHint}
            icon={Receipt}
            tone="primary"
          />
          <StatCard
            label={copy.feesPending}
            value={formatMoney(fees.pending)}
            hint={fill(copy.feesPendingHint, { count: fees.pendingMembers })}
            icon={Clock}
            tone={fees.pendingMembers > 0 ? "warning" : "success"}
          />
          <StatCard
            label={copy.feesOwedToPlatform}
            value={formatMoney(fees.owedToPlatform)}
            hint={fill(copy.feesOwedToPlatformHint, {
              amount: formatMoney(fees.paidOver),
            })}
            icon={Landmark}
          />
          <StatCard
            label={copy.savingsAfterFees}
            value={formatMoney(subtract(summary.savings.totalBalance, fees.pending))}
            hint={copy.savingsAfterFeesHint}
            icon={Wallet}
            tone="success"
          />
        </StatGrid>
      </section>

      {growth && (
        // The card is a fixed-width sheet, so a narrow screen scrolls it
        // rather than squeezing the design the PNG is captured from.
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <GrowthReportCard report={growth} />
        </div>
      )}

      {districts && (
        <DistrictReportPanel report={districts} canDownload={canDownloadDistricts} />
      )}

      <ReportsView data={reports} />
    </div>
  );
}
