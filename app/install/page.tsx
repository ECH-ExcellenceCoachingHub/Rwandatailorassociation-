import { InstallPage, installMetadata } from "@/components/pwa/InstallPage";
import { PLATFORM_BRAND } from "@/lib/brand";

/** /install — the SSPSG app. Each association's is at /abc/install. */
export function generateMetadata() {
  return installMetadata(PLATFORM_BRAND);
}

export default function PlatformInstallPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  return <InstallPage brand={PLATFORM_BRAND} searchParams={searchParams} />;
}
