import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { AssociationForm } from "@/components/dashboard/AssociationForm";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.newAssociation.title,
  };
}

export const dynamic = "force-dynamic";

export default async function NewAssociationPage() {
  await requireSuperAdmin("/super-admin/associations/new");

  const { d } = await getDashboardCopy();
  const copy = d.platform.newAssociation;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={copy.title} description={copy.description} />
      <AssociationForm />
    </div>
  );
}
