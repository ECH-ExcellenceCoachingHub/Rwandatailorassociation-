import type { Metadata } from "next";
import { Activity, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listJobRuns } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDateTime } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import { parsePage } from "@/lib/validation/filters";
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
    title: d.platform.jobs.title,
  };
}

export const dynamic = "force-dynamic";

/** Units, not words — the same in both languages. */
function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export default async function PlatformJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; jobName?: string }>;
}) {
  await requireSuperAdmin("/super-admin/jobs");
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.jobs;

  const jobName =
    params.jobName && params.jobName !== "ALL" ? params.jobName : undefined;

  const data = await listJobRuns({ page: parsePage(params.page), jobName });

  const failing = data.latestByJob.filter((job) => job.status === "FAILED");
  const running = data.latestByJob.filter((job) => job.status === "RUNNING");
  const succeeded24h = data.last24h.SUCCESS ?? 0;
  const failed24h = data.last24h.FAILED ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {failing.length > 0 && (
        <Alert variant="error" title={copy.failingTitle}>
          {fill(copy.failingBody, {
            jobs: failing.map((job) => job.jobName).join(", "),
          })}
        </Alert>
      )}

      {data.total === 0 && (
        <Alert variant="warning" title={copy.neverRanTitle}>
          {copy.neverRanBody}
        </Alert>
      )}

      <StatGrid columns={4}>
        <StatCard
          label={copy.succeeded24h}
          value={String(succeeded24h)}
          hint={copy.completedCleanly}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label={copy.failed24h}
          value={String(failed24h)}
          hint={failed24h > 0 ? copy.investigateBelow : copy.noFailures}
          icon={TriangleAlert}
          tone={failed24h > 0 ? "danger" : "success"}
        />
        <StatCard
          label={copy.currentlyRunning}
          value={String(running.length)}
          hint={running.map((j) => j.jobName).join(", ") || copy.idle}
          icon={Clock}
        />
        <StatCard
          label={copy.distinctJobs}
          value={String(data.jobNames.length)}
          hint={pluralize(copy.runsRecorded, data.total)}
          icon={Activity}
          tone="primary"
        />
      </StatGrid>

      {/* Health per job, since an old success does not offset a recent failure. */}
      {data.latestByJob.length > 0 && (
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
            {copy.latestRuns}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.latestByJob.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-border bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading text-sm font-semibold text-ink">
                    {job.jobName}
                  </h3>
                  <StatusBadge status={job.status} size="sm" />
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {formatDateTime(job.startedAt, locale)} ·{" "}
                  {formatDuration(job.durationMs)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {fill(copy.processedLine, {
                    processed: job.itemsProcessed,
                    ok: job.itemsSucceeded,
                  })}
                  <span className={job.itemsFailed > 0 ? "text-red-600" : ""}>
                    {job.itemsFailed} {copy.colFailed.toLowerCase()}
                  </span>
                </p>
                {job.errorMessage && (
                  <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                    {job.errorMessage}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <SearchFilterForm
        action="/super-admin/jobs"
        showSearch={false}
        selects={[
          {
            name: "jobName",
            label: copy.job,
            value: jobName,
            options: [
              { value: "ALL", label: copy.allJobs },
              ...data.jobNames.map((j) => ({
                value: j.jobName,
                label: `${j.jobName} (${j.runs})`,
              })),
            ],
            width: "lg:w-72",
          },
        ]}
      />

      {data.runs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.job}</TableHead>
                <TableHead>{copy.colStarted}</TableHead>
                <TableHead>{copy.colDuration}</TableHead>
                <TableHead align="right">{copy.colProcessed}</TableHead>
                <TableHead align="right">{copy.colSucceeded}</TableHead>
                <TableHead align="right">{copy.colFailed}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium text-ink">
                    {run.jobName}
                    {run.cursor && (
                      <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                        cursor: {run.cursor.slice(0, 30)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDateTime(run.startedAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {formatDuration(run.durationMs)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {run.itemsProcessed}
                  </TableCell>
                  <TableCell align="right" tabular className="text-emerald-700">
                    {run.itemsSucceeded}
                  </TableCell>
                  <TableCell align="right" tabular>
                    <span className={run.itemsFailed > 0 ? "text-red-600" : ""}>
                      {run.itemsFailed}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} size="sm" />
                    {run.errorMessage && (
                      <span className="mt-1 block max-w-[240px] truncate text-[11px] text-red-600">
                        {run.errorMessage}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationLinks
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </TableWrapper>
      )}
    </div>
  );
}
