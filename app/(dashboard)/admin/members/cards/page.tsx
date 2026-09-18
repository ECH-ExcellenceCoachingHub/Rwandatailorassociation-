import type { Metadata } from "next";
import Link from "next/link";
import { IdCard, ImageOff, Printer } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { renderQrSvg } from "@/lib/qr";
import {
  cardTextFor,
  createCardTextMeasurer,
  getOrIssueQrCodes,
} from "@/lib/cards/membership-card";
import {
  CARD_BATCH_SIZE,
  DEFAULT_CARD_STATUS,
  listCardRegister,
  parseCardFilters,
} from "@/lib/cards/register";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { MemberSearch } from "@/components/dashboard/MemberSearch";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import { CardPdfButton } from "@/components/dashboard/CardPdfButton";
import { CardFrontPreview } from "@/components/account/CardPreview";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";

/**
 * The card register: every member's card, for the office that prints them.
 *
 * Most members own no printer, so the association prints the cards and hands
 * them over. This is the page that makes that one job instead of a visit to
 * every member's file: the cards as they will print, which ones still lack a
 * photograph, which the office has already printed, and downloads for one
 * card or a whole batch.
 *
 * EACH CARD SHOWS ITS REAL QR CODE, because a card previewed without it is
 * not the card that prints, and the office cannot check what it cannot see.
 * An active member with no code yet is issued one here, exactly as their own
 * card page would, with the officer recorded as the actor. Members who are not
 * active get no code: they cannot sign in, so one would only be a live
 * credential for an account nobody should be using.
 *
 * The cost is that this screen holds working sign-in codes, which is why it
 * carries a warning and is never cached or indexed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.memberCards.title} | RTA`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/members/cards";

type SearchParams = { page?: string; q?: string; status?: string; photo?: string };

export default async function AdminMemberCardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.MEMBERS_VIEW, BASE_PATH);
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.memberCards;

  const filters = parseCardFilters(params);
  const register = await listCardRegister({
    associationId,
    filters,
    page: Number(params.page) || 1,
  });

  const measure = await createCardTextMeasurer();

  const codes = await getOrIssueQrCodes(
    register.cards.filter((card) => card.status === "ACTIVE").map((card) => card.holder),
    context.user
  );

  // Drawn on the server and handed to the preview as a data URI, as on the
  // member's own card page: the token reaches this page's markup and no JSON.
  const qrImages = new Map(
    await Promise.all(
      [...codes].map(async ([userId, code]) => {
        const svg = await renderQrSvg(code.url, { size: 512 });
        return [userId, `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`] as const;
      })
    )
  );

  // The filters exactly as the URL carries them, so the bulk route re-reads
  // them through the same parser and prints the same cards in the same order.
  const filterQuery = { q: params.q, status: params.status, photo: params.photo };

  const pageHref = (next: Partial<SearchParams>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filterQuery, ...next })) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `${BASE_PATH}?${query}` : BASE_PATH;
  };

  const batchHref = (side: "front" | "back", batch: number) => {
    const search = new URLSearchParams({ side, batch: String(batch) });
    for (const [key, value] of Object.entries(filterQuery)) {
      if (value) search.set(key, value);
    }
    return `/api/admin/cards?${search.toString()}`;
  };

  const photoOptions = [
    { value: undefined, label: copy.photoAny },
    { value: "missing", label: fill(copy.photoMissing, { count: register.missingPhotos }) },
    { value: "present", label: copy.photoPresent },
  ] as const;

  const batches = Array.from({ length: register.total ? register.totalPages : 0 }, (_, i) => {
    const batch = i + 1;
    const from = i * CARD_BATCH_SIZE + 1;
    return { batch, from, to: Math.min(batch * CARD_BATCH_SIZE, register.total) };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={copy.title}
        description={`${copy.description} ${pluralize(copy.matching, register.total)}`}
        className="mb-0"
      />

      <MemberSearch basePath={BASE_PATH} defaultStatus={DEFAULT_CARD_STATUS} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink">{copy.photoLabel}:</span>
        {photoOptions.map((option) => {
          const active = (filters.photo ?? undefined) === option.value;
          return (
            <Link
              key={option.label}
              href={pageHref({ photo: option.value, page: undefined })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-ink-muted hover:border-primary hover:text-primary"
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {register.total === 0 ? (
        <EmptyState icon={IdCard} title={copy.noneTitle} description={copy.noneBody} />
      ) : (
        <>
          <Alert variant="warning" title={copy.credentialTitle}>
            {copy.credentialBody}
          </Alert>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
              <Printer className="size-4 text-primary" aria-hidden="true" />
              {copy.bulkTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {fill(copy.bulkBody, { size: CARD_BATCH_SIZE })}
            </p>

            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {batches.map(({ batch, from, to }) => (
                <li
                  key={batch}
                  className={cn(
                    "flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                    batch === register.page && "bg-primary-50/60"
                  )}
                >
                  <span className="text-sm font-medium text-ink">
                    {fill(copy.batchLabel, { from, to })}
                    {batch === register.page && register.totalPages > 1 && (
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        ({copy.batchShown})
                      </span>
                    )}
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:w-64">
                    <CardPdfButton
                      href={batchHref("front", batch)}
                      label={copy.fronts}
                      fallbackName={`rta-cards-front-${from}-${to}.pdf`}
                      variant="primary"
                    />
                    <CardPdfButton
                      href={batchHref("back", batch)}
                      label={copy.backs}
                      fallbackName={`rta-cards-back-${from}-${to}.pdf`}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              <strong className="font-semibold text-ink">{copy.printTitle}.</strong>{" "}
              {copy.printBody}
            </p>
          </section>

          <p className="text-xs text-ink-muted">{copy.qrNote}</p>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {register.cards.map((card) => {
              const text = cardTextFor(card.user);
              const memberUrl = `/api/admin/members/${card.memberId}`;

              return (
                <li
                  key={card.memberId}
                  className="flex flex-col rounded-2xl border border-border bg-surface p-3 shadow-card"
                >
                  <CardFrontPreview
                    displayName={text.displayName}
                    title={text.title}
                    phone={text.phone}
                    qrDataUri={qrImages.get(card.holder.id) ?? null}
                    qrPlaceholder={copy.qrPlaceholder}
                    photoUrl={card.hasPhoto ? `${memberUrl}/photo` : null}
                    sizes={measure(text)}
                    clipId={`card-photo-${card.memberId}`}
                  />

                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/members/${card.memberId}`}
                        className="block truncate font-medium text-ink hover:text-primary"
                      >
                        {text.displayName}
                      </Link>
                      <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                        {card.memberNumber}
                      </span>
                    </div>
                    <StatusBadge status={card.status} size="sm" />
                  </div>

                  <div className="mt-2 flex flex-1 flex-wrap items-start gap-x-3 gap-y-1 text-xs">
                    {!qrImages.has(card.holder.id) && (
                      <span className="font-semibold text-ink-muted">{copy.noCode}</span>
                    )}
                    {!card.hasPhoto && (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                        <ImageOff className="size-3.5" aria-hidden="true" />
                        {copy.noPhoto}
                      </span>
                    )}
                    <span className="text-ink-muted">
                      {card.lastPrintedAt
                        ? fill(copy.lastPrinted, { date: formatDate(card.lastPrintedAt, locale) })
                        : copy.neverPrinted}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CardPdfButton
                      href={`${memberUrl}/card?side=front`}
                      label={copy.front}
                      fallbackName={`rta-card-front-${card.memberNumber}.pdf`}
                    />
                    <CardPdfButton
                      href={`${memberUrl}/card?side=back`}
                      label={copy.back}
                      fallbackName={`rta-card-back-${card.memberNumber}.pdf`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {register.totalPages > 1 && (
            <PaginationLinks
              page={register.page}
              pageSize={register.pageSize}
              total={register.total}
              totalPages={register.totalPages}
            />
          )}
        </>
      )}
    </div>
  );
}
