"use client";

import Link from "next/link";
import FadeIn from "@/components/FadeIn";
import NewsGrid from "@/components/NewsGrid";
import { NEWS } from "@/lib/data";
import { useLanguage } from "@/components/LanguageProvider";

export default function News() {
  const { t } = useLanguage();

  return (
    <div>
      <FadeIn className="mb-6 flex items-center justify-between">
        <h3 className="font-heading text-base font-bold uppercase tracking-wide text-ink">
          {t.news.title}
        </h3>
        <Link
          href="/rta/news"
          className="text-sm font-semibold text-primary hover:text-primary-hover"
        >
          {t.news.viewAll}
        </Link>
      </FadeIn>

      <NewsGrid items={NEWS.slice(0, 3)} gridClassName="grid-cols-1 gap-6 sm:grid-cols-3" />
    </div>
  );
}
