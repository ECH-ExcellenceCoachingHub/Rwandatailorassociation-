import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { signInRedirectPath } from "@/lib/auth/guards";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getSidebarBadges, getUnreadNotificationCount } from "@/lib/services/dashboard-badges";
import type { Metadata } from "next";
import { PLATFORM_BRAND, associationBrand, type Brand } from "@/lib/brand";

/**
 * Whose dashboard this is: the signed-in user's association, or the platform
 * for a super admin, who belongs to none. It ends every tab title and puts its
 * mark at the top of the sidebar.
 */
async function dashboardBrand(): Promise<Brand> {
  const context = await getAuthContext();
  return context?.association ? associationBrand(context.association) : PLATFORM_BRAND;
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await dashboardBrand();
  return { title: { template: `%s | ${brand.titleSuffix}`, default: brand.titleSuffix } };
}

/**
 * Shared shell for all three dashboards.
 *
 * Authentication is enforced here rather than left to middleware. Middleware
 * only inspects a signed cookie on the Edge runtime; this runs on the server
 * with the database available, so it sees suspensions and revoked sessions
 * immediately. Middleware is the fast path, this is the authority.
 *
 * Role-specific access (member vs admin vs super admin) is enforced again in
 * each area's own layout, so no page depends on this one alone.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAuthContext();

  if (!context) {
    const headerList = await headers();
    redirect(signInRedirectPath(headerList.get("x-pathname")));
  }

  // A member whose account exists but has not been approved has no savings
  // account to show. Send them somewhere that explains that, rather than
  // rendering a dashboard full of zeroes.
  if (context.user.role === "MEMBER" && context.member?.status === "PENDING_APPROVAL") {
    redirect("/pending-approval");
  }

  const [badges, unreadNotifications] = await Promise.all([
    getSidebarBadges(context),
    getUnreadNotificationCount(context.user.id),
  ]);

  return (
    <DashboardShell
      user={{
        fullName: context.user.fullName,
        email: context.user.email,
        role: context.user.role,
        avatarUrl: context.user.avatarUrl,
        memberNumber: context.member?.memberNumber ?? null,
      }}
      permissions={[...context.permissions]}
      associationName={context.association?.name ?? PLATFORM_BRAND.mark}
      brand={await dashboardBrand()}
      badges={badges}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </DashboardShell>
  );
}
