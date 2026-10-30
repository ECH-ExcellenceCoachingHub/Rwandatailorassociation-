import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listTransactions } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { TransactionsView } from "@/components/dashboard/TransactionsView";
import { parseTransactionType, parsePage } from "@/lib/validation/filters";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.transactions.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    type?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  await requireSuperAdmin("/super-admin/transactions");
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  const data = await listTransactions(null, {
    page: parsePage(params.page),
    type: parseTransactionType(params.type),
    from: params.from ? new Date(params.from) : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
    search: params.q?.trim() || undefined,
  });

  return (
    <div>
      <PageHeader
        title={d.platform.transactions.title}
        description={d.platform.transactions.description}
      />
      <TransactionsView data={data} basePath="/super-admin/transactions" />
    </div>
  );
}
