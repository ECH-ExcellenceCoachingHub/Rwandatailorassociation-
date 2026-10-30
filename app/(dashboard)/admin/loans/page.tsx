import type { Metadata } from "next";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listLoans } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { LoanPortfolioView } from "@/components/dashboard/LoanPortfolioView";
import { parseLoanStatus, parsePage } from "@/lib/validation/filters";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.loans.title,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminLoansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const context = await requirePermission(PERMISSIONS.LOANS_VIEW_ALL, "/admin/loans");
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  const search = params.q?.trim() || undefined;
  const status = parseLoanStatus(params.status);

  const data = await listLoans(associationId, {
    page: parsePage(params.page),
    search,
    status,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.admin.loans.title}
        description={d.admin.loans.description}
      />
      <LoanPortfolioView
        data={data}
        basePath="/admin/loans"
        search={search}
        status={status}
        applicationsPath="/admin/loans/applications"
      />
    </div>
  );
}
