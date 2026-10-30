import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Landmark, Languages, LogIn, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_BRAND, PLATFORM_FULL_NAME } from "@/lib/brand";
import type { SitesCopy } from "@/lib/i18n/dashboard/sites";

type PlatformCopy = SitesCopy["platform"];

/** Staggered fade-up: each block of the hero arrives a beat after the last. */
function rise(delayMs: number): CSSProperties {
  return { "--platform-delay": `${delayMs}ms` } as CSSProperties;
}

/**
 * The platform home's hero: the promise on the left, and on the right a glimpse
 * of the product itself — a member's savings card, a loan approval and a
 * matched bank statement — drawn in HTML so it stays sharp and translatable.
 */
export function PlatformHero({ copy }: { copy: PlatformCopy }) {
  const trust = [
    { id: "languages", icon: Languages, label: copy.trustLanguages },
    { id: "phone", icon: Smartphone, label: copy.trustPhone },
    { id: "bank", icon: Landmark, label: copy.trustBank },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-footer">
      <HeroBackdrop />

      <div className="container-page relative grid items-center gap-12 px-4 pb-28 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-40 lg:pt-24">
        <div className="min-w-0">
          <p
            className="platform-rise inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-3 pr-4 font-heading text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-light sm:text-xs"
            style={rise(0)}
          >
            <span aria-hidden="true" className="relative flex size-2">
              <span className="platform-ping absolute inset-0 rounded-full bg-gold" />
              <span className="relative size-2 rounded-full bg-gold" />
            </span>
            {copy.eyebrow}
          </p>

          <h1
            className="platform-rise mt-6 text-balance font-heading text-[clamp(2.4rem,4.6vw+1rem,4.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-white"
            style={rise(90)}
          >
            {copy.headlineLead}{" "}
            <span className="bg-gradient-to-r from-gold via-[#ecd08f] to-primary-light bg-clip-text text-transparent">
              {copy.headlineAccent}
            </span>
          </h1>

          <p
            className="platform-rise mt-5 flex items-center gap-3 font-heading text-xs font-semibold uppercase tracking-[0.16em] text-gold sm:text-sm"
            style={rise(180)}
          >
            <span aria-hidden="true" className="h-px w-8 bg-gold/60" />
            {PLATFORM_FULL_NAME}
          </p>

          <p
            className="platform-rise mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg"
            style={rise(260)}
          >
            {copy.lead}
          </p>

          <div className="platform-rise mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap" style={rise(340)}>
            <Button
              asChild
              size="lg"
              className="platform-shimmer group bg-white text-footer shadow-[0_10px_30px_-10px_rgba(141,180,227,0.7)] hover:bg-primary-50 hover:text-primary"
            >
              <Link href="#associations">
                {copy.findAssociation}
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outlineLight" className="border-white/35">
              <Link href={PLATFORM_BRAND.loginHref}>
                <LogIn className="size-4" aria-hidden="true" />
                {copy.signIn}
              </Link>
            </Button>
          </div>

          <ul
            className="platform-rise platform-glass mt-10 flex w-fit max-w-full flex-col gap-3 rounded-2xl px-4 py-3.5 text-sm text-white/75 sm:flex-row sm:flex-wrap sm:gap-x-6"
            style={rise(420)}
          >
            {trust.map(({ id, icon: Icon, label }) => (
              <li key={id} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-gold" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="platform-rise min-w-0" style={rise(300)}>
          <ProductComposite copy={copy} />
        </div>
      </div>
    </section>
  );
}

/** Gradient mesh, dot texture, a perspective grid floor and contour rings. */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="platform-glow absolute -left-40 -top-40 size-[560px] rounded-full bg-primary/60 blur-[120px]" />
      <div className="platform-breathe absolute right-[-10%] top-[10%] size-[520px] rounded-full bg-primary-light/25 blur-[120px]" />
      <div className="platform-glow absolute bottom-[-20%] right-[20%] size-[420px] rounded-full bg-gold/20 blur-[120px] [animation-delay:-9s]" />
      <div className="absolute inset-0 bg-noise opacity-30" />
      <div
        className="absolute inset-x-[-25%] bottom-0 h-[55%] origin-bottom"
        style={{
          backgroundImage:
            "linear-gradient(rgba(141,180,227,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(141,180,227,0.16) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          transform: "perspective(700px) rotateX(64deg)",
          maskImage: "linear-gradient(to top, black 0%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 85%)",
        }}
      />
      <svg
        className="platform-spin absolute right-[-180px] top-[calc(50%-450px)] hidden h-[900px] w-[900px] lg:block"
        viewBox="0 0 900 900"
        fill="none"
      >
        {[160, 230, 300, 370, 440].map((r, i) => (
          <circle
            key={r}
            cx="450"
            cy="450"
            r={r}
            stroke={i === 2 ? "rgba(212,169,76,0.22)" : "rgba(141,180,227,0.12)"}
            strokeDasharray={i % 2 ? "2 7" : undefined}
          />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-footer to-transparent" />
    </div>
  );
}

// Thirty days of saving, two of them missed — a believable record, not a
// perfect one.
const STREAK = Array.from({ length: 30 }, (_, day) => !(day === 8 || day === 19));

function float(duration: number, delay: number, y: number): CSSProperties {
  return {
    "--platform-float-duration": `${duration}s`,
    "--platform-float-delay": `${delay}s`,
    "--platform-float-y": `${y}px`,
  } as CSSProperties;
}

/**
 * Three pieces of the product, layered at different depths. A fixed 440px
 * stage, scaled down on phones so the composition keeps its proportions.
 */
function ProductComposite({ copy }: { copy: PlatformCopy }) {
  const saved = STREAK.filter(Boolean).length;

  return (
    <div role="img" aria-label={copy.compositeLabel} className="relative mx-auto h-[340px] w-full max-w-[440px] min-[400px]:h-[380px] sm:h-[480px]">
      <div className="absolute left-1/2 top-0 h-[480px] w-[440px] origin-top -translate-x-1/2 scale-[0.72] min-[400px]:scale-[0.8] sm:scale-100 xl:scale-[1.08]">
        {/* The member's savings card */}
        <div className="platform-float absolute left-[18px] top-[78px] w-[370px]" style={float(9, 0, -12)}>
          <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-gradient-to-br from-white/[0.14] via-white/[0.07] to-white/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_40px_80px_-24px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
            <div className="absolute -right-16 -top-16 size-48 rounded-full bg-primary-light/25 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-gold to-[#f0d593] font-heading text-sm font-bold text-footer">
                MU
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-white">{copy.compositeMember}</p>
                <p className="font-mono text-[11px] tracking-wide text-white/50">SSPSG · 0142</p>
              </div>
            </div>

            <div className="relative mt-7 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {copy.compositeBalance}
              </p>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                {copy.compositeSample}
              </span>
            </div>
            <div className="relative mt-1.5 flex items-end justify-between gap-3">
              <p className="font-heading text-[42px] font-bold leading-none tracking-[-0.03em] text-white tabular-nums">
                <span className="mr-1.5 align-top text-base font-semibold tracking-normal text-white/60">RWF</span>
                128,500
              </p>
              <span className="mb-1 whitespace-nowrap rounded-full bg-primary-light/15 px-2.5 py-1 text-xs font-semibold text-primary-light">
                +2,000 · {copy.compositeToday}
              </span>
            </div>

            <div className="relative mt-7 flex items-center justify-between text-[11px] text-white/60">
              <span>{copy.compositeStreak}</span>
              <span className="font-mono font-semibold text-gold">
                <span
                  className="platform-count"
                  style={{ "--platform-count": saved } as CSSProperties}
                />
                /{STREAK.length}
              </span>
            </div>
            <div className="platform-sweep relative mt-2.5 flex h-11 items-end gap-[3px]">
              {STREAK.map((paid, day) => (
                <span
                  key={day}
                  className={
                    paid
                      ? `platform-fill h-full flex-1 rounded-[3px] ${
                          day >= 23
                            ? "bg-gradient-to-t from-gold/70 to-gold"
                            : "bg-gradient-to-t from-primary-light/50 to-primary-light"
                        }`
                      : "platform-fill h-[28%] flex-1 rounded-[3px] bg-white/15"
                  }
                  style={{ "--platform-i": day } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Loan approved toast */}
        <div className="platform-float absolute right-0 top-0 w-[248px]" style={float(7, -2, -9)}>
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-3.5 pr-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_24px_50px_-16px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <span className="platform-progress absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-success to-primary-light" />
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
              <CircleCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-semibold text-ink">{copy.compositeLoan}</p>
              <p className="truncate text-xs text-ink-muted tabular-nums">
                RWF 300,000 · {copy.compositeLoanTerms}
              </p>
            </div>
          </div>
        </div>

        {/* Bank statement matched chip */}
        <div className="platform-float absolute bottom-[26px] left-0" style={float(10, -4, -7)}>
          <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.08] py-2 pl-2 pr-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_24px_50px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary font-heading text-[11px] font-bold text-white ring-2 ring-primary-light/30">
              BK
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                {copy.compositeMatched}
                <CircleCheck className="size-3.5 text-gold" />
              </p>
              <p className="text-[11px] text-white/55">{copy.compositeMatchedBody}</p>
            </div>
          </div>
        </div>

        {/* A small sample of the reports, sitting furthest back */}
        <div
          className="platform-float absolute left-[-8px] top-[14px] w-[150px]"
          style={float(11, -6, -6)}
        >
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl">
            <div className="flex h-14 items-end gap-1.5">
              {[34, 42, 40, 55, 63, 72, 88].map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-sm ${i === 6 ? "bg-gold" : "bg-primary-light/40"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-2.5 h-1.5 w-2/3 rounded-full bg-white/15" />
            <div className="mt-1.5 h-1.5 w-1/3 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
