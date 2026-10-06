"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/LanguageProvider";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { RWANDA_PROVINCES, provinceLabel } from "@/lib/rwanda";

/// How long typing must pause before the search runs. Short enough to feel
/// live, long enough that "Uwimana" is one query rather than seven.
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search and filters for the member register. State lives in the URL.
 *
 * The search runs as the officer types, after a short pause, and replaces the
 * URL rather than pushing to it, so the back button is not seven entries of
 * half a name. Pressing Enter runs it at once.
 *
 * `defaultStatus` is what the page shows when the URL names no status. The
 * register shows everyone; the card register shows active members only, so
 * there choosing "All statuses" has to be written into the URL as ALL rather
 * than dropped, or the page would quietly fall back to active.
 *
 * `showAccountFilter` adds a second filter on the login account's status
 * (`account` in the URL), which is independent of the membership status: a
 * member can be active in the association with a locked sign-in.
 *
 * `showDistrictFilter` filters by district (`district`, or `none` for members
 * with none on file); `showCardPaidFilter` by whether the printed card has
 * been paid for (`paid=paid|unpaid`).
 */
export function MemberSearch({
  basePath,
  defaultStatus = "ALL",
  showAccountFilter = false,
  showDistrictFilter = false,
  showCardPaidFilter = false,
}: {
  basePath: string;
  defaultStatus?: string;
  showAccountFilter?: boolean;
  showDistrictFilter?: boolean;
  showCardPaidFilter?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { d, locale } = useLanguage();
  const copy = d.views.filters;
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /// The search this box last sent to the URL. When the URL catches up with
  /// it the box is left alone, or keys typed since would be wiped out.
  const sentQuery = useRef(urlQuery);

  // Follow the URL when it changes from elsewhere — the back button.
  useEffect(() => {
    if (urlQuery === sentQuery.current) return;
    sentQuery.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

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

  // Values are the UserStatus enum; labels come from the shared status words.
  const accountStatuses = [
    { value: "ALL", label: copy.allAccounts },
    ...(["ACTIVE", "PENDING_VERIFICATION", "LOCKED", "SUSPENDED", "DISABLED"] as const).map(
      (value) => ({ value, label: statusLabel(value, d.status) })
    ),
  ];

  const paidOptions = [
    { value: "ALL", label: copy.anyCardPayment },
    { value: "paid", label: copy.cardPaid },
    { value: "unpaid", label: copy.cardUnpaid },
  ];

  function apply(next: Record<string, string | undefined>, mode: "push" | "replace" = "push") {
    if (debounce.current) clearTimeout(debounce.current);

    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      const isDefault = key === "status" ? value === defaultStatus : value === "ALL";
      if (!value || isDefault) search.delete(key);
      else search.set(key, value);
    }
    search.delete("page");
    if ("q" in next) sentQuery.current = next.q ?? "";

    const qs = search.toString();
    const href = qs ? `${basePath}?${qs}` : basePath;
    startTransition(() => {
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  function handleType(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (value.trim() !== urlQuery) apply({ q: value.trim() || undefined }, "replace");
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    apply({ q: query.trim() || undefined });
  }

  const hasFilters = ["q", "status", "account", "district", "paid", "photo"].some((key) =>
    params.get(key)
  );

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:flex-row lg:flex-wrap lg:items-end"
    >
      <div className="min-w-0 flex-1 lg:min-w-64">
        <label htmlFor="member-search" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.search}
        </label>
        <div className="relative">
          {pending ? (
            <Loader2
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary"
              aria-hidden="true"
            />
          ) : (
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
          )}
          <Input
            id="member-search"
            type="search"
            value={query}
            onChange={(e) => handleType(e.target.value)}
            placeholder={copy.searchMembers}
            autoComplete="off"
            className="pl-10"
          />
        </div>
        <span className="sr-only" aria-live="polite">
          {pending ? copy.searching : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <div className="lg:w-44">
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

        {showDistrictFilter && (
          <div className="lg:w-48">
            <label
              htmlFor="member-district"
              className="mb-1.5 block text-xs font-semibold text-ink"
            >
              {copy.district}
            </label>
            <Select
              value={params.get("district") ?? "ALL"}
              onValueChange={(value) => apply({ district: value })}
            >
              <SelectTrigger id="member-district">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{copy.allDistricts}</SelectItem>
                {RWANDA_PROVINCES.map((province) => (
                  <SelectGroup key={province.name}>
                    <SelectLabel>{provinceLabel(province.name, locale)}</SelectLabel>
                    {province.districts.map((district) => (
                      <SelectItem key={district} value={district}>
                        {district}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectItem value="none">{copy.noDistrict}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showCardPaidFilter && (
          <div className="lg:w-44">
            <label htmlFor="member-paid" className="mb-1.5 block text-xs font-semibold text-ink">
              {copy.cardPayment}
            </label>
            <Select
              value={params.get("paid") ?? "ALL"}
              onValueChange={(value) => apply({ paid: value })}
            >
              <SelectTrigger id="member-paid">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paidOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showAccountFilter && (
          <div className="lg:w-44">
            <label
              htmlFor="member-account"
              className="mb-1.5 block text-xs font-semibold text-ink"
            >
              {copy.account}
            </label>
            <Select
              value={params.get("account") ?? "ALL"}
              onValueChange={(value) => apply({ account: value })}
            >
              <SelectTrigger id="member-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountStatuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
              if (debounce.current) clearTimeout(debounce.current);
              setQuery("");
              sentQuery.current = "";
              startTransition(() => router.push(basePath, { scroll: false }));
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
