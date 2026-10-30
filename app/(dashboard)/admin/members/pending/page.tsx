import type { Metadata } from "next";
import { UserCheck } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMembers } from "@/lib/services/members";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { PendingMembersTable } from "@/components/dashboard/PendingMembersTable";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.admin.members.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PendingMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requirePermission(
    PERMISSIONS.MEMBERS_APPROVE,
    "/admin/members/pending"
  );

  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d } = await getDashboardCopy();
  const copy = d.admin.members;

  const data = await listMembers({
    associationId,
    status: "PENDING_APPROVAL",
    page: Number(params.page) || 1,
  });

  return (
    <div>
      <PageHeader title={copy.pendingTitle} description={copy.pendingDescription} />

      {data.total === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={copy.pendingNoneTitle}
          description={copy.pendingNoneBody}
        />
      ) : (
        <>
          <Alert variant="info" className="mb-5">
            {copy.pendingNotice}
          </Alert>

          <PendingMembersTable
            members={data.members}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </>
      )}
    </div>
  );
}
