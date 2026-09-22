"use client";

import { Skeleton, SkeletonStat, SkeletonTable } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * What a dashboard page shows while its data is on the way.
 *
 * Rendered by the `loading.tsx` files, which is what lets a click in the
 * sidebar answer at once: Next prefetches this shell for every visible link,
 * so the new page's outline appears the moment it is clicked and the figures
 * stream in behind it. Without a loading boundary the old page sat frozen
 * until the new one had finished every query — against a database a network
 * hop away, that read as the app not having noticed the click.
 *
 * Shaped like the common page — heading, a row of figures, a table — so the
 * layout does not jump when the real content replaces it.
 */
export function PageSkeleton() {
  const { d } = useLanguage();

  return (
    <div>
      <p role="status" className="sr-only">
        {d.common.loading}
      </p>

      <div className="mb-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>

      <SkeletonTable rows={6} />
    </div>
  );
}
