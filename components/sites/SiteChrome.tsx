import Link from "@/components/SiteLink";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { BrandMark } from "@/components/brand/BrandMark";
import { PLATFORM_BRAND, PLATFORM_NAME, type Brand } from "@/lib/brand";
import type { Locale } from "@/types";

/**
 * Header and footer for the generated sites — the platform's home (/) and each
 * hosted association's (/abc). RTA's site (/rta) keeps its own hand-built
 * Navbar and Footer; these are the template every other site is drawn from.
 */

export function SiteHeader({
  brand,
  locale,
  signInLabel,
  joinLabel,
}: {
  brand: Brand;
  locale: Locale;
  signInLabel: string;
  /// Omitted where there is nothing to join.
  joinLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="container-page flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={brand.homeHref} className="flex min-w-0 items-center gap-3" aria-label={brand.name}>
          <BrandMark brand={brand} size={44} className="size-11" />
          <span className="min-w-0 leading-tight">
            <span className="block font-heading text-lg font-bold tracking-[0.04em] text-ink">
              {brand.mark}
            </span>
            <span className="hidden truncate text-xs font-semibold uppercase tracking-[0.12em] text-primary sm:block">
              {brand.tagline[locale]}
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-2">
          <LanguageToggle className="hidden sm:flex" />
          <Button asChild size="sm" variant="outline">
            <Link href={brand.loginHref}>
              <LogIn className="size-4" aria-hidden="true" />
              {signInLabel}
            </Link>
          </Button>
          {joinLabel && brand.registerHref && (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={brand.registerHref}>{joinLabel}</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ brand, poweredByLabel }: { brand: Brand; poweredByLabel?: string }) {
  return (
    <footer className="border-t border-white/10 bg-footer text-white/60">
      <div className="container-page flex flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {brand.name}
        </p>
        {brand.poweredBy && (
          <p>
            {poweredByLabel}{" "}
            <Link href={PLATFORM_BRAND.homeHref} className="font-semibold text-white hover:underline">
              {PLATFORM_NAME}
            </Link>
          </p>
        )}
      </div>
    </footer>
  );
}
