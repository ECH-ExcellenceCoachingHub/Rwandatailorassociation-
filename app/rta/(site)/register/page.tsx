import type { Metadata } from "next";
import { getPolicy } from "@/lib/services/rulebook";
import { getDashboardCopy } from "@/lib/i18n/server";
import { findRegistrationAssociation } from "@/lib/services/associations";
import RegisterPageContent from "@/components/auth/RegisterPageContent";
import { RTA_BRAND } from "@/lib/brand";

/**
 * RTA's membership application, at /rta/register. The old /register redirects
 * here (app/register/page.tsx), so every link handed out before RTA moved
 * under /rta still lands on this form.
 *
 * A server component only so the share price comes from the rulebook rather
 * than being written into the form: the committee can change the daily
 * saving, and an applicant choosing how many shares to take must see what each
 * one will actually cost them. Everything visible is in RegisterPageContent.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: d.sites.association.apply };
}

export default async function RtaRegisterPage() {
  // The same association the registration endpoint enrols into. With RTA not
  // active, the catalogue defaults stand in; the endpoint refuses the
  // submission anyway.
  const association = await findRegistrationAssociation(RTA_BRAND.key);
  const policy = await getPolicy(association?.id ?? null);

  return (
    <RegisterPageContent
      sharePrice={policy.dailySavings}
      dailyFee={policy.platformFeePerDay}
      association={association ? { code: association.code, name: association.name } : null}
      backHref={RTA_BRAND.homeHref}
      loginHref={RTA_BRAND.loginHref}
    />
  );
}
