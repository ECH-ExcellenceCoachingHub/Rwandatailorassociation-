"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SortDropdownProps {
  basePath: string;
  currentSort: string;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
  label: string;
  params: URLSearchParams;
}

export function SortDropdown({
  basePath,
  currentSort,
  disabled,
  options,
  label,
  params,
}: SortDropdownProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    const search = new URLSearchParams(params.toString());
    if (value === "name") search.delete("sort");
    else search.set("sort", value);
    search.delete("page");

    const qs = search.toString();
    const href = qs ? `${basePath}?${qs}` : basePath;
    startTransition(() => router.push(href, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-ink">{label}:</span>
      <Select
        value={currentSort || "name"}
        onValueChange={handleChange}
        disabled={disabled || pending}
      >
        <SelectTrigger className="w-auto min-w-[140px]">
          <SelectValue placeholder={options[0]?.label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <ArrowUpDown className="size-3.5 animate-spin text-primary" aria-hidden="true" />}
    </div>
  );
}