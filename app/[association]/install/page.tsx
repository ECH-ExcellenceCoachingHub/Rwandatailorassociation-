import type { Metadata } from "next";
import { InstallPage, installMetadata } from "@/components/pwa/InstallPage";
import { findSite, requireSite } from "@/lib/sites";
import { associationBrand } from "@/lib/brand";

/** /abc/install — the association's own app, in its name and with its logo. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ association: string }>;
}): Promise<Metadata> {
  const site = await findSite((await params).association);
  return site ? installMetadata(associationBrand(site)) : {};
}

export default async function AssociationInstallPage({
  params,
  searchParams,
}: {
  params: Promise<{ association: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { brand } = await requireSite((await params).association, "/rta/install");
  return <InstallPage brand={brand} searchParams={searchParams} />;
}
