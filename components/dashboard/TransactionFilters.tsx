"use client";

import { useSearchParams } from "next/navigation";
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
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Filter bar for transaction listings.
 *
 * State lives in the URL rather than in React state, deliberately: an
 * administrator investigating a discrepancy needs to send a colleague the
 * exact view they are looking at, and the back button should return to the
 * previous filter rather than an empty table.
 */
export function TransactionFilters({ basePath }: { basePath: string }) {
  const router = useSiteRouter();
  const params = useSearchParams();
  const { d } = useLanguage();
  const copy = d.views.filters;

  const [search, setSearch] = useState(params.get("q") ?? "");

  // Values are the TransactionType enum; only the labels are translated.
  const types = [
    { value: "ALL", label: copy.allTypes },
    { value: "DEPOSIT", label: copy.deposits },
    { value: "WITHDRAWAL", label: copy.withdrawals },
    { value: "LOAN_DISBURSEMENT", label: copy.loanDisbursements },
    { value: "LOAN_REPAYMENT", label: copy.loanRepayments },
    { value: "INTEREST", label: copy.interest },
    { value: "FEE", label: copy.fees },
    { value: "PENALTY", label: copy.penalties },
    { value: "ADJUSTMENT", label: copy.adjustments },
    { value: "REVERSAL", label: copy.reversals },
  ];

  function apply(next: Record<string, string | undefined>) {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "ALL") query.delete(key);
      else query.set(key, value);
    }

    // Any filter change resets to the first page — staying on page 7 of a
    // result set that now has two pages shows an empty table.
    query.delete("page");

    router.push(`${basePath}?${query.toString()}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    apply({ q: search.trim() || undefined });
  }

  const hasFilters = ["q", "type", "from", "to"].some((k) => params.get(k));

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:flex-row lg:items-end"
    >
      <div className="flex-1">
        <label htmlFor="tx-search" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.search}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <Input
            id="tx-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.searchTransactions}
            className="pl-10"
          />
        </div>
      </div>

      <div className="lg:w-52">
        <label htmlFor="tx-type" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.type}
        </label>
        <Select
          value={params.get("type") ?? "ALL"}
          onValueChange={(value) => apply({ type: value })}
        >
          <SelectTrigger id="tx-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="lg:w-40">
        <label htmlFor="tx-from" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.from}
        </label>
        <Input
          id="tx-from"
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(e) => apply({ from: e.target.value || undefined })}
        />
      </div>

      <div className="lg:w-40">
        <label htmlFor="tx-to" className="mb-1.5 block text-xs font-semibold text-ink">
          {copy.to}
        </label>
        <Input
          id="tx-to"
          type="date"
          defaultValue={params.get("to") ?? ""}
          onChange={(e) => apply({ to: e.target.value || undefined })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {copy.apply}
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
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
