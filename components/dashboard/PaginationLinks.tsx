"use client";

import { useSearchParams } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Pagination that preserves the current filters.
 *
 * Rebuilds the existing query string with a new page rather than replacing it,
 * so paging through a filtered result set does not silently drop the filters
 * and show the user a different dataset from page two onwards.
 */
export function PaginationLinks({
  page,
  pageSize,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const router = useSiteRouter();
  const params = useSearchParams();

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      onPageChange={(next) => {
        const query = new URLSearchParams(params.toString());
        query.set("page", String(next));
        router.push(`?${query.toString()}`);
      }}
    />
  );
}
