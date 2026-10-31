"use client";

import Link from "@/components/SiteLink";
import FadeIn from "@/components/FadeIn";
import { STATS } from "@/lib/data";
import { useLanguage } from "@/components/LanguageProvider";

export default function ImpactStats() {
  const { locale, t } = useLanguage();

  return (
    <FadeIn
      variant="scale"
      className="h-full rounded-2xl bg-primary p-6 text-white shadow-card"
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide">
          {t.impactStats.title}
        </h3>
        <Link
          href="/rta#about"
          className="text-xs font-semibold text-white/85 hover:text-white"
        >
          {t.impactStats.viewAll}
        </Link>
      </div>

      <ul className="space-y-4">
        {STATS.map((stat) => (
          <li key={stat.label.en} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <stat.icon className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-heading text-lg font-bold">{stat.value}</span>
              <span className="text-xs text-white/80">{stat.label[locale]}</span>
            </span>
          </li>
        ))}
      </ul>
    </FadeIn>
  );
}
