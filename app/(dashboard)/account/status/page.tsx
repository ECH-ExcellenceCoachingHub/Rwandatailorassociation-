import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountStatusSummary } from "@/lib/services/account-status";
import { getDashboardCopy } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/alert";
import { EnrolAsMemberButton } from "@/components/account/EnrolAsMemberButton";
import { AccountStatusView } from "@/components/account/AccountStatusView";

/**
 * Account status — the first screen after a QR sign-in, and a page in its own
 * right the rest of the time. The dashboard shell leaves it bare (no sidebar,
 * no top bar), so the page paints its own full-screen background.
 *
 * It shows exactly what the by-laws (Art. 9, "Ibaruramari ry'amafaranga
 * y'abanyamuryango") say a member's record must carry, as three plain lists:
 *
 *   1. Who you are — names, member ID, telephone, shares held, total paid in.
 *   2. The approved loan and its guarantor — the amount taken, what has been
 *      repaid, what is left.
 *   3. Penalties.
 *
 * Every line is always shown, with a zero or "none" where there is nothing,
 * so a member never wonders whether a figure is missing or simply empty. The
 * only extras are the ones that ask the reader to act: a suspension or overdue
 * notice, and guarantee requests, which are answered on this page and nowhere
 * else.
 *
 * The screen itself is AccountStatusView, shared with the administrator's
 * view of the same member at /admin/members/[id]/status.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.account.status.title} | RTA Savings & Loans`,
    robots: { index: false, follow: false },
  };
}

// Balances must never come from a cache — this page exists to be trusted.
export const dynamic = "force-dynamic";

export default async function AccountStatusPage() {
  const context = await requireAuth("/account/status");
  const { d, locale } = await getDashboardCopy();
  const copy = d.account.status;

  const summary = context.member
    ? await getAccountStatusSummary(context.member.id)
    : null;

  const currency = summary?.currency ?? context.association?.currency ?? "RWF";
  const suspended =
    summary?.status === "SUSPENDED" || context.user.status === "SUSPENDED";

  // Staff who have no savings account yet, and the standing to open one. The
  // route handler re-checks every part of this.
  const canOpenSavings =
    !summary &&
    Boolean(context.user.associationId) &&
    context.permissions.has(PERMISSIONS.MEMBERS_CREATE);

  return (
    <AccountStatusView
      summary={summary}
      copy={copy}
      locale={locale}
      currency={currency}
      suspended={suspended}
      notice={
        !summary && (
          <Alert variant="info" title={copy.staffTitle}>
            {copy.staffBody}
            {canOpenSavings && <EnrolAsMemberButton />}
          </Alert>
        )
      }
    />
  );
}
