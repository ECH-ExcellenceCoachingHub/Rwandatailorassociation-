import { prisma } from "@/lib/db/prisma";
import { getPolicy } from "@/lib/services/rulebook";
import RegisterPageContent from "@/components/auth/RegisterPageContent";

/**
 * Membership registration.
 *
 * A server component only so the share price comes from the rulebook rather
 * than being written into the form: the committee can change the daily
 * saving, and an applicant choosing how many shares to take must see what each
 * one will actually cost them. Everything visible is in RegisterPageContent.
 */
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // The same association the registration endpoint enrols into. With none
  // active, the catalogue defaults stand in; the endpoint refuses the
  // submission anyway.
  const association = await prisma.association.findFirst({
    where: { code: "RTA", status: "ACTIVE" },
    select: { id: true },
  });
  const policy = await getPolicy(association?.id ?? null);

  return (
    <RegisterPageContent
      sharePrice={policy.dailySavings}
      dailyFee={policy.platformFeePerDay}
    />
  );
}
