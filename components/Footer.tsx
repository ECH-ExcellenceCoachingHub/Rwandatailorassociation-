"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import NewsletterForm from "@/components/NewsletterForm";
import { FOOTER_LINKS, CONTACT_DETAILS, SOCIAL_LINKS } from "@/lib/data";
import { useLanguage } from "@/components/LanguageProvider";

export default function Footer() {
  const { locale, t } = useLanguage();

  return (
    <footer className="border-t border-border bg-footer text-white">
      <div className="container-page grid grid-cols-2 gap-10 py-16 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 sm:col-span-1">
          <Logo variant="light" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/65">
            {t.footer.about}
          </p>
          <div className="mt-6 flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => (
              <Link
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="flex size-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-primary hover:bg-primary hover:text-white"
              >
                <social.icon className="size-4" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        {FOOTER_LINKS.map((group) => (
          <div key={group.title.en}>
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-white/90">
              {group.title[locale]}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href + link.label.en}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-white/65 transition-colors hover:text-primary-light"
                  >
                    {link.label[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-white/90">
            {t.footer.contactUs}
          </h3>
          <ul className="mt-4 space-y-2.5 text-[13px] text-white/65">
            {CONTACT_DETAILS.map((item) => {
              const external = item.href.startsWith("http");
              return (
                <li key={item.value} className="flex items-start gap-2">
                  <item.icon className="mt-0.5 size-3.5 shrink-0 text-primary-light" aria-hidden="true" />
                  <Link
                    href={item.href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="transition-colors hover:text-primary-light"
                  >
                    {item.value}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-white/90">
            {t.footer.newsletter}
          </h3>
          <p className="mt-4 text-[13px] leading-relaxed text-white/65">
            {t.footer.newsletterText}
          </p>
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/55 sm:flex-row">
          <p>{t.footer.copyright}</p>
          <div className="flex items-center gap-5">
            <Link href="#" className="hover:text-primary-light">
              {t.footer.privacyPolicy}
            </Link>
            <Link href="#" className="hover:text-primary-light">
              {t.footer.termsOfUse}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
