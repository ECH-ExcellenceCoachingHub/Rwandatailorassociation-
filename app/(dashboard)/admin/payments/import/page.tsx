import type { Metadata } from "next";
import { Info } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/alert";
import { StatementImport } from "@/components/dashboard/StatementImport";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.import.title,
  };
}

export const dynamic = "force-dynamic";

export default async function StatementImportPage() {
  const context = await requirePermission(
    PERMISSIONS.PAYMENTS_RECONCILE,
    "/admin/payments/import"
  );
  const { d } = await getDashboardCopy();
  const copy = d.admin.import;

  const canImport = context.permissions.has(PERMISSIONS.PAYMENTS_MATCH_MANUAL);

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      {!canImport && (
        <Alert variant="warning" className="mb-5">
          {copy.noPermission}
        </Alert>
      )}

      <Alert variant="info" className="mb-5" title={copy.howTitle}>
        <ol className="mt-1 list-inside list-decimal space-y-1">
          <li>{copy.step1}</li>
          <li>{copy.step2}</li>
          <li>{copy.step3}</li>
          <li>{copy.step4}</li>
        </ol>
      </Alert>

      <StatementImport canImport={canImport} />

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="text-sm leading-relaxed text-ink-muted">
          <p>
            <strong className="text-ink">{copy.digitalOnly}</strong>
            {copy.digitalOnlyBody}
          </p>
          <p className="mt-2">{copy.reuploadSafe}</p>
          <p className="mt-2">{copy.creditsOnly}</p>
        </div>
      </div>
    </div>
  );
}
