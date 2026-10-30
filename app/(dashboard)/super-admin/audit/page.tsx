import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { AuditLogTable } from "@/components/dashboard/AuditLogTable";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.audit.title,
  };
}

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  await requireSuperAdmin("/super-admin/audit");
  const params = await searchParams;
  const { d } = await getDashboardCopy();

  return (
    <div>
      <PageHeader
        title={d.platform.audit.title}
        description={d.platform.audit.description}
      />

      {/* null scope = platform-wide, which only a super admin ever gets. */}
      <AuditLogTable
        associationId={null}
        page={Math.max(1, Number(params.page) || 1)}
        action={params.action}
      />
    </div>
  );
}
