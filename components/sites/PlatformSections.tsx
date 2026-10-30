import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  ChartColumnIncreasing,
  CircleCheck,
  ClipboardCheck,
  HandCoins,
  Landmark,
  LogIn,
  PiggyBank,
  Scale,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_BRAND } from "@/lib/brand";
import type { SitesCopy } from "@/lib/i18n/dashboard/sites";
import type { Locale } from "@/types";

type PlatformCopy = SitesCopy["platform"];

/** The small uppercase label above each section's heading. */
export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <p
      className={`flex items-center gap-3 font-heading text-xs font-semibold uppercase tracking-[0.18em] ${
        tone === "dark" ? "text-gold" : "text-primary"
      }`}
    >
      <span aria-hidden="true" className={`h-px w-6 ${tone === "dark" ? "bg-gold/60" : "bg-primary/40"}`} />
      {children}
    </p>
  );
}

// Stats ----------------------------------------------------------------------

/**
 * Counts only, never money. It overlaps the hero's lower edge so the light page
 * and the dark hero read as one surface.
 */
export function StatsBand({
  copy,
  stats,
  locale,
}: {
  copy: PlatformCopy;
  stats: { associations: number; members: number };
  locale: Locale;
}) {
  const format = new Intl.NumberFormat(locale === "rw" ? "en-RW" : "en-GB");
  const items = [
    { id: "associations", value: format.format(stats.associations), label: copy.statAssociations, icon: Building2 },
    { id: "members", value: format.format(stats.members), label: copy.statMembers, icon: PiggyBank },
    { id: "languages", value: "2", label: copy.statLanguages, icon: BookOpenCheck },
  ];

  return (
    <section aria-labelledby="platform-stats" className="container-page relative z-10 -mt-16 px-4 sm:-mt-20 sm:px-6">
      <h2 id="platform-stats" className="sr-only">
        {copy.statsTitle}
      </h2>
      <dl className="grid divide-y divide-ink/10 overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_30px_60px_-24px_rgba(11,27,51,0.35)] backdrop-blur-2xl backdrop-saturate-150 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map(({ id, value, label, icon: Icon }, index) => (
          <div
            key={id}
            className="platform-rise relative flex items-center gap-5 px-6 py-6 sm:flex-col sm:items-start sm:gap-0 sm:px-8 sm:py-8"
            style={{ "--platform-delay": `${500 + index * 120}ms` } as CSSProperties}
          >
            <dt className="order-2 text-sm font-medium leading-snug text-ink/75 sm:mt-2 sm:max-w-[16rem]">{label}</dt>
            <dd className="order-1 flex items-baseline gap-3 font-heading text-4xl font-bold tracking-[-0.03em] text-ink tabular-nums sm:text-5xl lg:text-6xl">
              {value}
            </dd>
            <Icon
              aria-hidden="true"
              className="absolute right-6 top-6 hidden size-5 text-primary/25 sm:block"
            />
          </div>
        ))}
      </dl>
    </section>
  );
}

// How it works ---------------------------------------------------------------

export function HowItWorks({ copy }: { copy: PlatformCopy }) {
  const steps = [
    { id: "join", icon: Building2, title: copy.stepJoin, body: copy.stepJoinBody },
    { id: "rules", icon: Scale, title: copy.stepRules, body: copy.stepRulesBody },
    { id: "save", icon: PiggyBank, title: copy.stepSave, body: copy.stepSaveBody },
    { id: "lend", icon: HandCoins, title: copy.stepLend, body: copy.stepLendBody },
  ];

  return (
    <section aria-labelledby="platform-how" className="relative isolate container-page px-4 py-20 sm:px-6 lg:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="platform-breathe absolute right-[5%] top-[18%] size-[460px] rounded-full bg-primary-light/50 blur-[90px]" />
        <div className="platform-glow absolute bottom-[5%] right-[30%] size-[340px] rounded-full bg-gold/30 blur-[80px]" />
        <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_65%)]" />
      </div>
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>{copy.howEyebrow}</Eyebrow>
          <h2
            id="platform-how"
            className="mt-4 text-balance font-heading text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl lg:text-5xl"
          >
            {copy.howTitle}
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            {copy.howLead}
          </p>
        </div>

        <ol className="relative">
          {steps.map(({ id, icon: Icon, title, body }, index) => {
            const last = index === steps.length - 1;
            return (
              <li key={id} className="relative grid grid-cols-[3.5rem_1fr] gap-5 pb-10 last:pb-0 sm:gap-7">
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-7 top-14 w-px bg-gradient-to-b from-primary/30 to-primary/5"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative flex size-14 items-center justify-center rounded-2xl font-heading text-lg font-bold ${
                    last
                      ? "bg-gradient-to-br from-gold to-[#e9c97c] text-footer shadow-[0_12px_30px_-12px_rgba(212,169,76,0.8)]"
                      : "border border-primary/15 bg-surface text-primary shadow-card"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="platform-lift rounded-2xl border border-white/80 bg-white/65 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_-8px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-heading text-lg font-semibold leading-snug text-ink sm:text-xl">{title}</h3>
                    <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary/60" />
                  </div>
                  <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-muted">{body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// Features -------------------------------------------------------------------

function TileIcon({ icon: Icon, dark }: { icon: typeof PiggyBank; dark?: boolean }) {
  return (
    <span
      className={`flex size-11 items-center justify-center rounded-xl ${
        dark ? "bg-white/10 text-gold ring-1 ring-white/15" : "bg-primary-50 text-primary ring-1 ring-primary/10"
      }`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

// A month of one member's contributions for the savings tile: most days paid,
// a few late, one missed.
const MONTH = Array.from({ length: 35 }, (_, i) =>
  i >= 31 ? "none" : i === 12 ? "missed" : i === 5 || i === 22 ? "late" : "paid"
);

export function FeatureBento({ copy }: { copy: PlatformCopy }) {
  return (
    <section aria-labelledby="platform-features" className="border-y border-border bg-surface">
      <div className="container-page px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-3xl">
          <Eyebrow>{copy.featuresEyebrow}</Eyebrow>
          <h2
            id="platform-features"
            className="mt-4 text-balance font-heading text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl lg:text-5xl"
          >
            {copy.featuresTitle}
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            {copy.featuresLead}
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-6 lg:mt-16">
          {/* Daily share savings — the widest tile */}
          <article className="platform-lift relative overflow-hidden rounded-3xl border border-border bg-background p-6 sm:p-8 md:col-span-4">
            <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
              <div>
                <TileIcon icon={PiggyBank} />
                <h3 className="mt-5 font-heading text-xl font-semibold text-ink sm:text-2xl">{copy.featureSave}</h3>
                <p className="mt-2 max-w-sm text-pretty leading-relaxed text-ink-muted">{copy.featureSaveBody}</p>
              </div>
              <div aria-hidden="true" className="grid w-fit grid-cols-7 gap-1.5">
                {MONTH.map((state, i) => (
                  <span
                    key={i}
                    className={`size-6 rounded-md sm:size-7 ${
                      state === "paid"
                        ? "bg-primary"
                        : state === "late"
                          ? "bg-gold"
                          : state === "missed"
                            ? "border-2 border-dashed border-ink/20"
                            : "bg-transparent"
                    } ${i === 30 ? "ring-2 ring-primary-light ring-offset-2 ring-offset-background" : ""}`}
                  />
                ))}
              </div>
            </div>
          </article>

          {/* Bank matching — tall navy tile */}
          <article className="platform-lift relative overflow-hidden rounded-3xl bg-footer p-6 text-white sm:p-8 md:col-span-2 md:row-span-2">
            <div aria-hidden="true" className="absolute -right-24 -top-24 size-64 rounded-full bg-primary/50 blur-3xl" />
            <div aria-hidden="true" className="absolute inset-0 bg-noise opacity-20" />
            <div className="relative flex h-full flex-col">
              <TileIcon icon={Landmark} dark />
              <h3 className="mt-5 font-heading text-xl font-semibold text-white sm:text-2xl">{copy.featureBank}</h3>
              <p className="mt-2 text-pretty leading-relaxed text-white/70">{copy.featureBankBody}</p>
              <ul aria-hidden="true" className="mt-8 space-y-2 md:mt-auto md:pt-8">
                {[
                  ["0142", "4,000"],
                  ["0087", "2,000"],
                  ["0311", "6,000"],
                  ["0026", "2,000"],
                ].map(([ref, amount], i) => (
                  <li
                    key={ref}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 font-mono text-xs"
                  >
                    <span className="rounded-md bg-primary px-1.5 py-0.5 font-sans text-[10px] font-bold">BK</span>
                    <span className="text-white/60">#{ref}</span>
                    <span className="ml-auto text-white tabular-nums">{amount}</span>
                    <CircleCheck className={`size-4 ${i === 0 ? "text-gold" : "text-primary-light"}`} />
                  </li>
                ))}
              </ul>
            </div>
          </article>

          {/* Loans by rulebook */}
          <article className="platform-lift rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7 md:col-span-2">
            <TileIcon icon={HandCoins} />
            <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{copy.featureLend}</h3>
            <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-muted">{copy.featureLendBody}</p>
          </article>

          {/* Fines & compliance */}
          <article className="platform-lift relative overflow-hidden rounded-3xl border border-primary/10 bg-primary-50 p-6 sm:p-7 md:col-span-2">
            <div aria-hidden="true" className="absolute inset-0 bg-dots [mask-image:linear-gradient(to_bottom_left,black,transparent_60%)]" />
            <div className="relative">
              <TileIcon icon={ClipboardCheck} />
              <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{copy.featureFines}</h3>
              <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-muted">{copy.featureFinesBody}</p>
            </div>
          </article>

          {/* Reports */}
          <article className="platform-lift rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8 md:col-span-3">
            <div className="flex items-start justify-between gap-6">
              <div>
                <TileIcon icon={ChartColumnIncreasing} />
                <h3 className="mt-5 font-heading text-lg font-semibold text-ink sm:text-xl">{copy.featureReports}</h3>
                <p className="mt-2 max-w-xs text-pretty text-[15px] leading-relaxed text-ink-muted">
                  {copy.featureReportsBody}
                </p>
              </div>
              <div aria-hidden="true" className="hidden h-28 w-32 shrink-0 items-end gap-1.5 sm:flex">
                {[30, 38, 35, 52, 60, 74, 92].map((h, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-t-md ${i === 6 ? "bg-gold" : "bg-primary/15"}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </article>

          {/* Bilingual & installable */}
          <article className="platform-lift relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[#173a6d] p-6 text-white sm:p-8 md:col-span-3">
            <div aria-hidden="true" className="absolute -bottom-20 -right-10 size-56 rounded-full bg-gold/25 blur-3xl" />
            <div className="relative flex items-start justify-between gap-6">
              <div>
                <TileIcon icon={Smartphone} dark />
                <h3 className="mt-5 font-heading text-lg font-semibold text-white sm:text-xl">{copy.featureApp}</h3>
                <p className="mt-2 max-w-xs text-pretty text-[15px] leading-relaxed text-white/75">
                  {copy.featureAppBody}
                </p>
              </div>
              <div aria-hidden="true" className="hidden shrink-0 flex-col items-center gap-3 sm:flex">
                <span className="flex rounded-full bg-white/10 p-1 text-xs font-bold ring-1 ring-white/20">
                  <span className="rounded-full bg-white px-3 py-1 text-primary">RW</span>
                  <span className="px-3 py-1 text-white/70">EN</span>
                </span>
                <span className="flex h-24 w-14 flex-col items-center rounded-2xl border-2 border-white/40 p-1.5">
                  <span className="h-1 w-4 rounded-full bg-white/40" />
                  <span className="mt-2 grid w-full grid-cols-2 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`h-3 rounded-[3px] ${i === 0 ? "bg-gold" : "bg-white/30"}`} />
                    ))}
                  </span>
                </span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

// Closing call ---------------------------------------------------------------

export function ClosingCta({ copy }: { copy: PlatformCopy }) {
  return (
    <section aria-labelledby="platform-cta" className="container-page px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-footer px-6 py-14 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="platform-glow absolute -left-32 -top-32 size-[420px] rounded-full bg-primary/60 blur-[100px]" />
          <div className="platform-breathe absolute -bottom-40 right-0 size-[420px] rounded-full bg-gold/25 blur-[110px]" />
          <div className="absolute inset-0 bg-noise opacity-25" />
          <svg className="platform-spin absolute -right-24 top-[calc(50%-280px)] h-[560px] w-[560px]" viewBox="0 0 560 560" fill="none">
            {[100, 160, 220, 270].map((r, i) => (
              <circle
                key={r}
                cx="280"
                cy="280"
                r={r}
                stroke={i === 1 ? "rgba(212,169,76,0.3)" : "rgba(141,180,227,0.14)"}
                strokeDasharray={i % 2 ? undefined : "2 7"}
              />
            ))}
          </svg>
        </div>

        <div className="grid items-end gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Eyebrow tone="dark">{copy.ctaEyebrow}</Eyebrow>
            <h2
              id="platform-cta"
              className="mt-4 max-w-2xl text-balance font-heading text-3xl font-bold tracking-[-0.025em] text-white sm:text-4xl lg:text-5xl"
            >
              {copy.ctaTitle}
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
              {copy.ctaBody}
            </p>
          </div>
          <div className="platform-glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:p-5 lg:flex-col lg:justify-self-end">
            <Button
              asChild
              size="lg"
              className="platform-shimmer bg-gold text-footer shadow-[0_14px_34px_-12px_rgba(212,169,76,0.8)] hover:bg-[#e2bd68]"
            >
              <Link href={PLATFORM_BRAND.loginHref}>
                <LogIn className="size-4" aria-hidden="true" />
                {copy.signIn}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outlineLight" className="group border-white/35">
              <Link href="#associations">
                {copy.ctaDirectory}
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
