import type { Metadata } from "next";
import { requireSite } from "@/lib/sites";
import { getPolicy } from "@/lib/services/rulebook";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import RegisterPageContent from "@/components/auth/RegisterPageContent";
import { SiteFooter, SiteHeader } from "@/components/sites/SiteChrome";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.sites.association.apply };
}

/**
 * /abc/register — membership application for one association.
 *
 * The same form as RTA's /register, priced from this association's rulebook
 * and enrolling into this association: the code travels with the submission
 * (see RegisterForm), and the applicant waits for this association's own
 * administrator to approve them.
 */
export default async function AssociationRegisterPage({
  params,
}: {
  params: Promise<{ association: string }>;
}) {
  const { association, brand } = await requireSite((await params).association, "/rta/register");
  const [{ d, locale }, policy] = await Promise.all([
    getDashboardCopy(),
    getPolicy(association.id),
  ]);
  const copy = d.sites.association;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader brand={brand} locale={locale} signInLabel={copy.signIn} />
      <main className="flex-1">
        <RegisterPageContent
          sharePrice={policy.dailySavings}
          dailyFee={policy.platformFeePerDay}
          association={{ code: association.code, name: association.name }}
          backHref={brand.homeHref}
          loginHref={brand.loginHref}
          heading={fill(copy.registerTitle, { name: association.name })}
        />
      </main>
      <SiteFooter brand={brand} poweredByLabel={copy.poweredBy} />
    </div>
  );
}
