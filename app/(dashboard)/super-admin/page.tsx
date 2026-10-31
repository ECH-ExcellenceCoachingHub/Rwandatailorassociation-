import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Gauge,
  HandCoins,
  Link2,
  PiggyBank,
  ShieldCheck,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getAdminDashboard } from "@/lib/services/admin-dashboard";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate, formatDateTime } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { getEnv } from "@/lib/env";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.overview.title,
  };
}

export const dynamic = "force-dynamic";

/**
 * Job failures in the last 24 hours.
 *
 * Lives outside the component because React's purity rule forbids calling
 * `Date.now()` during render — a component must be idempotent, and reading the
 * clock is not. Async server components render once per request so it would be
 * harmless here in practice, but keeping time-dependent work in a plain
 * function is the right shape regardless.
 */
async function countRecentJobFailures(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  return prisma.jobRun.count({ where: { status: "FAILED", startedAt: { gte: since } } });
}

/**
 * Super-admin platform overview.
 *
 * Answers the questions the brief poses for this role: what is happening
 * across the platform, which associations are active, are payments working,
 * are there errors, are there suspicious transactions.
 *
 * The integration and job-health panels matter most. A reconciliation job that
 * has quietly stopped running is invisible on every other screen in the system
 * — members simply stop being credited — so it is surfaced here explicitly.
 */
export default async function SuperAdminPage() {
  await requireSuperAdmin("/super-admin");
  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.overview;

  // Platform-wide: null scope means no association filter.
  const [platform, associations, recentJobs, failedJobs, suspicious, admins, integrityFailures] =
    await Promise.all([
      getAdminDashboard(null),

      prisma.association.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          currency: true,
          createdAt: true,
          _count: { select: { members: true, loans: true } },
        },
      }),

      prisma.jobRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 12,
        select: {
          id: true,
          jobName: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          itemsProcessed: true,
          itemsFailed: true,
          errorMessage: true,
        },
      }),

      countRecentJobFailures(),

      prisma.payment.count({ where: { isSuspicious: true } }),

      prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" } }),

      // Was the last integrity sweep clean?
      prisma.jobRun.findFirst({
        where: { jobName: "ledger-integrity-check" },
        orderBy: { startedAt: "desc" },
        select: { itemsFailed: true, startedAt: true, status: true },
      }),
    ]);

  const env = getEnv();
  const totalSavings = platform.savings.totalBalance;

  // Any job whose last run failed, keyed by name.
  const lastRunByJob = new Map<string, (typeof recentJobs)[number]>();
  for (const job of recentJobs) {
    if (!lastRunByJob.has(job.jobName)) lastRunByJob.set(job.jobName, job);
  }
  const stalledJobs = [...lastRunByJob.values()].filter((j) => j.status === "FAILED");

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      {/* System health first — this is what a super admin is here for. */}
      {env.JENGA_MODE === "sandbox" && (
        <Alert variant="warning" title={copy.sandboxTitle}>
          {copy.sandboxBody}
        </Alert>
      )}

      {integrityFailures && integrityFailures.itemsFailed > 0 && (
        <Alert variant="error" title={copy.integrityTitle}>
          {pluralize(copy.integrityBody, integrityFailures.itemsFailed)}
        </Alert>
      )}

      {stalledJobs.length > 0 && (
        <Alert variant="error" title={copy.stalledJobsTitle}>
          {fill(copy.stalledJobsBody, {
            jobs: stalledJobs.map((j) => j.jobName).join(", "),
          })}
        </Alert>
      )}

      {suspicious > 0 && (
        <Alert variant="warning" title={copy.suspiciousTitle}>
          {pluralize(copy.suspiciousBody, suspicious)}
        </Alert>
      )}

      {/* Platform financials */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-ink-muted">
          {copy.financials}
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label={copy.totalSavings}
            value={formatMoney(totalSavings)}
            hint={pluralize(copy.membersAcross, associations.length, {
              members: platform.members.total,
            })}
            icon={PiggyBank}
            tone="primary"
          />
          <StatCard
            label={copy.loansOutstanding}
            value={formatMoney(platform.loans.outstanding)}
            hint={fill(copy.activeCount, { count: platform.loans.activeCount })}
            icon={HandCoins}
          />
          <StatCard
            label={copy.inArrears}
            value={formatMoney(platform.loans.overdueAmount)}
            hint={pluralize(copy.overdueLoans, platform.loans.overdueCount)}
            icon={AlertTriangle}
            tone={platform.loans.overdueCount > 0 ? "danger" : "success"}
          />
          <StatCard
            label={copy.collectedToday}
            value={formatMoney(platform.savings.depositsToday)}
            hint={pluralize(
              copy.transactionsToday,
              platform.savings.transactionsToday
            )}
            icon={CreditCard}
            tone="success"
          />
        </StatGrid>
      </section>

      {/* Operational health */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-ink-muted">
          {copy.systemHealth}
        </h2>
        <StatGrid columns={4}>
          <StatCard
            label={copy.unmatchedPayments}
            value={String(platform.payments.unmatchedCount)}
            hint={formatMoney(platform.payments.unmatchedAmount)}
            icon={Link2}
            tone={platform.payments.unmatchedCount > 0 ? "warning" : "success"}
          />
          <StatCard
            label={copy.failedPayments}
            value={String(platform.payments.failedCount)}
            hint={copy.rejectedAtVerification}
            icon={AlertTriangle}
            tone={platform.payments.failedCount > 0 ? "warning" : "success"}
          />
          <StatCard
            label={copy.jobFailures}
            value={String(failedJobs)}
            hint={copy.jobRunsHint}
            icon={Activity}
            tone={failedJobs > 0 ? "danger" : "success"}
            href="/super-admin/jobs"
          />
          <StatCard
            label={copy.activeAdministrators}
            value={String(admins)}
            hint={copy.adminsHint}
            icon={ShieldCheck}
            href="/super-admin/admins"
          />
        </StatGrid>
      </section>

      {/* Associations */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.associations}
          </h2>
          <Link
            href="/super-admin/associations"
            className="text-sm font-semibold text-primary hover:underline"
          >
            {copy.manage}
          </Link>
        </div>

        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colAssociation}</TableHead>
                <TableHead>{copy.colCode}</TableHead>
                <TableHead align="right">{copy.colMembers}</TableHead>
                <TableHead align="right">{copy.colLoans}</TableHead>
                <TableHead>{copy.colCurrency}</TableHead>
                <TableHead>{d.common.status}</TableHead>
                <TableHead>{copy.colCreated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {associations.map((association) => (
                <TableRow key={association.id}>
                  <TableCell className="font-medium text-ink">
                    {association.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-ink-muted">
                    {association.code}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {association._count.members}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {association._count.loans}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {association.currency}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={association.status} size="sm" />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(association.createdAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      {/* Background jobs */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.recentJobs}
          </h2>
          <Link
            href="/super-admin/jobs"
            className="text-sm font-semibold text-primary hover:underline"
          >
            {d.common.viewAll}
          </Link>
        </div>

        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colJob}</TableHead>
                <TableHead>{copy.colStarted}</TableHead>
                <TableHead>{copy.colDuration}</TableHead>
                <TableHead align="right">{copy.colProcessed}</TableHead>
                <TableHead align="right">{copy.colFailed}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.length === 0 ? (
                <TableEmpty colSpan={6}>{copy.noJobs}</TableEmpty>
              ) : (
                recentJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-ink">{job.jobName}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDateTime(job.startedAt, locale)}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : "—"}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {job.itemsProcessed}
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span className={job.itemsFailed > 0 ? "text-red-600" : ""}>
                        {job.itemsFailed}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} size="sm" />
                      {job.errorMessage && (
                        <span className="mt-1 block max-w-[240px] truncate text-[11px] text-red-600">
                          {job.errorMessage}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <QuickLink
          href="/super-admin/audit"
          icon={Activity}
          title={copy.quickAuditTitle}
          detail={copy.quickAuditDetail}
        />
        <QuickLink
          href="/super-admin/associations"
          icon={Building2}
          title={copy.quickAssociationsTitle}
          detail={copy.quickAssociationsDetail}
        />
        <QuickLink
          href="/super-admin/admins"
          icon={Users}
          title={copy.quickAdminsTitle}
          detail={copy.quickAdminsDetail}
        />
      </section>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof Gauge;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-lift"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
      </span>
    </Link>
  );
}
