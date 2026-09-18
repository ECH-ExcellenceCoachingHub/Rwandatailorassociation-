import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assertSameAssociation,
  requirePermission,
} from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getMemberProfile } from "@/lib/services/members";
import { getPolicy } from "@/lib/services/rulebook";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { MemberForm } from "@/components/dashboard/MemberForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const member = await getMemberProfile(id);
  return {
    title: member
      ? `Edit ${member.user.firstName} ${member.user.lastName} | RTA`
      : "Edit member | RTA",
  };
}

/** Null — never asked — stays blank rather than reading as "no". */
function yesNo(value: boolean | null): string {
  return value === null ? "" : value ? "YES" : "NO";
}

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePermission(
    PERMISSIONS.MEMBERS_UPDATE,
    `/admin/members/${id}/edit`
  );

  const member = await getMemberProfile(id);
  if (!member) notFound();

  // The id came from the URL, so tenant isolation is asserted after loading
  // rather than assumed.
  assertSameAssociation(context, member, "Member");

  const [{ d }, policy] = await Promise.all([
    getDashboardCopy(),
    getPolicy(member.associationId),
  ]);
  const copy = d.admin.members;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fill(copy.editTitle, {
          name: `${member.user.firstName} ${member.user.lastName}`.trim(),
        })}
        description={fill(copy.editDescription, { number: member.memberNumber })}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/members/${member.id}`}>{copy.backToFile}</Link>
          </Button>
        }
      />

      <MemberForm
        sharePrice={policy.dailySavings}
        member={{
          id: member.id,
          memberNumber: member.memberNumber,
          firstName: member.user.firstName,
          lastName: member.user.lastName,
          title: member.user.title ?? "",
          phone: member.user.phone ?? "",
          email: member.user.email ?? "",
          nationalId: member.nationalId ?? "",
          // The date input wants YYYY-MM-DD.
          dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? "",
          gender: member.gender ?? "",
          occupation: member.occupation ?? "",
          businessName: member.businessName ?? "",
          addressLine1: member.addressLine1 ?? "",
          city: member.city ?? "",
          district: member.district ?? "",
          province: member.province ?? "",
          mobileMoneyNumber: member.mobileMoneyNumber ?? "",
          bankAccountNumber: member.bankAccountNumber ?? "",
          nextOfKinName: member.nextOfKinName ?? "",
          nextOfKinPhone: member.nextOfKinPhone ?? "",
          nextOfKinRelation: member.nextOfKinRelation ?? "",
          successorName: member.successorName ?? "",
          successorPhone: member.successorPhone ?? "",
          successorRelation: member.successorRelation ?? "",
          successorNationalId: member.successorNationalId ?? "",
          sharesSubscribed: member.sharesSubscribed?.toString() ?? "",
          hasCompany: yesNo(member.hasCompany),
          hasProfessionalCertificate: yesNo(member.hasProfessionalCertificate),
          acceptsInterns: yesNo(member.acceptsInterns),
          internCapacity: member.internCapacity?.toString() ?? "",
        }}
      />
    </div>
  );
}
