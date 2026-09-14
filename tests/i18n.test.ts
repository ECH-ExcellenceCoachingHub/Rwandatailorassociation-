import { describe, expect, it } from "vitest";
import dashboardDictionary from "@/lib/i18n/dashboard";
import { fill, pluralize, split } from "@/lib/i18n/fill";
import { formatDate, formatDateTime } from "@/lib/i18n/dates";
import { DEFAULT_LOCALE, isLocale, parseLocale } from "@/lib/i18n/locale";

/**
 * The type system already guarantees that both languages define every key.
 * What it cannot see is the inside of the strings: a placeholder renamed on one
 * side only, or a plural form supplied in English and forgotten in Kinyarwanda,
 * both compile and then render "{amount}" or "1 iminsi" to a member.
 */

type Leaf = { path: string; en: string; rw: string };

/** Every string in the dictionary, paired across the two languages. */
function leaves(): Leaf[] {
  const found: Leaf[] = [];

  function walk(en: unknown, rw: unknown, path: string) {
    if (typeof en === "string" && typeof rw === "string") {
      found.push({ path, en, rw });
      return;
    }
    if (en && rw && typeof en === "object" && typeof rw === "object") {
      for (const key of Object.keys(en)) {
        walk(
          (en as Record<string, unknown>)[key],
          (rw as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key
        );
      }
    }
  }

  walk(dashboardDictionary.en, dashboardDictionary.rw, "");
  return found;
}

const PLACEHOLDER = /\{(\w+)\}/g;

describe("the dashboard dictionary", () => {
  const all = leaves();

  it("covers both languages everywhere", () => {
    expect(all.length).toBeGreaterThan(300);
    for (const leaf of all) {
      expect(leaf.en.length, leaf.path).toBeGreaterThan(0);
      expect(leaf.rw.length, leaf.path).toBeGreaterThan(0);
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const leaf of all) {
      const en = new Set(leaf.en.match(PLACEHOLDER) ?? []);
      const rw = new Set(leaf.rw.match(PLACEHOLDER) ?? []);
      expect([...rw].sort(), `${leaf.path} (rw)`).toEqual([...en].sort());
    }
  });

  it("gives a plural form in both languages or in neither", () => {
    for (const leaf of all) {
      expect(leaf.rw.includes("|"), `${leaf.path} plural form`).toBe(
        leaf.en.includes("|")
      );
    }
  });

  it("never leaves a plural half empty", () => {
    for (const leaf of all) {
      for (const value of [leaf.en, leaf.rw]) {
        if (!value.includes("|")) continue;
        const halves = value.split("|");
        expect(halves.length, leaf.path).toBe(2);
        for (const half of halves) expect(half.trim().length, leaf.path).toBeGreaterThan(0);
      }
    }
  });
});

describe("fill", () => {
  it("substitutes named placeholders", () => {
    expect(fill("Due {date}", { date: "17 Aug 2026" })).toBe("Due 17 Aug 2026");
    expect(fill("{a} and {b}", { a: "1", b: 2 })).toBe("1 and 2");
  });

  it("leaves an unknown placeholder visible rather than printing undefined", () => {
    // Visible is the lesser evil: "{amount}" on screen is a bug report, while
    // "undefined" beside a balance reads like a figure.
    expect(fill("Paid {amount}", {})).toBe("Paid {amount}");
  });
});

describe("pluralize", () => {
  const en = "{count} day late|{count} days late";
  const rw = "Umunsi {count} warenze|Iminsi {count} yarenze";

  it("picks the singular only for exactly one", () => {
    expect(pluralize(en, 1)).toBe("1 day late");
    expect(pluralize(en, 2)).toBe("2 days late");
    expect(pluralize(en, 0)).toBe("0 days late");
  });

  it("inflects the Kinyarwanda noun rather than appending an s", () => {
    expect(pluralize(rw, 1)).toBe("Umunsi 1 warenze");
    expect(pluralize(rw, 5)).toBe("Iminsi 5 yarenze");
  });

  it("falls back to the only form when a language has just one", () => {
    expect(pluralize("Ku nguzanyo {count}", 1)).toBe("Ku nguzanyo 1");
    expect(pluralize("Ku nguzanyo {count}", 4)).toBe("Ku nguzanyo 4");
  });
});

describe("split", () => {
  it("returns the text either side of a placeholder", () => {
    expect(split("Quote {reference} on every payment.", "reference")).toEqual([
      "Quote ",
      " on every payment.",
    ]);
  });

  it("returns the whole string when the placeholder is absent", () => {
    expect(split("No placeholder here", "reference")).toEqual([
      "No placeholder here",
      "",
    ]);
  });
});

describe("dates", () => {
  const date = new Date("2026-08-17T14:32:00Z");

  it("names the month in Kinyarwanda", () => {
    expect(formatDate(date, "en")).toBe("17 Aug 2026");
    expect(formatDate(date, "rw")).toBe("17 Kan 2026");
  });

  it("keeps day-month-year order in both languages", () => {
    expect(formatDate(new Date("2026-01-02"), "rw")).toBe("2 Mut 2026");
  });

  it("renders a missing date as a dash rather than Invalid Date", () => {
    expect(formatDate(null, "rw")).toBe("—");
    expect(formatDate("not a date", "en")).toBe("—");
    expect(formatDateTime(undefined, "en")).toBe("—");
  });
});

describe("locale parsing", () => {
  it("accepts only the two supported languages", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("rw")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("falls back to the default language for anything unrecognised", () => {
    // A cookie is user-controlled input: it must never index the dictionary
    // with a value that is not there.
    //
    // The fallback is Kinyarwanda, not English — see DEFAULT_LOCALE in
    // lib/i18n/locale.ts. This test asserted "en" long after that default was
    // deliberately changed to the language the members actually read, so it
    // was failing on a decision rather than on a defect.
    expect(parseLocale("rw")).toBe("rw");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("de")).toBe(DEFAULT_LOCALE);
    expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(parseLocale({ nope: true })).toBe(DEFAULT_LOCALE);
  });
});
