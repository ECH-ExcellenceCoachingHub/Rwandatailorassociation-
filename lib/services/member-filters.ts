import type { Prisma } from "@/lib/generated/prisma/client";
import { canonicalDistrict } from "@/lib/rwanda";

/**
 * Filters shared by the member register and the card register, so "members in
 * Gasabo" means the same people on both screens.
 */

/// `district=none` in the URL: members with no district on file.
export const NO_DISTRICT = "none";

export type DistrictFilter = string | typeof NO_DISTRICT;

export type CardPaidFilter = "paid" | "unpaid";

/**
 * One of Rwanda's thirty districts (canonical spelling), "none", or undefined
 * for every district. Anything else is ignored rather than trusted, since it
 * goes into a query.
 */
export function parseDistrictFilter(value: string | null | undefined): DistrictFilter | undefined {
  if (!value) return undefined;
  if (value === NO_DISTRICT) return NO_DISTRICT;
  return canonicalDistrict(value);
}

export function parseCardPaidFilter(value: string | null | undefined): CardPaidFilter | undefined {
  return value === "paid" || value === "unpaid" ? value : undefined;
}

/**
 * Districts were typed freely before the address form was fixed, so a stored
 * value may be "kicukiro" or "Kicukiro District". Matching on a
 * case-insensitive prefix finds all of those under the canonical name.
 */
export function districtWhere(district: DistrictFilter | undefined): Prisma.MemberWhereInput {
  if (!district) return {};
  if (district === NO_DISTRICT) return { OR: [{ district: null }, { district: "" }] };
  return { district: { startsWith: district, mode: "insensitive" } };
}

export function cardPaidWhere(paid: CardPaidFilter | undefined): Prisma.MemberWhereInput {
  if (paid === "paid") return { cardPaidAt: { not: null } };
  if (paid === "unpaid") return { cardPaidAt: null };
  return {};
}

/**
 * Free-text search over the identifiers an officer is likely to type. Phones
 * are stored as +250…, but people type 078…; a leading 0 is dropped so the
 * local form still finds the number.
 */
export function memberSearchWhere(
  search: string | undefined,
  options: { email?: boolean } = {}
): Prisma.MemberWhereInput {
  if (!search) return {};

  const digits = search.replace(/[\s-]/g, "");
  const phone = /^0\d{2,}$/.test(digits) ? digits.slice(1) : digits;

  // "Jean Uwimana" or "Uwimana Jean": a full name matches across both columns.
  const words = search.split(/\s+/).filter(Boolean);
  const fullName: Prisma.MemberWhereInput[] =
    words.length === 2
      ? [
          [words[0], words[1]],
          [words[1], words[0]],
        ].map(([first, last]) => ({
          user: {
            firstName: { contains: first, mode: "insensitive" as const },
            lastName: { contains: last, mode: "insensitive" as const },
          },
        }))
      : [];

  return {
    OR: [
      ...fullName,
      { memberNumber: { contains: search, mode: "insensitive" } },
      { paymentReference: { contains: search, mode: "insensitive" } },
      ...(digits ? [{ nationalId: { contains: digits } }] : []),
      {
        user: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            ...(options.email ? [{ email: { contains: search, mode: "insensitive" as const } }] : []),
            ...(phone ? [{ phone: { contains: phone } }] : []),
          ],
        },
      },
    ],
  };
}
