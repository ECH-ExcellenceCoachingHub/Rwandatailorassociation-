import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { HandCoins, PiggyBank } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { listPoolDeductions } from "@/lib/services/pool-deductions";
import { add, formatMoney, toMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { PoolDeductionCard } from "@/components/dashboard/PoolDeductionCard";
import { NewPoolDeductionButton } from "@/components/dashboard/PoolDeductionForm";

/**
 * Money taken out of the members' pool, from the committee's side.
 *
 * The same cards members see on their own association page, so an officer
 * writing a reason can see exactly how it will read to the people whose
 * balances it explains.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.admin.poolDeductions.title };
}

export const dynamic = "force-dynamic";

export default async function AdminPoolDeductionsPage() {
  const context = await requirePermission(
    PERMISSIONS.POOL_DEDUCTIONS_VIEW,
    "/admin/pool-deductions"
  );
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.poolDeductions;

  const currency = context.association?.currency ?? "RWF";
  const canPost =
    Boolean(associationId) && context.permissions.has(PERMISSIONS.POOL_DEDUCTIONS_POST);

  const [deductions, members] = await Promise.all([
    listPoolDeductions(associationId),
    canPost
      ? prisma.member.findMany({
          where: { associationId: associationId!, status: { in: ["ACTIVE", "SUSPENDED", "INACTIVE"] } },
          orderBy: { memberNumber: "asc" },
          select: {
            id: true,
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const beneficiaries = members.map((member) => ({
    id: member.id,
    memberNumber: member.memberNumber,
    name: `${member.user.firstName} ${member.user.lastName}`.trim(),
  }));

  const totalTaken = deductions.reduce((sum, row) => add(sum, row.totalAmount), toMoney(0));
  const newButton = canPost ? (
    <NewPoolDeductionButton members={beneficiaries} currency={currency} />
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} actions={newButton} />

      <StatGrid columns={2}>
        <StatCard
          label={copy.totalTaken}
          value={formatMoney(totalTaken, { currency })}
          icon={PiggyBank}
          tone="primary"
        />
        <StatCard
          label={copy.deductionsCount}
          value={String(deductions.length)}
          icon={HandCoins}
        />
      </StatGrid>

      <Alert variant="info">
        {copy.memberViewNote}{" "}
        <Link href="/dashboard/association" className="font-semibold underline">
          {d.nav.ourMoney}
        </Link>
      </Alert>

      {deductions.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={copy.noneTitle}
          description={copy.noneBody}
          action={newButton}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {deductions.map((deduction) => (
            <PoolDeductionCard
              key={deduction.id}
              deduction={deduction}
              d={d}
              locale={locale}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
