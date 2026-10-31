"use client";

import Link from "@/components/SiteLink";
import { ArrowRight } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import FadeIn from "@/components/FadeIn";
import { Button } from "@/components/ui/button";
import { CONTACT_DETAILS, SOCIAL_LINKS } from "@/lib/data";
import { useLanguage } from "@/components/LanguageProvider";

const MAP_EMBED_SRC =
  "https://www.google.com/maps?q=Gatenga,+Kicukiro+District,+Kigali,+Rwanda&output=embed";

export default function ContactUs() {
  const { locale, t } = useLanguage();

  return (
    <section id="contact" className="section-pad bg-background">
      <div className="container-page">
        <SectionHeading
          kicker={t.contact.kicker}
          title={t.contact.title}
          description={t.contact.description}
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {CONTACT_DETAILS.map((item, i) => {
            const external = item.href.startsWith("http");
            return (
              <FadeIn key={item.value} delay={i * 0.06}>
                <a
                  href={item.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="group flex h-full flex-col items-center rounded-2xl border border-border bg-white p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/25 hover:shadow-lift"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary-50 transition-colors duration-300 group-hover:bg-primary">
                    <item.icon
                      className="size-6 text-primary transition-colors duration-300 group-hover:text-white"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-5 font-heading text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                    {item.label[locale]}
                  </h3>
                  <p className="mt-1.5 text-[15px] font-medium text-ink">{item.value}</p>
                </a>
              </FadeIn>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <FadeIn
            variant="scale"
            className="overflow-hidden rounded-2xl border border-border shadow-card lg:col-span-3"
          >
            <iframe
              title={t.contact.mapTitle}
              src={MAP_EMBED_SRC}
              className="h-72 w-full lg:h-full lg:min-h-[320px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </FadeIn>

          <FadeIn
            delay={0.1}
            className="flex flex-col justify-between rounded-2xl bg-primary p-8 text-white shadow-lift lg:col-span-2"
          >
            <div>
              <h3 className="font-heading text-xl font-bold sm:text-2xl">
                {t.contact.registerTitle}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/85">
                {t.contact.registerText}
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-6">
              <Button
                asChild
                size="lg"
                className="w-full bg-white text-primary-hover hover:bg-white/90"
              >
                <Link href="/rta/register">
                  {t.contact.registerButton}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  {t.contact.followUs}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {SOCIAL_LINKS.map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      aria-label={social.label}
                      className="flex size-9 items-center justify-center rounded-full border border-white/25 text-white/85 transition-colors hover:border-white hover:bg-white hover:text-primary-hover"
                    >
                      <social.icon className="size-4" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
