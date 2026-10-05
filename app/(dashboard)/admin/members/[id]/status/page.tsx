import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import {
  assertSameAssociation,
  requirePermission,
  resolveAssociationScope,
} from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getAccountStatusSummary } from "@/lib/services/account-status";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { AccountStatusView } from "@/components/account/AccountStatusView";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.admin.members.viewStatus} | RTA` };
}

// The point of the page is to show the member's figures as they stand now.
export const dynamic = "force-dynamic";

/**
 * A member's account status screen, as the member sees it at /account/status,
 * opened by an administrator from the register or the member's file.
 *
 * Read-only: the screen is rendered in preview mode, so guarantee requests
 * show without their answer buttons — only the member can answer those.
 */
export default async function AdminMemberStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePermission(
    PERMISSIONS.MEMBERS_VIEW,
    `/admin/members/${id}/status`
  );

  const member = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      associationId: true,
      status: true,
      association: { select: { currency: true } },
      user: { select: { firstName: true, lastName: true, status: true } },
    },
  });
  if (!member) notFound();

  // The id came from the URL: an admin of association A must not read a
  // member of association B by guessing a cuid.
  assertSameAssociation(context, member, "Member");
  resolveAssociationScope(context, member.associationId);

  const summary = await getAccountStatusSummary(member.id);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.members;
  const name = `${member.user.firstName} ${member.user.lastName}`.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">
            <Eye className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-ink">
              {fill(copy.statusPreviewTitle, { name })}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">{copy.statusPreviewBody}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={member.status} size="sm" />
              <StatusBadge status={member.user.status} size="sm" />
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={`/admin/members/${member.id}`}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {copy.backToFile}
          </Link>
        </Button>
      </div>

      <AccountStatusView
        summary={summary}
        copy={d.account.status}
        locale={locale}
        currency={summary?.currency ?? member.association?.currency ?? "RWF"}
        suspended={member.status === "SUSPENDED" || member.user.status === "SUSPENDED"}
        preview
        className="rounded-2xl"
      />
    </div>
  );
}
