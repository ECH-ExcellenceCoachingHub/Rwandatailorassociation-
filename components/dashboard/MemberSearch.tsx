"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Search and status filter for the member register. State lives in the URL.
 *
 * `defaultStatus` is what the page shows when the URL names no status. The
 * register shows everyone; the card register shows active members only, so
 * there choosing "All statuses" has to be written into the URL as ALL rather
 * than dropped, or the page would quietly fall back to active.
 */
export function MemberSearch({
  basePath,
  defaultStatus = "ALL",
}: {
  basePath: string;
  defaultStatus?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { d } = useLanguage();
  const copy = d.views.filters;
  const [query, setQuery] = useState(params.get("q") ?? "");

  // Values are the MemberStatus enum; only the labels are translated.
  const statuses = [
    { value: "ALL", label: copy.allStatuses },
    { value: "PENDING_APPROVAL", label: copy.pendingApproval },
    { value: "ACTIVE", label: copy.active },
    { value: "SUSPENDED", label: copy.suspended },
    { value: "INACTIVE", label: copy.inactive },
    { value: "REJECTED", label: copy.rejected },
    { value: "EXITED", label: copy.exited },
  ];

  function apply(next: Record<string, string | undefined>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      const isDefault = key === "status" ? value === defaultStatus : false;
      if (!value || isDefault) search.delete(key);
      else search.set(key, value);
    }
    search.delete("page");
    router.push(`${basePath}?${search.toString()}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    apply({ q: query.trim() || undefined });
  }

  const hasFilters = Boolean(params.get("q") || params.get("status"));

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="member-search" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.search}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <Input
            id="member-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.searchMembers}
            className="pl-10"
          />
        </div>
      </div>

      <div className="sm:w-52">
        <label htmlFor="member-status" className="mb-1.5 block text-xs font-semibold text-ink">
          {d.common.status}
        </label>
        <Select
          value={params.get("status") ?? defaultStatus}
          onValueChange={(value) => apply({ status: value })}
        >
          <SelectTrigger id="member-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {copy.search}
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              router.push(basePath);
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            {copy.clear}
          </Button>
        )}
      </div>
    </form>
  );
}
