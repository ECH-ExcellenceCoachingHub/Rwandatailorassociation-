import { PageSkeleton } from "@/components/dashboard/PageSkeleton";

/**
 * Shown the instant a link to any page in this section is clicked, while the
 * page's data loads. One of these sits in every folder whose child pages are
 * navigated between, because Next only swaps in the nearest boundary below the
 * part of the tree that stays the same.
 */
export default function Loading() {
  return <PageSkeleton />;
}
