"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, ChevronDown, Globe, Check, LogIn } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "@/lib/data";
import { useScrolled } from "@/hooks/use-scrolled";
import { useLanguage } from "@/components/LanguageProvider";
import type { Locale } from "@/types";

/** Kinyarwanda first, because it is the default and the majority language. */
const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "rw", label: "Ikinyarwanda" },
  { code: "en", label: "English" },
];

export default function Navbar() {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const { locale, setLocale, t } = useLanguage();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 h-[85px] w-full bg-white/95 backdrop-blur transition-shadow duration-300 ${
        scrolled ? "shadow-[0_2px_16px_rgba(15,23,42,0.08)]" : ""
      }`}
    >
      <div className="container-page flex h-full items-center justify-between gap-6">
        <Logo />

        <nav
          aria-label={t.navbar.primaryNav}
          className="hidden items-center gap-0.5 2xl:flex"
        >
          {NAV_LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-primary-50 hover:text-primary-hover ${
                i === 0
                  ? "text-primary after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-primary"
                  : "text-ink/80"
              }`}
            >
              {link.label[locale]}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t.navbar.changeLanguage}
                className="flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary data-[state=open]:border-primary data-[state=open]:text-primary"
              >
                <Globe className="size-4" aria-hidden="true" />
                {t.meta.langShort}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[170px] overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-lift"
              >
                {LANGUAGES.map((lang) => (
                  <DropdownMenu.Item
                    key={lang.code}
                    onSelect={() => setLocale(lang.code)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink/85 outline-none transition-colors hover:bg-primary-50 hover:text-primary-hover data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
                  >
                    {lang.label}
                    {locale === lang.code && (
                      <Check className="size-4 text-primary" aria-hidden="true" />
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {/* Sign in sits beside Become Member rather than inside a menu:
              existing members arrive here to reach their savings, and hunting
              for the way in is the first thing they should not have to do. */}
          <Button asChild size="sm" variant="outline">
            <Link href="/rta/login">
              <LogIn className="size-3.5" aria-hidden="true" />
              {t.navbar.signIn}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/rta/register">{t.navbar.becomeMember}</Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t.navbar.closeMenu : t.navbar.openMenu}
          aria-expanded={open}
          className="flex size-11 items-center justify-center rounded-full border border-border text-ink 2xl:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border bg-white 2xl:hidden"
          >
            <nav aria-label={t.navbar.mobileNav} className="container-page flex flex-col py-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-border/70 py-3.5 text-[15px] font-medium text-ink/85 last:border-none"
                >
                  {link.label[locale]}
                </Link>
              ))}

              <div className="mt-4 flex items-center gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLocale(lang.code)}
                    aria-pressed={locale === lang.code}
                    className={`flex-1 rounded-full border px-3 py-2.5 text-sm font-medium transition-colors ${
                      locale === lang.code
                        ? "border-primary bg-primary-50 text-primary-hover"
                        : "border-border text-ink-muted hover:border-primary hover:text-primary"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              <Button asChild variant="outline" className="mt-4 w-full">
                <Link href="/rta/login" onClick={() => setOpen(false)}>
                  <LogIn className="size-4" aria-hidden="true" />
                  {t.navbar.signIn}
                </Link>
              </Button>

              <Button asChild className="mt-2 w-full">
                <Link href="/rta/register" onClick={() => setOpen(false)}>
                  {t.navbar.becomeMember}
                </Link>
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
