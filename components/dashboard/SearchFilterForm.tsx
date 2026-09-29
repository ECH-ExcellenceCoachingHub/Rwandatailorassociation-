import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDashboardCopy } from "@/lib/i18n/server";

/**
 * Filter bar for admin list screens.
 *
 * A plain GET form rather than a client component: the filters belong in the
 * URL so an administrator can send a colleague the exact view they are looking
 * at, and a form submission does that natively — no JavaScript, no router
 * push, and the back button behaves. `TransactionFilters` remains the client
 * variant for screens that filter as you type.
 *
 * Every select is submitted, so the "ALL" sentinel is what the page treats as
 * "no filter"; validate the value against the enum before it reaches Prisma.
 */

export interface FilterSelect {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  /// Tailwind width class for the field, e.g. "sm:w-52".
  width?: string;
}

export async function SearchFilterForm({
  action,
  placeholder,
  search,
  selects = [],
  searchLabel,
  searchName = "q",
  showSearch = true,
  hidden = {},
}: {
  /// Page path the form submits to; also the target of the Clear link.
  action: string;
  placeholder?: string;
  search?: string;
  selects?: FilterSelect[];
  /// Defaults to the translated word for "Search".
  searchLabel?: string;
  searchName?: string;
  /// False for screens filtered only by dropdown, so no dead text field is
  /// rendered for a form that has nothing to search.
  showSearch?: boolean;
  /// Filters set elsewhere (a link from another page) that submitting this
  /// form must keep. A GET form drops its action's own query string, so they
  /// travel as hidden inputs.
  hidden?: Record<string, string | undefined>;
}) {
  const { d } = await getDashboardCopy();
  const copy = d.views.filters;
  const label = searchLabel ?? copy.search;

  const hasFilters =
    Boolean(search) || selects.some((s) => s.value && s.value !== "ALL");

  const inputId = `filter-${searchName}`;

  return (
    <form
      method="get"
      action={action}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:flex-row lg:items-end"
    >
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null
      )}

      {showSearch && (
        <div className="flex-1">
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-xs font-semibold text-ink"
          >
            {label}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              id={inputId}
              name={searchName}
              defaultValue={search ?? ""}
              placeholder={placeholder}
              className="pl-10"
            />
          </div>
        </div>
      )}

      {!showSearch && <div className="flex-1" />}

      {selects.map((select) => (
        <div key={select.name} className={select.width ?? "lg:w-52"}>
          <label
            htmlFor={`filter-${select.name}`}
            className="mb-1.5 block text-xs font-semibold text-ink"
          >
            {select.label}
          </label>
          <select
            id={`filter-${select.name}`}
            name={select.name}
            defaultValue={select.value ?? "ALL"}
            className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {copy.apply}
        </Button>
        {hasFilters && (
          <Button asChild variant="outline" size="sm">
            <Link href={action}>{copy.clear}</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
