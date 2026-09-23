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
 * association named beneath it, and the logo, teal and Poppins/Manrope pairing
 * carry over unchanged so it is plainly the same organisation and not a
 * bolted-on portal.
 *
 * The brand panel is hidden below `lg`, where the form deserves the full
 * width; the logo moves inline above the form so branding is never lost.
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
          className="pointer-events-none absolute -right-24 -top-24 size-[380px] rounded-full bg-primary/25 blur-3xl"
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
            <span className="block font-heading text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
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
      <main className="flex flex-1 flex-col bg-background">
        <div className="flex items-center justify-end gap-4 px-6 py-6 lg:px-10">
          {/* Shown at every width here — on this page it is the only way in. */}
          <LanguageToggle className="flex" />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:px-10">
          <div className="w-full max-w-[440px]">
            <Link
              href="/"
              className="mb-10 flex items-center gap-4 lg:hidden"
              aria-label={copy.homeLabel}
            >
              <Image
                src="/images/rtalogo.jpg"
                alt=""
                width={80}
                height={80}
                className="size-20 shrink-0 rounded-full object-cover"
              />
              <span className="leading-tight">
                <span className="block font-heading text-[32px] font-bold tracking-[0.06em] text-ink">
                  STGT
                </span>
                <span className="mt-1 block font-heading text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  {copy.brandTagline}
                </span>
              </span>
            </Link>

            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
