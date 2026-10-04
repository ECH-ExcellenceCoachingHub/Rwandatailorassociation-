import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, divide, toMoneyString, ZERO, type Money } from "@/lib/money";
import {
  RWANDA_PROVINCES,
  canonicalDistrict,
  canonicalProvince,
  provinceForDistrict,
} from "@/lib/rwanda";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * SAVINGS AND MEMBERSHIP BY DISTRICT.
 *
 * Where the association's members live and what they hold, one row per
 * district, with the members of each listed underneath — what an officer
 * takes to a district meeting or to local government.
 *
 * Districts are grouped by their canonical spelling (lib/rwanda.ts), so
 * "kicukiro", "Kicukiro District" and "KICUKIRO" are one row. A value that is
 * not one of Rwanda's thirty districts keeps its own row as typed, rather than
 * being folded into "not recorded": somebody wrote it down, and the officer
 * reading this is the one who can tell what was meant.
 *
 * The savings figure is the ledger balance of each member's savings
 * accounts — the same "balance" the member account statement shows.
 */

/// Everyone admitted to the register, as on the member account statement.
/// Applicants have no account yet; an exited member still lived somewhere and
/// may still hold money.
const REGISTERED_STATUSES: MemberStatus[] = ["ACTIVE", "SUSPENDED", "INACTIVE", "EXITED"];

export interface DistrictMemberRow {
  memberNumber: string;
  fullName: string;
  phone: string | null;
  status: MemberStatus;
  joinedAt: Date | null;
  balance: string;
}

export interface DistrictRow {
  /// Null for members with no district on file.
  district: string | null;
  /// False when the district on file is not one of Rwanda's thirty.
  recognised: boolean;
  province: string | null;
  members: number;
  active: number;
  savings: string;
  averageSavings: string;
  /// Highest balance first.
  memberRows: DistrictMemberRow[];
}

export interface DistrictReport {
  /// Null when a super administrator reports across every association.
  association: { name: string; code: string } | null;
  asOf: Date;
  districts: DistrictRow[];
  totals: {
    members: number;
    active: number;
    savings: string;
    averageSavings: string;
    districts: number;
  };
}

/** Province order as in lib/rwanda.ts, then district A–Z, unknowns, blanks. */
function orderOf(row: DistrictRow): [number, string] {
  if (row.district === null) return [RWANDA_PROVINCES.length + 1, ""];
  const province = RWANDA_PROVINCES.findIndex((p) => p.name === row.province);
  return [
    row.recognised && province >= 0 ? province : RWANDA_PROVINCES.length,
    row.district,
  ];
}

export async function buildDistrictReport(
  associationId: string | null
): Promise<DistrictReport | null> {
  const [association, members] = await Promise.all([
    associationId
      ? prisma.association.findUnique({
          where: { id: associationId },
          select: { name: true, code: true },
        })
      : Promise.resolve(null),
    prisma.member.findMany({
      where: {
        ...(associationId ? { associationId } : {}),
        status: { in: REGISTERED_STATUSES },
      },
      select: {
        memberNumber: true,
        status: true,
        joinedAt: true,
        district: true,
        province: true,
        user: { select: { firstName: true, lastName: true, phone: true } },
        savingsAccounts: { select: { balance: true } },
      },
    }),
  ]);

  if (associationId && !association) return null;

  const groups = new Map<
    string,
    { row: DistrictRow; total: Money; provinces: Map<string, number> }
  >();

  for (const member of members) {
    const typed = member.district?.trim() || null;
    const canonical = canonicalDistrict(typed);
    const district = canonical ?? typed;
    const key = district ? district.toLowerCase() : "";

    let group = groups.get(key);
    if (!group) {
      group = {
        row: {
          district,
          recognised: Boolean(canonical),
          province: canonical ? (provinceForDistrict(canonical) ?? null) : null,
          members: 0,
          active: 0,
          savings: "0.00",
          averageSavings: "0.00",
          memberRows: [],
        },
        total: ZERO,
        provinces: new Map(),
      };
      groups.set(key, group);
    }

    const balance = add(ZERO, ...member.savingsAccounts.map((a) => a.balance));
    group.total = add(group.total, balance);
    group.row.members += 1;
    if (member.status === "ACTIVE") group.row.active += 1;

    // An unrecognised district has no province of its own; take the one the
    // members recorded most often.
    const province = canonicalProvince(member.province);
    if (!canonical && province) {
      group.provinces.set(province, (group.provinces.get(province) ?? 0) + 1);
    }

    group.row.memberRows.push({
      memberNumber: member.memberNumber,
      fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
      phone: member.user.phone,
      status: member.status,
      joinedAt: member.joinedAt,
      balance: toMoneyString(balance),
    });
  }

  const districts = [...groups.values()].map(({ row, total, provinces }) => {
    if (!row.province && provinces.size > 0) {
      row.province = [...provinces.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    row.savings = toMoneyString(total);
    row.averageSavings = toMoneyString(divide(total, row.members));
    row.memberRows.sort(
      (a, b) => Number(b.balance) - Number(a.balance) || a.fullName.localeCompare(b.fullName)
    );
    return row;
  });

  districts.sort((a, b) => {
    const [pa, na] = orderOf(a);
    const [pb, nb] = orderOf(b);
    return pa - pb || na.localeCompare(nb);
  });

  const savings = add(ZERO, ...districts.map((d) => d.savings));

  return {
    association,
    asOf: new Date(),
    districts,
    totals: {
      members: members.length,
      active: districts.reduce((sum, d) => sum + d.active, 0),
      savings: toMoneyString(savings),
      averageSavings: toMoneyString(members.length > 0 ? divide(savings, members.length) : ZERO),
      districts: districts.filter((d) => d.district !== null).length,
    },
  };
}
