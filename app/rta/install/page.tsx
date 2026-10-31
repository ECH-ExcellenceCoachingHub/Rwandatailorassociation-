import { InstallPage, installMetadata } from "@/components/pwa/InstallPage";
import { RTA_BRAND } from "@/lib/brand";

/** /rta/install — RTA's own app, with its logo and the STGT name. */
export function generateMetadata() {
  return installMetadata(RTA_BRAND);
}

export default function RtaInstallPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  return <InstallPage brand={RTA_BRAND} searchParams={searchParams} />;
}
