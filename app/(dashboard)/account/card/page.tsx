import type { Metadata } from "next";
import { IdCard } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getDashboardCopy } from "@/lib/i18n/server";
import { renderQrSvg } from "@/lib/qr";
import {
  getMembershipCardData,
  getCardTextSizes,
} from "@/lib/cards/membership-card";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { Alert } from "@/components/ui/alert";
import { CardPhotoUpload } from "@/components/account/CardPhotoUpload";
import { CardDownloadButton } from "@/components/account/CardDownloadButton";
import { CardFrontPreview, CardBackPreview } from "@/components/account/CardPreview";

/**
 * The membership card page.
 *
 * The two sides are offered as separate downloads because that is how a card
 * is actually produced: a print shop runs the fronts, then reloads and runs
 * the backs. Bundling both into one PDF would make the common case harder.
 *
 * `force-dynamic` and `noindex` for the same reason as the QR page — the front
 * of the card embeds a sign-in credential, and nothing about it should be
 * cached by a proxy or reachable from a search engine.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.account.card.title} | RTA Savings & Loans`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function AccountCardPage() {
  const context = await requireAuth("/account/card");
  const { d } = await getDashboardCopy();
  const copy = d.account.card;

  // Only whether one exists — the bytes belong in the <img> the browser
  // fetches from the avatar route, not in this page's payload.
  const [photo, card] = await Promise.all([
    prisma.userAvatar.findUnique({
      where: { userId: context.user.id },
      select: { userId: true },
    }),
    getMembershipCardData(context.user.id),
  ]);
  const sizes = await getCardTextSizes(card);

  // The QR is drawn here, on the server, and handed to the preview as finished
  // markup — the same reasoning as the QR page. The token never reaches a JSON
  // response or the client bundle; it exists in this page's markup and nowhere
  // else. A data URI rather than inline SVG because an <image> inside the
  // preview's own SVG cannot host a nested document.
  const qrSvg = await renderQrSvg(card.qrUrl, { size: 512 });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title={copy.title} description={copy.description} />

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.previewTitle}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {copy.previewBody}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <figure className="m-0">
            <CardFrontPreview
              displayName={card.displayName}
              title={card.title}
              phone={card.phone}
              qrDataUri={qrDataUri}
              photoUrl={photo ? "/api/account/avatar" : null}
              sizes={sizes}
            />
            <figcaption className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {copy.frontTitle}
            </figcaption>
          </figure>

          <figure className="m-0">
            <CardBackPreview />
            <figcaption className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {copy.backTitle}
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <CardDownloadButton
          side="front"
          title={copy.frontTitle}
          body={copy.frontBody}
          icon="front"
        />
        <CardDownloadButton
          side="back"
          title={copy.backTitle}
          body={copy.backBody}
          icon="back"
        />
      </div>

      <CardPhotoUpload hasPhoto={Boolean(photo)} />

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
          <IdCard className="size-4 text-primary" aria-hidden="true" />
          {copy.officeTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {copy.officeBody}
        </p>
      </div>

      <Alert variant="info" title={copy.printTitle}>
        {copy.printBody}
      </Alert>
    </div>
  );
}
