/**
 * Rwanda's administrative divisions: the five provinces and thirty districts.
 *
 * Kept in code rather than a database table because the list is fixed by the
 * 2006 territorial reform and changes roughly never — a table would need
 * seeding, migrating and a query on every form render to say the same thing.
 *
 * The English province name is the canonical stored value. Members' addresses
 * are typed once and read for years, in statements, reports and district
 * breakdowns; a free-text box produces "Kicukiro", "kicukiro District" and
 * "KIGALI" for the same place, and no report can group those. Everything here
 * exists to make one spelling the only one that reaches the database.
 */

export interface RwandanProvince {
  /** The value stored and submitted. */
  name: string;
  /** Kinyarwanda name, for bilingual display. */
  kinyarwanda: string;
  /**
   * Alternative spellings accepted on input — legacy free-text records,
   * imported spreadsheets and the shorthand people actually type.
   */
  aliases: readonly string[];
  districts: readonly string[];
}

export const RWANDA_PROVINCES: readonly RwandanProvince[] = [
  {
    name: "Kigali City",
    kinyarwanda: "Umujyi wa Kigali",
    aliases: ["kigali", "city of kigali", "umujyi wa kigali", "kigali province"],
    districts: ["Gasabo", "Kicukiro", "Nyarugenge"],
  },
  {
    name: "Eastern Province",
    kinyarwanda: "Intara y'Iburasirazuba",
    aliases: ["east", "eastern", "iburasirazuba", "intara y'iburasirazuba"],
    districts: [
      "Bugesera",
      "Gatsibo",
      "Kayonza",
      "Kirehe",
      "Ngoma",
      "Nyagatare",
      "Rwamagana",
    ],
  },
  {
    name: "Northern Province",
    kinyarwanda: "Intara y'Amajyaruguru",
    aliases: ["north", "northern", "amajyaruguru", "intara y'amajyaruguru"],
    districts: ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  },
  {
    name: "Southern Province",
    kinyarwanda: "Intara y'Amajyepfo",
    aliases: ["south", "southern", "amajyepfo", "intara y'amajyepfo"],
    districts: [
      "Gisagara",
      "Huye",
      "Kamonyi",
      "Muhanga",
      "Nyamagabe",
      "Nyanza",
      "Nyaruguru",
      "Ruhango",
    ],
  },
  {
    name: "Western Province",
    kinyarwanda: "Intara y'Iburengerazuba",
    aliases: ["west", "western", "iburengerazuba", "intara y'iburengerazuba"],
    districts: [
      "Karongi",
      "Ngororero",
      "Nyabihu",
      "Nyamasheke",
      "Rubavu",
      "Rusizi",
      "Rutsiro",
    ],
  },
];

/** All five province names, in the order they are offered. */
export const RWANDA_PROVINCE_NAMES: readonly string[] = RWANDA_PROVINCES.map(
  (province) => province.name
);

/** All thirty districts, alphabetically — for a flat list or a filter. */
export const RWANDA_DISTRICTS: readonly string[] = RWANDA_PROVINCES.flatMap(
  (province) => province.districts
).sort((a, b) => a.localeCompare(b));

/**
 * Loosens a typed value enough to recognise it: case, surrounding space, the
 * "District"/"Province" suffix people add, and the apostrophe in
 * "Intara y'Amajyepfo" (which arrives as ', ’ or nothing at all).
 */
function lookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(district|akarere|province|intara)$/, "")
    .trim();
}

const PROVINCE_BY_KEY = new Map<string, string>();
const DISTRICT_BY_KEY = new Map<string, string>();
const PROVINCE_OF_DISTRICT = new Map<string, string>();

for (const province of RWANDA_PROVINCES) {
  PROVINCE_BY_KEY.set(lookupKey(province.name), province.name);
  PROVINCE_BY_KEY.set(lookupKey(province.kinyarwanda), province.name);
  for (const alias of province.aliases) {
    PROVINCE_BY_KEY.set(lookupKey(alias), province.name);
  }

  for (const district of province.districts) {
    DISTRICT_BY_KEY.set(lookupKey(district), district);
    PROVINCE_OF_DISTRICT.set(district, province.name);
  }
}

/**
 * The canonical province name for a typed value, or undefined if it is not one
 * of Rwanda's five provinces. Use this rather than a bare equality check: it is
 * what lets "kigali" and "Umujyi wa Kigali" both save as "Kigali City".
 */
export function canonicalProvince(
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined;
  return PROVINCE_BY_KEY.get(lookupKey(value));
}

/** The canonical district name for a typed value, or undefined if unknown. */
export function canonicalDistrict(
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined;
  return DISTRICT_BY_KEY.get(lookupKey(value));
}

/**
 * The districts of one province, or every district when no province is given —
 * so a form can offer the full list before a province has been chosen, and let
 * the district choice fill the province in.
 */
export function districtsInProvince(
  province: string | null | undefined
): readonly string[] {
  const canonical = canonicalProvince(province);
  if (!canonical) return RWANDA_DISTRICTS;
  return (
    RWANDA_PROVINCES.find((entry) => entry.name === canonical)?.districts ?? []
  );
}

/** The province a district belongs to. Every district has exactly one. */
export function provinceForDistrict(
  district: string | null | undefined
): string | undefined {
  const canonical = canonicalDistrict(district);
  return canonical ? PROVINCE_OF_DISTRICT.get(canonical) : undefined;
}

/**
 * Whether a district sits in a province. A blank on either side is not a
 * contradiction — both fields are optional, and half an address is still worth
 * recording.
 */
export function districtBelongsToProvince(
  district: string | null | undefined,
  province: string | null | undefined
): boolean {
  const canonicalD = canonicalDistrict(district);
  const canonicalP = canonicalProvince(province);
  if (!canonicalD || !canonicalP) return true;
  return provinceForDistrict(canonicalD) === canonicalP;
}

/**
 * A province's name in the reader's language. The stored value stays the
 * English canonical name; this is only for what goes on screen. Anything that
 * is not a recognised province is shown as it was recorded.
 */
export function provinceLabel(
  value: string | null | undefined,
  locale: "en" | "rw"
): string {
  if (!value) return "";
  const canonical = canonicalProvince(value);
  const entry = RWANDA_PROVINCES.find((province) => province.name === canonical);
  if (!entry) return value;
  return locale === "rw" ? entry.kinyarwanda : entry.name;
}
