"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import FadeIn from "@/components/FadeIn";
import { useLanguage } from "@/components/LanguageProvider";

export default function Hero() {
  const { t } = useLanguage();

  return (
    <section
      id="home"
      className="relative overflow-hidden bg-gradient-to-b from-primary-50/60 via-background to-background"
    >
      <div className="pointer-events-none absolute -top-32 -right-32 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-40 top-1/3 size-[420px] rounded-full bg-primary/5 blur-3xl" />

      <div className="container-page relative grid items-center gap-14 py-14 sm:py-16 lg:grid-cols-2 lg:py-20">
        <FadeIn>
          <h1 className="text-balance font-heading text-[1.75rem] font-bold leading-[1.15] text-ink sm:text-4xl sm:leading-[1.12] lg:text-[3.2rem]">
            {t.hero.titleLine1}
            <br />
            <span className="text-primary">{t.hero.titleLine2}</span>
            <br />
            {t.hero.titleLine3}
          </h1>
          <p className="mt-4 max-w-lg text-balance text-sm leading-relaxed text-ink-muted sm:mt-6 sm:text-[16.5px]">
            {t.hero.subtitle}
          </p>
          <div className="mt-7 flex items-center gap-2.5 sm:mt-9 sm:flex-wrap sm:gap-4">
            <Button
              asChild
              size="lg"
              className="h-11 flex-1 px-3 text-[13px] sm:h-14 sm:flex-none sm:px-8 sm:text-base"
            >
              <Link href="/rta/register">{t.hero.ctaMember}</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 flex-1 px-3 text-[13px] sm:h-14 sm:flex-none sm:px-8 sm:text-base"
            >
              <Link href="/rta#services">{t.hero.ctaServices}</Link>
            </Button>
          </div>
        </FadeIn>

        <FadeIn variant="scale" delay={0.15}>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl shadow-lift">
            <Image
              src="/images/hero-workshop.jpg"
              alt={t.hero.imageAlt}
              fill
              priority
              sizes="(max-width: 1024px) 90vw, 45vw"
              className="object-cover"
            />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
