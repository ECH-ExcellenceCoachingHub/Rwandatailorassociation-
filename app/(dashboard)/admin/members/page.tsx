import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, FileText, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMembers } from "@/lib/services/members";
import { allowedMemberActions } from "@/lib/member-actions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberSearch } from "@/components/dashboard/MemberSearch";
import { MembersRegister } from "@/components/dashboard/MembersRegister";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.members.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set([
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "EXITED",
  "REJECTED",
]);

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const context = await requirePermission(PERMISSIONS.MEMBERS_VIEW, "/admin/members");
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d } = await getDashboardCopy();
  const copy = d.admin.members;

  const data = await listMembers({
    associationId,
    page: Number(params.page) || 1,
    search: params.q?.trim() || undefined,
    status:
      params.status && VALID_STATUS.has(params.status)
        ? (params.status as MemberStatus)
        : undefined,
  });

  // The statement covers one association's ledger, so a super administrator
  // viewing the platform-wide register is not offered one. The route re-checks
  // both permissions.
  const canDownloadStatement =
    associationId !== null &&
    context.permissions.has(PERMISSIONS.SAVINGS_VIEW_ALL) &&
    context.permissions.has(PERMISSIONS.REPORTS_EXPORT);
  const canEnrol = context.permissions.has(PERMISSIONS.MEMBERS_CREATE);

  return (
    <div>
      <PageHeader
        title={copy.title}
        description={pluralize(copy.inRegister, data.total)}
        actions={
          canDownloadStatement || canEnrol ? (
            <>
              {/* Plain links rather than fetches, as on the member's own
                  statement page: the printable one needs a real document
                  window for print-to-PDF, the CSV the browser's download. */}
              {canDownloadStatement && (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href="/api/admin/members/statement?format=html"
                      target="_blank"
                      rel="noopener"
                      title={copy.statementHint}
                    >
                      <FileText className="size-3.5" aria-hidden="true" />
                      {copy.statement}
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href="/api/admin/members/statement?format=csv"
                      download
                      title={copy.statementCsvHint}
                      aria-label={copy.statementCsvHint}
                    >
                      <FileSpreadsheet className="size-3.5" aria-hidden="true" />
                      {copy.statementCsv}
                    </a>
                  </Button>
                </>
              )}
              {canEnrol && (
                <Button asChild size="sm">
                  <Link href="/admin/members/new">
                    <UserPlus className="size-3.5" aria-hidden="true" />
                    {copy.enrol}
                  </Link>
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <MemberSearch basePath="/admin/members" />

      {data.members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={copy.noneTitle}
          description={copy.noneBody}
          className="mt-5"
        />
      ) : (
        <MembersRegister
          members={data.members}
          allowed={allowedMemberActions(context.permissions)}
          canEdit={context.permissions.has(PERMISSIONS.MEMBERS_UPDATE)}
          viewerId={context.user.id}
          pagination={{
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            totalPages: data.totalPages,
          }}
        />
      )}
    </div>
  );
}
