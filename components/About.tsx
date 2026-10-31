"use client";

import Image from "next/image";
import Link from "@/components/SiteLink";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import FadeIn from "@/components/FadeIn";
import { useLanguage } from "@/components/LanguageProvider";

export default function About() {
  const { t } = useLanguage();

  return (
    <section id="about" className="section-pad bg-white">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2">
        <FadeIn variant="scale">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-lift">
            <Image
              src="/images/about-tailor-sewing.jpg"
              alt={t.about.imageAlt}
              fill
              sizes="(max-width: 1024px) 90vw, 45vw"
              className="object-cover"
            />
          </div>
        </FadeIn>

        <FadeIn>
          <span className="mb-3 block text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {t.about.kicker}
          </span>
          <h2 className="text-balance text-3xl font-bold text-ink sm:text-4xl">
            {t.about.title}
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-ink-muted">
            {t.about.paragraph}
          </p>

          <ul className="mt-7 space-y-3">
            {t.about.pillars.map((pillar) => (
              <li key={pillar.label} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <p className="text-[15px] leading-relaxed text-ink/85">
                  <span className="font-semibold text-ink">{pillar.label}</span>{" "}
                  {pillar.text}
                </p>
              </li>
            ))}
          </ul>

          <Button asChild className="mt-8">
            <Link href="/rta#contact">{t.about.readMore}</Link>
          </Button>
        </FadeIn>
      </div>
    </section>
  );
}
