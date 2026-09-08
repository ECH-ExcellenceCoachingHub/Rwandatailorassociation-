import type { Metadata } from "next";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { getBkConfig } from "@/lib/bk";
import { listBkPaymentClaims } from "@/lib/services/bk-claims";
import { getBkTransactionStats } from "@/lib/services/bk-transactions";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/alert";
import { BkEventsView } from "@/components/dashboard/BkEventsView";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.bk.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminBkEventsPage() {
  const context = await requirePermission(PERMISSIONS.BK_VIEW, "/admin/bk");
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.bk;

  const config = getBkConfig();
  const canClaim = context.permissions.has(PERMISSIONS.BK_CLAIM);
  const canSync = context.permissions.has(PERMISSIONS.BK_SYNC);

  const [claims, stats] = await Promise.all([
    associationId ? listBkPaymentClaims(associationId) : Promise.resolve([]),
    getBkTransactionStats(associationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {!canClaim && !canSync && (
        <Alert variant="warning">{copy.noPermission}</Alert>
      )}

      <BkEventsView
        copy={copy}
        locale={locale}
        config={{
          mode: config.mode,
          baseUrl: config.baseUrl,
          configured: config.configured,
          collectionAccount: config.collectionAccount ?? null,
        }}
        claims={claims.map((c) => ({
          ...c,
          expiryTime: c.expiryTime?.toISOString() ?? null,
          observedAt: c.observedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        }))}
        stats={stats}
        canClaim={canClaim}
        canSync={canSync}
      />
    </div>
  );
}
