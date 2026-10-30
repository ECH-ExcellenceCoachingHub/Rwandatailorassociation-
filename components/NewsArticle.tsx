"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FadeIn from "@/components/FadeIn";
import BackButton from "@/components/BackButton";
import { useLanguage } from "@/components/LanguageProvider";
import type { NewsItem } from "@/types";

export default function NewsArticle({ item }: { item: NewsItem }) {
  const { locale, t } = useLanguage();

  return (
    <article className="section-pad bg-background">
      <div className="container-page max-w-3xl">
        <FadeIn>
          <BackButton href="/rta/news" />
        </FadeIn>

        <FadeIn
          delay={0.05}
          variant="scale"
          className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl shadow-card"
        >
          <Image
            src={item.image}
            alt={item.title[locale]}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
          <Badge variant="solid" className="absolute left-4 top-4">
            {item.category[locale]}
          </Badge>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-muted">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {item.date[locale]}
          </p>
          <h1 className="mt-2 text-balance font-heading text-2xl font-bold leading-tight text-ink sm:text-3xl">
            {item.title[locale]}
          </h1>

          <div className="mt-6 space-y-4">
            {item.body[locale].map((paragraph, i) => (
              <p key={i} className="text-[15.5px] leading-relaxed text-ink/80">
                {paragraph}
              </p>
            ))}
          </div>

          <Button asChild className="mt-8 w-fit">
            <Link href="/rta#contact">{t.news.getInTouch}</Link>
          </Button>
        </FadeIn>
      </div>
    </article>
  );
}
