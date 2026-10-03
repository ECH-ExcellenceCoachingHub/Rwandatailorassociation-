import type { Metadata } from "next";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listPayments } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { PaymentsView } from "@/components/dashboard/PaymentsView";
import { parsePaymentStatus, parsePage } from "@/lib/validation/filters";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.payments.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    flagged?: string;
  }>;
}) {
  const context = await requirePermission(PERMISSIONS.PAYMENTS_VIEW, "/admin/payments");
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  const search = params.q?.trim() || undefined;
  const status = parsePaymentStatus(params.status);
  const suspiciousOnly = params.flagged === "1";

  const data = await listPayments(associationId, {
    page: parsePage(params.page),
    search,
    status,
    suspiciousOnly,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.admin.payments.title}
        description={d.admin.payments.description}
      />
      <PaymentsView
        data={data}
        basePath="/admin/payments"
        search={search}
        status={status}
        suspiciousOnly={suspiciousOnly}
        unmatchedPath="/admin/payments/unmatched"
        memberPaymentsPath="/admin/payments/member"
      />
    </div>
  );
}
