import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { ArrowRight, Globe, Mail, MapPin, Phone } from "lucide-react";
import { findSite, requireSite } from "@/lib/sites";
import { getPolicy } from "@/lib/services/rulebook";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { SiteFooter, SiteHeader } from "@/components/sites/SiteChrome";

export const dynamic = "force-dynamic";

/** The home page's tab is just the association's name, with no suffix. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ association: string }>;
}): Promise<Metadata> {
  const site = await findSite((await params).association);
  return site ? { title: { absolute: site.name } } : {};
}

/**
 * A hosted association's home page, generated from its row and its rulebook.
 *
 * What it costs is read live from the rulebook rather than written here, so a
 * committee that changes the share price changes this page with it.
 */
export default async function AssociationHomePage({
  params,
}: {
  params: Promise<{ association: string }>;
}) {
  const { association, brand } = await requireSite((await params).association, "/rta");
  const [{ d, locale }, policy] = await Promise.all([
    getDashboardCopy(),
    getPolicy(association.id),
  ]);
  const copy = d.sites.association;
  const money = (value: string) => formatMoney(value, { currency: association.currency });

  const place = [association.district, association.city].filter(Boolean).join(", ");
  const contacts = [
    association.phone && { icon: Phone, label: association.phone, href: `tel:${association.phone}` },
    association.email && { icon: Mail, label: association.email, href: `mailto:${association.email}` },
    association.website && { icon: Globe, label: association.website, href: association.website },
    place && { icon: MapPin, label: place, href: null },
  ].filter(Boolean) as { icon: typeof Phone; label: string; href: string | null }[];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader brand={brand} locale={locale} signInLabel={copy.signIn} joinLabel={copy.apply} />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-footer">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-noise opacity-40" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-primary-light/20 blur-3xl"
          />
          <div className="container-page relative grid gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-24">
            <div>
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">
                {copy.eyebrow}
              </p>
              <h1 className="mt-4 text-balance font-heading text-4xl font-bold leading-tight text-white sm:text-5xl">
                {copy.headline}
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
                {fill(copy.lead, { name: association.name })}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {brand.registerHref && (
                  <Button asChild size="lg">
                    <Link href={brand.registerHref}>
                      {copy.apply}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outlineLight">
                  <Link href={brand.loginHref}>{copy.signIn}</Link>
                </Button>
              </div>
            </div>

            <div className="hidden justify-center lg:flex">
              <BrandMark
                brand={brand}
                size={220}
                priority
                className="size-[220px] shadow-2xl shadow-black/40 ring-8 ring-white/10"
              />
            </div>
          </div>
        </section>

        <section className="container-page px-4 py-14 sm:px-6">
          <h2 className="font-heading text-2xl font-bold text-ink">{copy.costTitle}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <CostCard label={copy.sharePrice} value={money(policy.dailySavings)} hint={copy.sharePriceHint} />
            <CostCard label={copy.fee} value={money(policy.platformFeePerDay)} hint={copy.feeHint} />
          </div>

          {contacts.length > 0 && (
            <div className="mt-12">
              <h2 className="font-heading text-2xl font-bold text-ink">{copy.contactTitle}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {contacts.map(({ icon: Icon, label, href }) => (
                  <li
                    key={label}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {href ? (
                      <a href={href} className="truncate font-medium text-ink hover:text-primary">
                        {label}
                      </a>
                    ) : (
                      <span className="truncate font-medium text-ink">{label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>

      <SiteFooter brand={brand} poweredByLabel={copy.poweredBy} />
    </div>
  );
}

function CostCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{hint}</p>
    </div>
  );
}
