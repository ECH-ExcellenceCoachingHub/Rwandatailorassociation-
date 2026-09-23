import Link from "next/link";
import Image from "next/image";
import { getDashboardCopy } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/ui/language-toggle";

/**
 * Authentication layout.
 *
 * A focused two-panel shell rather than the marketing chrome: someone signing
 * in to check a savings balance does not need the site navigation or a
 * "Become a Member" call to action.
 *
 * This is also where the name changes. The public website is the association;
 * what a member signs in to is STGT — Save Today, Grow Tomorrow — the
 * association's savings programme. So the lockup here reads STGT, with the
 * association named beneath it, and the logo, brand blue and Poppins/Manrope pairing
 * carry over unchanged so it is plainly the same organisation and not a
 * bolted-on portal.
 *
 * The brand panel is hidden below `lg`, where the form deserves the full
 * width; on phones the logo moves into a short navy header above the form,
 * which sits on a rounded sheet, so branding is never lost.
 *
 * The language switch sits alone in the header.
 * It has to be here rather than only on the marketing site: a member who
 * arrives straight at a sign-in link would otherwise have no way to reach
 * Kinyarwanda, and reading the cookie means the page renders in their language
 * on the first paint instead of flipping after it loads.
 */

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { d } = await getDashboardCopy();
  const copy = d.auth.layout;

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

        <Link
          href="/"
          className="relative flex items-center gap-3"
          aria-label={copy.homeLabel}
        >
          <Image
            src="/images/rtalogo.jpg"
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-full object-cover"
          />
          <span className="leading-tight">
            <span className="block font-heading text-xl font-bold tracking-[0.06em] text-white">
              STGT
            </span>
            <span className="block font-heading text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary-light">
              {copy.brandTagline}
            </span>
          </span>
        </Link>

        <div className="relative">
          <h1 className="text-balance font-heading text-[34px] font-bold leading-tight text-white xl:text-[40px]">
            {copy.headline}
          </h1>
        </div>

        <div className="relative text-xs leading-relaxed text-white/40">
          <p>© {new Date().getFullYear()} Rwanda Tailors Association</p>
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
          href="/"
          className="relative mx-auto flex flex-col items-center px-6 pt-4 pb-12 text-center lg:hidden"
          aria-label={copy.homeLabel}
        >
          <Image
            src="/images/rtalogo.jpg"
            alt=""
            width={80}
            height={80}
            className="size-[76px] shrink-0 rounded-full object-cover shadow-xl shadow-black/25 ring-4 ring-white/10"
          />
          <span className="mt-4 block font-heading text-[30px] font-bold leading-none tracking-[0.08em] text-white">
            STGT
          </span>
          <span className="mt-2 block font-heading text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-light">
            {copy.brandTagline}
          </span>
        </Link>

        <div className="relative -mt-2 flex flex-1 justify-center rounded-t-[32px] bg-background px-6 pt-9 pb-12 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] lg:mt-0 lg:items-center lg:rounded-none lg:px-10 lg:pt-0 lg:pb-16 lg:shadow-none">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
