import { describe, expect, it } from "vitest";
import {
  RWANDA_DISTRICTS,
  RWANDA_PROVINCES,
  RWANDA_PROVINCE_NAMES,
  canonicalDistrict,
  canonicalProvince,
  districtBelongsToProvince,
  districtsInProvince,
  provinceForDistrict,
  provinceLabel,
  provinceShortLabel,
} from "@/lib/rwanda";
import { createMemberSchema } from "@/lib/validation/members";

/**
 * The district a member lives in is read back in reports and district
 * breakdowns for years after it is typed. What these tests protect is that one
 * place has exactly one stored spelling — a list that has drifted, or a value
 * saved as typed, turns one district into three rows nobody can add up.
 */
describe("Rwanda's administrative divisions", () => {
  it("has the five provinces and thirty districts", () => {
    expect(RWANDA_PROVINCE_NAMES).toHaveLength(5);
    expect(RWANDA_DISTRICTS).toHaveLength(30);
  });

  it("lists no district twice", () => {
    expect(new Set(RWANDA_DISTRICTS).size).toBe(RWANDA_DISTRICTS.length);
  });

  it("places every district in exactly one province", () => {
    for (const district of RWANDA_DISTRICTS) {
      const province = provinceForDistrict(district);
      expect(province, district).toBeDefined();
      expect(
        RWANDA_PROVINCES.filter((entry) => entry.districts.includes(district))
      ).toHaveLength(1);
    }
  });

  it("offers each province's own districts, and all of them until one is chosen", () => {
    expect(districtsInProvince("Kigali City")).toEqual([
      "Gasabo",
      "Kicukiro",
      "Nyarugenge",
    ]);
    expect(districtsInProvince("")).toHaveLength(30);
    expect(districtsInProvince(null)).toHaveLength(30);
  });
});

describe("canonicalising a typed value", () => {
  it("recognises a district however it was written", () => {
    for (const input of [
      "Kicukiro",
      "kicukiro",
      "KICUKIRO",
      "  Kicukiro  ",
      "Kicukiro District",
      "kicukiro district",
      "Kicukiro Akarere",
    ]) {
      expect(canonicalDistrict(input), input).toBe("Kicukiro");
    }
  });

  it("recognises a province by its shorthand and its Kinyarwanda name", () => {
    expect(canonicalProvince("kigali")).toBe("Kigali City");
    expect(canonicalProvince("Umujyi wa Kigali")).toBe("Kigali City");
    expect(canonicalProvince("north")).toBe("Northern Province");
    expect(canonicalProvince("Amajyaruguru")).toBe("Northern Province");
    // The apostrophe arrives as ', ’ or nothing, depending on the keyboard.
    expect(canonicalProvince("Intara y'Amajyepfo")).toBe("Southern Province");
    expect(canonicalProvince("Intara y’Amajyepfo")).toBe("Southern Province");
  });

  it("returns nothing for a place that is not one", () => {
    expect(canonicalDistrict("Nairobi")).toBeUndefined();
    expect(canonicalProvince("Central Province")).toBeUndefined();
    expect(canonicalDistrict("")).toBeUndefined();
    expect(canonicalProvince(null)).toBeUndefined();
  });
});

describe("districtBelongsToProvince", () => {
  it("accepts a district in its own province", () => {
    expect(districtBelongsToProvince("Kicukiro", "Kigali City")).toBe(true);
    expect(districtBelongsToProvince("huye district", "amajyepfo")).toBe(true);
  });

  it("rejects a district in someone else's province", () => {
    expect(districtBelongsToProvince("Kicukiro", "Northern Province")).toBe(false);
  });

  it("treats a missing half as no contradiction — both fields are optional", () => {
    expect(districtBelongsToProvince("Kicukiro", "")).toBe(true);
    expect(districtBelongsToProvince("", "Kigali City")).toBe(true);
  });
});

describe("province labels", () => {
  it("carries the full form for a sentence", () => {
    expect(provinceLabel("Eastern Province", "rw")).toBe("Intara y'Iburasirazuba");
    expect(provinceLabel("Kigali City", "en")).toBe("Kigali City");
  });

  it("drops the decoration for a table column", () => {
    expect(provinceShortLabel("Eastern Province", "rw")).toBe("Iburasirazuba");
    expect(provinceShortLabel("Northern Province", "rw")).toBe("Amajyaruguru");
    expect(provinceShortLabel("Southern Province", "rw")).toBe("Amajyepfo");
    expect(provinceShortLabel("Western Province", "rw")).toBe("Iburengerazuba");
    // Kigali's name carries no "Intara y'" to strip.
    expect(provinceShortLabel("Kigali City", "rw")).toBe("Umujyi wa Kigali");
    expect(provinceShortLabel("Eastern Province", "en")).toBe("Eastern");
    expect(provinceShortLabel("Kigali City", "en")).toBe("Kigali City");
  });

  it("shows an unrecognised or missing province as it came", () => {
    expect(provinceShortLabel("Central Province", "rw")).toBe("Central Province");
    expect(provinceShortLabel(null, "rw")).toBe("");
    expect(provinceShortLabel("", "en")).toBe("");
  });
});

describe("member enrolment validation", () => {
  const base = { firstName: "Jean", lastName: "Uwimana", phone: "0788123456" };

  it("stores the canonical spelling, not the one that was typed", () => {
    const parsed = createMemberSchema.parse({
      ...base,
      district: "kicukiro district",
      province: "kigali",
    });

    expect(parsed.district).toBe("Kicukiro");
    expect(parsed.province).toBe("Kigali City");
  });

  it("rejects a district that is not one of the thirty", () => {
    const parsed = createMemberSchema.safeParse({ ...base, district: "Kampala" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a district paired with the wrong province", () => {
    const parsed = createMemberSchema.safeParse({
      ...base,
      district: "Kicukiro",
      province: "Northern Province",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["district"]);
  });

  it("still accepts a file with neither recorded", () => {
    const parsed = createMemberSchema.parse(base);
    expect(parsed.district).toBeUndefined();
    expect(parsed.province).toBeUndefined();
  });
});
