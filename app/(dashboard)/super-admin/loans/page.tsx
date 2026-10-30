import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guards";
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
    title: d.platform.loans.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformLoansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  await requireSuperAdmin("/super-admin/loans");
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  const search = params.q?.trim() || undefined;
  const status = parseLoanStatus(params.status);

  const data = await listLoans(null, {
    page: parsePage(params.page),
    search,
    status,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.platform.loans.title}
        description={d.platform.loans.description}
      />
      <LoanPortfolioView
        data={data}
        basePath="/super-admin/loans"
        search={search}
        status={status}
      />
    </div>
  );
}
