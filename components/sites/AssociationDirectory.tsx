import Link from "@/components/SiteLink";
import { ArrowUpRight, Building2, LogIn, MapPin, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { associationBrand } from "@/lib/brand";
import type { SitesCopy } from "@/lib/i18n/dashboard/sites";
import { Eyebrow } from "@/components/sites/PlatformSections";

type PlatformCopy = SitesCopy["platform"];

export interface PublicAssociation {
  code: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  district: string | null;
}

function placeOf(association: PublicAssociation) {
  return [association.district, association.city].filter(Boolean).join(", ");
}

/**
 * The directory on the platform's home, at #associations.
 *
 * Built for one association to fifty: a single association is shown as a wide
 * featured card beside a note that more are joining, so it reads as a launch
 * rather than an empty room; two or more fall into a compact, scannable grid.
 */
export function AssociationDirectory({
  associations,
  copy,
}: {
  associations: PublicAssociation[];
  copy: PlatformCopy;
}) {
  return (
    <section
      id="associations"
      aria-labelledby="associations-title"
      className="container-page scroll-mt-24 px-4 py-20 sm:px-6 lg:py-28"
    >
      <div className="max-w-3xl">
        <Eyebrow>{copy.associationsEyebrow}</Eyebrow>
        <h2
          id="associations-title"
          className="mt-4 text-balance font-heading text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl lg:text-5xl"
        >
          {copy.associationsTitle}
        </h2>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
          {copy.associationsLead}
        </p>
      </div>

      <div className="mt-12 lg:mt-14">
        {associations.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-border bg-surface/60 px-6 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-5 font-heading text-lg font-semibold text-ink">{copy.noAssociations}</p>
            <p className="mt-2 max-w-md text-pretty text-ink-muted">{copy.moreJoiningBody}</p>
          </div>
        ) : associations.length === 1 ? (
          <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
            <ul>
              <FeaturedCard association={associations[0]} copy={copy} />
            </ul>
            <JoiningNote copy={copy} />
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {associations.map((association) => (
              <CompactCard key={association.code} association={association} copy={copy} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Accepting({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-[#047857]">
      <span aria-hidden="true" className="relative flex size-2">
        <span className="platform-ping absolute inset-0 rounded-full bg-success" />
        <span className="relative size-2 rounded-full bg-success" />
      </span>
      {label}
    </span>
  );
}

function FeaturedCard({ association, copy }: { association: PublicAssociation; copy: PlatformCopy }) {
  const brand = associationBrand(association);
  const place = placeOf(association);

  return (
    <li className="platform-lift relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-9">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-28 size-80 rounded-full bg-primary-light/25 blur-3xl" />
        <div className="absolute -right-10 top-10 size-60 rounded-full bg-gold/15 blur-3xl" />
        <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]" />
      </div>

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <span className="relative w-fit">
          <span aria-hidden="true" className="absolute -inset-2 rounded-full bg-gradient-to-br from-gold/50 to-primary-light/50 blur-md" />
          <BrandMark brand={brand} size={96} className="relative size-20 ring-4 ring-surface sm:size-24" />
        </span>
        <div className="min-w-0">
          <Accepting label={copy.accepting} />
          <h3 className="mt-3 text-balance font-heading text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">
            {association.name}
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span className="rounded-md bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-primary">
              {association.code}
            </span>
            {place && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-primary/60" aria-hidden="true" />
                {place}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-8 grid gap-3 sm:mt-auto sm:flex sm:flex-wrap sm:pt-10">
        <Button asChild className="group">
          <Link href={brand.homeHref}>
            {copy.website}
            <ArrowUpRight
              className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={brand.loginHref}>
            <LogIn className="size-4" aria-hidden="true" />
            {copy.login}
          </Link>
        </Button>
        {brand.registerHref && (
          <Button asChild variant="ghost" className="text-primary hover:bg-primary-50">
            <Link href={brand.registerHref}>
              <UserPlus className="size-4" aria-hidden="true" />
              {copy.join}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function JoiningNote({ copy }: { copy: PlatformCopy }) {
  return (
    <aside className="relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-dashed border-primary/20 bg-background p-6 sm:p-8">
      <div aria-hidden="true" className="flex -space-x-3">
        {["from-primary to-primary-light", "from-gold to-[#efd28e]", "from-[#173a6d] to-primary"].map((tone, i) => (
          <span
            key={tone}
            className={`flex size-12 items-center justify-center rounded-full bg-gradient-to-br ring-4 ring-background ${tone} ${
              i === 2 ? "opacity-60" : i === 1 ? "opacity-80" : ""
            }`}
          >
            <Building2 className="size-5 text-white/90" />
          </span>
        ))}
        <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-primary/30 bg-surface text-primary ring-4 ring-background">
          <Sparkles className="size-5" />
        </span>
      </div>
      <div className="mt-8">
        <h3 className="font-heading text-xl font-semibold text-ink">{copy.moreJoining}</h3>
        <p className="mt-2 text-pretty leading-relaxed text-ink-muted">{copy.moreJoiningBody}</p>
      </div>
    </aside>
  );
}

function CompactCard({ association, copy }: { association: PublicAssociation; copy: PlatformCopy }) {
  const brand = associationBrand(association);
  const place = placeOf(association);

  return (
    <li className="platform-lift group/card flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card hover:border-primary/25">
      <div className="flex items-center gap-4">
        <BrandMark brand={brand} size={56} className="size-14" />
        <div className="min-w-0">
          <h3 className="truncate font-heading text-base font-semibold text-ink">{association.name}</h3>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-muted">
            <span className="shrink-0 font-mono font-semibold tracking-wider text-primary">{association.code}</span>
            {place && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{place}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button asChild size="sm" className="h-11 whitespace-normal px-2 text-center leading-tight">
          <Link href={brand.homeHref}>{copy.website}</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-11 whitespace-normal px-2 text-center leading-tight">
          <Link href={brand.loginHref}>{copy.login}</Link>
        </Button>
        {brand.registerHref && (
          <Button asChild size="sm" variant="ghost" className="h-11 whitespace-normal px-2 text-center leading-tight text-primary hover:bg-primary-50">
            <Link href={brand.registerHref}>{copy.join}</Link>
          </Button>
        )}
      </div>
    </li>
  );
}
