import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getOwnProfileForEdit } from "@/lib/services/profile";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/account/ProfileForm";

/**
 * Editing your own details.
 *
 * Lives under /account rather than /dashboard because everyone with a sign-in
 * has details to correct, and /dashboard is the member's money. An
 * administrator who does not save with the association never visits
 * /dashboard and would have had nowhere to fix their own phone number.
 *
 * `requireAuth` is the whole guard. There is no id in the URL and none is
 * accepted by the endpoint behind the form: the session decides whose record
 * is written, so this page cannot be pointed at anybody else.
 */

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.account.edit.title,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function EditOwnProfilePage() {
  const context = await requireAuth("/account/profile");
  const { d } = await getDashboardCopy();
  const copy = d.account.edit;

  const profile = await getOwnProfileForEdit(context.user.id);

  // The guard guarantees a user record exists; a miss here means it was
  // deleted between the session check and this query.
  if (!profile) notFound();

  // A member's read-only file is the page they came from and the page that now
  // shows the change. Staff without one have no such page, so they go back to
  // their account status, which is where their own details are displayed.
  const returnTo = profile.hasMemberRecord ? "/dashboard/profile" : "/account/status";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={returnTo}>
              {profile.hasMemberRecord ? copy.backToProfile : d.account.status.title}
            </Link>
          </Button>
        }
      />

      <ProfileForm profile={profile} returnTo={returnTo} />

      {profile.hasMemberRecord && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="font-heading text-base font-semibold text-ink">
            {copy.adminOnlyTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {copy.adminOnlyBody}
          </p>
        </section>
      )}
    </div>
  );
}
