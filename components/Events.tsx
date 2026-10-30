"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import FadeIn from "@/components/FadeIn";
import { EVENTS } from "@/lib/data";
import { useLanguage } from "@/components/LanguageProvider";

export default function Events() {
  const { locale, t } = useLanguage();

  return (
    <div id="events" className="h-full rounded-2xl border border-border bg-white p-6 shadow-card">
      <FadeIn className="mb-5 flex items-center justify-between">
        <h3 className="font-heading text-base font-bold uppercase tracking-wide text-ink">
          {t.events.title}
        </h3>
        <Link
          href="/rta#news"
          className="text-xs font-semibold text-primary hover:text-primary-hover"
        >
          {t.events.viewAll}
        </Link>
      </FadeIn>

      <ul className="space-y-4">
        {EVENTS.map((event, i) => (
          <FadeIn key={event.title.en} delay={i * 0.06}>
            <li className="flex items-start gap-3 border-b border-border/70 pb-4 last:border-none last:pb-0">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-primary-50 py-1.5 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                  {event.month[locale]}
                </span>
                <span className="font-heading text-base font-bold text-primary-hover">
                  {event.day}
                </span>
              </div>
              <div>
                <p className="text-[13.5px] font-semibold leading-snug text-ink">
                  {event.title[locale]}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                  <MapPin className="size-3 text-primary" aria-hidden="true" />
                  {event.location[locale]}
                </p>
              </div>
            </li>
          </FadeIn>
        ))}
      </ul>
    </div>
  );
}
