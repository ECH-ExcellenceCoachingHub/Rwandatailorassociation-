import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { buildDistrictReport } from "@/lib/services/district-report";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * Savings and members by district: that spellings of one district land on
 * one row, that unknown and blank districts are kept apart, that savers and
 * members who have never paid are counted separately, and that the figures add
 * up.
 */

const RUN = `DST${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;

async function createMember(
  n: number,
  district: string | null,
  balance: string,
  status: MemberStatus = "ACTIVE",
  province: string | null = null,
  deposits: string = balance
) {
  await prisma.user.create({
    data: {
      associationId,
      email: `member${n}-${RUN.toLowerCase()}@district.test`,
      firstName: "District",
      lastName: `Member ${n}`,
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M${n}`,
          paymentReference: `${CODE}-${n}`,
          status,
          district,
          province,
          savingsAccounts: {
            create: {
              associationId,
              accountNumber: `${CODE}-SA-${n}`,
              currency: "RWF",
              balance,
              totalDeposits: deposits,
            },
          },
        },
      },
    },
  });
}

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `District Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  await createMember(1, "Kicukiro", "1000.00");
  await createMember(2, "kicukiro district", "3000.00", "SUSPENDED");
  await createMember(3, "Huye", "500.00");
  await createMember(4, "Kigli", "200.00", "ACTIVE", "Kigali City");
  await createMember(5, null, "100.00");
  await createMember(6, "Gasabo", "999.00", "PENDING_APPROVAL");
  // On the register, in Kicukiro, and has never paid anything in.
  await createMember(7, "Kicukiro", "0.00", "ACTIVE", null, "0.00");
});

afterAll(async () => {
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

describe("the district report", () => {
  it("groups spellings of one district and keeps unknown and blank apart", async () => {
    const report = (await buildDistrictReport(associationId))!;

    expect(report.districts.map((row) => row.district)).toEqual([
      "Kicukiro",
      "Huye",
      "Kigli",
      null,
    ]);

    const kicukiro = report.districts[0];
    expect(kicukiro.province).toBe("Kigali City");
    expect(kicukiro.members).toBe(3);
    expect(kicukiro.active).toBe(2);
    expect(kicukiro.savers).toBe(2);
    expect(kicukiro.nonSavers).toBe(1);
    expect(kicukiro.savings).toBe("4000.00");
    expect(kicukiro.averageSavings).toBe("1333.33");
    expect(kicukiro.memberRows[0].balance).toBe("3000.00");

    const unknown = report.districts[2];
    expect(unknown.recognised).toBe(false);
    expect(unknown.province).toBe("Kigali City");
  });

  it("counts savers and members who have never paid, and they add back up", async () => {
    const report = (await buildDistrictReport(associationId))!;

    const perDistrict = report.districts.map((row) => row.savers + row.nonSavers);
    expect(perDistrict).toEqual(report.districts.map((row) => row.members));

    // Only the Kicukiro member with zero deposits has never paid.
    expect(report.totals.savers).toBe(5);
    expect(report.totals.nonSavers).toBe(1);
    expect(report.totals.savers + report.totals.nonSavers).toBe(
      report.totals.members
    );
  });

  it("counts only registered members, and the totals add up", async () => {
    const report = (await buildDistrictReport(associationId))!;

    // The pending applicant in Gasabo is not on the register yet.
    expect(report.totals.members).toBe(6);
    expect(report.totals.active).toBe(5);
    expect(report.totals.savings).toBe("4800.00");
    expect(report.totals.averageSavings).toBe("800.00");
    expect(report.totals.districts).toBe(3);
  });
});
