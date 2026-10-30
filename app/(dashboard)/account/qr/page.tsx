import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guards";
import { getActiveQrCode } from "@/lib/auth/qr-access";
import { renderQrSvg } from "@/lib/qr";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { QrCodeCard } from "@/components/account/QrCodeCard";
import { PLATFORM_NAME } from "@/lib/brand";

/**
 * The sign-in QR page, for every role.
 *
 * The image is rendered here, on the server, and handed to the client as
 * finished SVG. The token behind it is therefore never in a JSON response,
 * never in the client bundle and never in a fetch the browser could replay
 * from its network log — it exists in the page's markup and nowhere else.
 *
 * That is also why the page is `force-dynamic` and marked `noindex`: it
 * carries a credential, and nothing about it should ever be cached or crawled.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.account.qr.title,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function AccountQrPage() {
  const context = await requireAuth("/account/qr");
  const { d } = await getDashboardCopy();
  const copy = d.account.qr;

  const code = await getActiveQrCode(context.user.id);
  const svg = code ? await renderQrSvg(code.url, { size: 320 }) : null;

  // A member is known by their membership number; staff have none, so their
  // card carries the role instead of an empty line.
  const holderReference =
    context.member?.memberNumber ??
    (context.user.role === "SUPER_ADMIN" ? d.shell.superAdmin : d.shell.admin);

  return (
    <div className="max-w-4xl">
      <div className="print-hidden">
        <PageHeader title={copy.title} description={copy.description} />
      </div>

      <QrCodeCard
        svg={svg}
        issuedAt={code?.issuedAt.toISOString() ?? null}
        expiresAt={code?.expiresAt.toISOString() ?? null}
        daysUntilExpiry={code?.daysUntilExpiry ?? null}
        lastUsedAt={code?.lastUsedAt?.toISOString() ?? null}
        useCount={code?.useCount ?? 0}
        holderName={context.user.fullName}
        holderReference={holderReference}
        associationName={context.association?.name ?? PLATFORM_NAME}
      />
    </div>
  );
}
