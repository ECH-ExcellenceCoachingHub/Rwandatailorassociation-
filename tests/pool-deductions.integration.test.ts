import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { postSavingsTransaction, verifyAccountIntegrity } from "@/lib/services/ledger";
import {
  PoolDeductionError,
  listMemberPoolDeductions,
  postPoolDeduction,
  previewPoolDeduction,
} from "@/lib/services/pool-deductions";

/**
 * Taking money out of the members' pool, against a real database.
 *
 * Every member's balance must go down by their part, the parts must add up to
 * the amount taken, every ledger must still replay to its cached balance, and
 * every affected member must have been told why.
 */

const RUN = `POOL${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminId: string;
const members: { memberId: string; userId: string; savingsAccountId: string }[] = [];

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `Pool Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@pool.test`,
      firstName: "Pool",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminId = admin.id;

  // Balances 10,000 / 30,000 / 60,000 and shares 1 / 1 / 2.
  const setup = [
    { balance: "10000", shares: 1 },
    { balance: "30000", shares: 1 },
    { balance: "60000", shares: 2 },
  ];
  for (const [index, { balance, shares }] of setup.entries()) {
    const user = await prisma.user.create({
      data: {
        associationId,
        email: `member${index}-${RUN.toLowerCase()}@pool.test`,
        firstName: `Member${index}`,
        lastName: "Pool",
        passwordHash: "x",
        role: "MEMBER",
        status: "ACTIVE",
        member: {
          create: {
            associationId,
            memberNumber: `${CODE}-M${index}`,
            paymentReference: `${CODE}-${index}`,
            status: "ACTIVE",
            sharesSubscribed: shares,
            savingsAccounts: {
              create: {
                associationId,
                accountNumber: `${CODE}-SA-${index}`,
                currency: "RWF",
                balance: "0",
              },
            },
          },
        },
      },
      include: { member: { include: { savingsAccounts: true } } },
    });
    const savingsAccountId = user.member!.savingsAccounts[0]!.id;
    members.push({ memberId: user.member!.id, userId: user.id, savingsAccountId });
    await postSavingsTransaction({
      savingsAccountId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: balance,
      channel: "CASH",
    });
  }
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { associationId } });
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.platformFeeCharge.deleteMany({ where: { associationId } });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.associationDeduction.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

async function balances() {
  const accounts = await prisma.savingsAccount.findMany({
    where: { id: { in: members.map((m) => m.savingsAccountId) } },
    select: { id: true, balance: true, totalDeposits: true },
  });
  return members.map((m) => accounts.find((a) => a.id === m.savingsAccountId)!);
}

describe("pool deductions", () => {
  it("previews an equal split that some members cannot cover, without posting", async () => {
    const plan = await previewPoolDeduction({
      associationId,
      totalAmount: "45000",
      allocation: "EQUAL",
    });
    expect(plan.lines.map((l) => l.amount)).toEqual(["15000.00", "15000.00", "15000.00"]);
    expect(plan.shortfalls).toBe(1);
    expect((await balances()).map((a) => a.balance.toString())).toEqual(["10000", "30000", "60000"]);
  });

  it("refuses to post a split that would take a member below zero", async () => {
    await expect(
      postPoolDeduction({
        associationId,
        actorId: adminId,
        purpose: "ASSOCIATION_EXPENSE",
        title: "Too much",
        reason: "This should never post because one member cannot cover it.",
        totalAmount: "45000",
        allocation: "EQUAL",
      })
    ).rejects.toBeInstanceOf(PoolDeductionError);
    expect(await prisma.associationDeduction.count({ where: { associationId } })).toBe(0);
  });

  it("takes each member's part by balance, notifies them, and leaves the books consistent", async () => {
    const posted = await postPoolDeduction({
      associationId,
      actorId: adminId,
      purpose: "MEMBER_LOAN",
      title: "Loan to Member0 for a sewing machine",
      reason: "Agreed at the general meeting of 28 October to lend from the pool.",
      totalAmount: "20000",
      allocation: "BY_BALANCE",
      beneficiaryMemberId: members[0]!.memberId,
    });
    expect(posted.membersAffected).toBe(3);

    const after = await balances();
    // 20% of each balance.
    expect(after.map((a) => a.balance.toString())).toEqual(["8000", "24000", "48000"]);
    // A deduction is not a withdrawal of contributions: standing is untouched.
    expect(after.map((a) => a.totalDeposits.toString())).toEqual(["10000", "30000", "60000"]);

    const rows = await prisma.savingsTransaction.findMany({
      where: { poolDeductionId: posted.id },
      select: { type: true, direction: true, amount: true, adjustmentReason: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.type === "ADJUSTMENT" && r.direction === "DEBIT")).toBe(true);
    expect(rows.reduce((s, r) => s + Number(r.amount), 0)).toBe(20000);
    expect(rows.every((r) => r.adjustmentReason?.includes("general meeting"))).toBe(true);

    for (const { savingsAccountId } of members) {
      expect((await verifyAccountIntegrity(savingsAccountId)).ok).toBe(true);
    }

    const notifications = await prisma.notification.findMany({
      where: { associationId, eventType: "POOL_DEDUCTION" },
      select: { userId: true, body: true },
    });
    expect(notifications.map((n) => n.userId).sort()).toEqual(members.map((m) => m.userId).sort());
    expect(notifications.every((n) => n.body.includes("general meeting"))).toBe(true);

    const seen = await listMemberPoolDeductions(members[2]!.memberId);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.yourShare).toBe("12000.00");
    expect(seen[0]!.beneficiaryName).toBe("Member0 Pool");
  });
});
