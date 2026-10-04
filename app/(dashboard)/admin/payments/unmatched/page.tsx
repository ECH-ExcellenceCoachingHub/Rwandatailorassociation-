import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUnmatchedPayments } from "@/lib/services/admin-dashboard";
import { prisma } from "@/lib/db/prisma";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { UnmatchedPaymentsTable } from "@/components/dashboard/UnmatchedPaymentsTable";

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

/**
 * The unmatched payment queue.
 *
 * Every row here is money that reached the association's bank account but
 * could not be attributed to a member with enough confidence to credit
 * automatically. Until an administrator resolves it, a member has paid and
 * their balance does not show it — which is why this screen is one click from
 * the admin overview and carries a badge in the sidebar.
 */
export default async function UnmatchedPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requirePermission(
    PERMISSIONS.PAYMENTS_RECONCILE,
    "/admin/payments/unmatched"
  );

  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { d } = await getDashboardCopy();
  const copy = d.admin.payments;

  const [data, members] = await Promise.all([
    getUnmatchedPayments(associationId, page),
    // The member list for the manual-match picker. Only ACTIVE members can
    // receive money, so only they are offered. Searched in the browser, so
    // the cap is set well above any association's size.
    prisma.member.findMany({
      where: {
        ...(associationId ? { associationId } : {}),
        status: "ACTIVE",
      },
      select: {
        id: true,
        memberNumber: true,
        paymentReference: true,
        user: { select: { firstName: true, lastName: true, phone: true } },
      },
      orderBy: { memberNumber: "asc" },
      take: 5000,
    }),
  ]);

  const canMatch = context.permissions.has(PERMISSIONS.PAYMENTS_MATCH_MANUAL);
  // The page already requires PAYMENTS_RECONCILE to open, so anyone here may
  // clear the queue. Read explicitly rather than assumed, so tightening the
  // page guard later cannot silently widen who can delete.
  const canDelete = context.permissions.has(PERMISSIONS.PAYMENTS_RECONCILE);

  return (
    <div>
      <PageHeader
        title={copy.unmatchedTitle}
        description={copy.unmatchedDescription}
      />

      {data.total === 0 ? (
        <EmptyState
          icon={Link2}
          title={copy.unmatchedNoneTitle}
          description={copy.unmatchedNoneBody}
        />
      ) : (
        <>
          <Alert variant="warning" className="mb-5">
            <strong className="font-semibold">
              {pluralize(copy.unmatchedCount, data.total)}
            </strong>{" "}
            {copy.unmatchedNotice}
          </Alert>

          <UnmatchedPaymentsTable
            payments={data.payments}
            members={members.map((m) => ({
              id: m.id,
              memberNumber: m.memberNumber,
              fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
              paymentReference: m.paymentReference,
              phone: m.user.phone,
            }))}
            canMatch={canMatch}
            canDelete={canDelete}
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
