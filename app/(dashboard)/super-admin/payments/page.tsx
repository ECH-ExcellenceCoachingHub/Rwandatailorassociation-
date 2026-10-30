import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guards";
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
    title: d.platform.payments.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    flagged?: string;
  }>;
}) {
  await requireSuperAdmin("/super-admin/payments");
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  const search = params.q?.trim() || undefined;
  const status = parsePaymentStatus(params.status);
  const suspiciousOnly = params.flagged === "1";

  // null scope = every association. Only a super admin ever reaches this.
  const data = await listPayments(null, {
    page: parsePage(params.page),
    search,
    status,
    suspiciousOnly,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.platform.payments.title}
        description={d.platform.payments.description}
      />
      <PaymentsView
        data={data}
        basePath="/super-admin/payments"
        search={search}
        status={status}
        suspiciousOnly={suspiciousOnly}
      />
    </div>
  );
}
