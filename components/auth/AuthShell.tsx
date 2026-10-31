import Link from "@/components/SiteLink";
import { getDashboardCopy } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { BrandMark } from "@/components/brand/BrandMark";
import { PLATFORM_BRAND, PLATFORM_NAME, type Brand } from "@/lib/brand";

/**
 * The two-panel sign-in shell, for whichever site it is drawn for.
 *
 * A focused shell rather than the marketing chrome: someone signing in to
 * check a savings balance does not need the site navigation or a "Become a
 * Member" call to action.
 *
 * The lockup is the brand's. At the root (/login) it is the platform; on
 * RTA's sign-in (/rta/login) it reads STGT — Save Today, Grow Tomorrow, the
 * association's savings programme; under /abc it is that association. Every
 * association has "powered by SSPSG" beneath the copyright, so it is plain
 * whose system it runs on.
 *
 * The brand panel is hidden below `lg`, where the form deserves the full
 * width; on phones the mark moves into a short navy header above the form,
 * which sits on a rounded sheet, so branding is never lost.
 *
 * The language switch sits alone in the header. It has to be here rather than
 * only on the marketing site: a member who arrives straight at a sign-in link
 * would otherwise have no way to reach Kinyarwanda, and reading the cookie
 * means the page renders in their language on the first paint.
 */
export async function AuthShell({
  brand,
  children,
}: {
  brand: Brand;
  children: React.ReactNode;
}) {
  const { d, locale } = await getDashboardCopy();
  const tagline = brand.tagline[locale];

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-footer p-10 xl:p-14 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-noise opacity-40"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-[380px] rounded-full bg-primary-light/20 blur-3xl"
        />

        <Link href={brand.homeHref} className="relative flex items-center gap-3" aria-label={brand.name}>
          <BrandMark brand={brand} size={48} className="size-12" />
          <span className="leading-tight">
            <span className="block font-heading text-xl font-bold tracking-[0.06em] text-white">
              {brand.mark}
            </span>
            <span className="block font-heading text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary-light">
              {tagline}
            </span>
          </span>
        </Link>

        <div className="relative">
          <h1 className="text-balance font-heading text-[34px] font-bold leading-tight text-white xl:text-[40px]">
            {d.auth.layout.headline}
          </h1>
        </div>

        <div className="relative space-y-1 text-xs leading-relaxed text-white/40">
          <p>
            © {new Date().getFullYear()} {brand.name}
          </p>
          {brand.poweredBy && (
            <p>
              {d.sites.association.poweredBy}{" "}
              <Link href={PLATFORM_BRAND.homeHref} className="font-semibold text-white/70 hover:text-white">
                {PLATFORM_NAME}
              </Link>
            </p>
          )}
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-footer lg:overflow-visible lg:bg-background">
        {/* Mobile brand header: the same dark navy, dot texture and glow as
            the desktop panel, so the phone view carries the brand too. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] lg:hidden">
          <div className="absolute inset-0 bg-noise opacity-40" />
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-primary-light/25 blur-3xl" />
          <div className="absolute -left-24 top-32 size-56 rounded-full bg-primary-light/10 blur-3xl" />
        </div>

        <div className="relative flex items-center justify-end gap-4 px-5 pt-5 pb-2 lg:px-10 lg:py-6">
          {/* Shown at every width here — on this page it is the only way in. */}
          <LanguageToggle className="flex border-white/15 bg-white/95 shadow-lg shadow-black/10 lg:border-border lg:bg-transparent lg:shadow-none" />
        </div>

        <Link
          href={brand.homeHref}
          className="relative mx-auto flex flex-col items-center px-6 pt-4 pb-12 text-center lg:hidden"
          aria-label={brand.name}
        >
          <BrandMark
            brand={brand}
            size={80}
            className="size-[76px] shadow-xl shadow-black/25 ring-4 ring-white/10"
          />
          <span className="mt-4 block font-heading text-[30px] font-bold leading-none tracking-[0.08em] text-white">
            {brand.mark}
          </span>
          <span className="mt-2 block font-heading text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-light">
            {tagline}
          </span>
        </Link>

        <div className="relative -mt-2 flex flex-1 justify-center rounded-t-[32px] bg-background px-6 pt-9 pb-12 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] lg:mt-0 lg:items-center lg:rounded-none lg:px-10 lg:pt-0 lg:pb-16 lg:shadow-none">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
