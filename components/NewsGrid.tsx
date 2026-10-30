"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import FadeIn from "@/components/FadeIn";
import { useLanguage } from "@/components/LanguageProvider";
import type { NewsItem } from "@/types";

interface NewsGridProps {
  items: NewsItem[];
  gridClassName?: string;
}

export default function NewsGrid({
  items,
  gridClassName = "grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
}: NewsGridProps) {
  const { locale, t } = useLanguage();

  return (
    <div className={`grid ${gridClassName}`}>
      {items.map((item, i) => (
        <FadeIn key={item.slug} delay={(i % 3) * 0.08}>
          <article className="h-full overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            <div className="relative aspect-[16/11] overflow-hidden">
              <Image
                src={item.image}
                alt={item.title[locale]}
                fill
                sizes="(max-width: 1024px) 90vw, 25vw"
                className="object-cover"
              />
              <Badge variant="solid" className="absolute left-3 top-3">
                {item.category[locale]}
              </Badge>
            </div>
            <div className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {item.date[locale]}
              </p>
              <h4 className="mt-2 font-heading text-[14.5px] font-semibold leading-snug text-ink">
                {item.title[locale]}
              </h4>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                {item.excerpt[locale]}
              </p>
              <Link
                href={`/rta/news/${item.slug}`}
                className="mt-3 inline-block text-xs font-semibold text-primary hover:text-primary-hover"
              >
                {t.news.readMore} &rarr;
              </Link>
            </div>
          </article>
        </FadeIn>
      ))}
    </div>
  );
}
