import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { multiply, toMoneyString } from "@/lib/money";
import { postSavingsTransaction, verifyAccountIntegrity } from "@/lib/services/ledger";
import { getPolicy } from "@/lib/services/rulebook";
import {
  assessFines,
  getMemberStanding,
  resetSavingsClock,
  settleFine,
} from "@/lib/services/contributions";
import { applyMemberAction } from "@/lib/services/members";

/**
 * Restarting a member's saving clock, against a real database.
 *
 * The member was approved twenty days before anybody expected them to save,
 * was fined, had one fine collected from their savings and owes another. A
 * reset must leave them owing nothing, with the collected fine paid back and
 * the ledger still replaying — and must not stop the next genuine fine from
 * being assessed on a day number an old fine already holds.
 */

const RUN = `RSET${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);
const DAY = 86_400_000;

// Midday, so no step below lands on a different calendar day in Kigali.
const approvedAt = new Date(Date.UTC(2026, 0, 1, 10));
const at = (days: number) => new Date(approvedAt.getTime() + days * DAY);

let associationId: string;
let adminId: string;
let memberId: string;
let pendingMemberId: string;
let savingsAccountId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `Clock Reset Test ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@reset.test`,
      firstName: "Reset",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminId = admin.id;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member-${RUN.toLowerCase()}@reset.test`,
      firstName: "Reset",
      lastName: "Member",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M1`,
          paymentReference: `${CODE}-1`,
          status: "ACTIVE",
          approvedAt,
          joinedAt: approvedAt,
          savingsAccounts: {
            create: { associationId, accountNumber: `${CODE}-SA-1`, currency: "RWF", balance: "0" },
          },
        },
      },
    },
    include: { member: { include: { savingsAccounts: true } } },
  });
  memberId = user.member!.id;
  savingsAccountId = user.member!.savingsAccounts[0].id;

  const pending = await prisma.user.create({
    data: {
      associationId,
      email: `pending-${RUN.toLowerCase()}@reset.test`,
      firstName: "Pending",
      lastName: "Applicant",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M2`,
          paymentReference: `${CODE}-2`,
          status: "PENDING_APPROVAL",
        },
      },
    },
    include: { member: true },
  });
  pendingMemberId = pending.member!.id;
});

afterAll(async () => {
  await prisma.notificationDelivery.deleteMany({
    where: { notification: { associationId } },
  });
  await prisma.notification.deleteMany({ where: { associationId } });
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.contributionFine.deleteMany({ where: { associationId } });
  await prisma.memberContributionStanding.deleteMany({ where: { associationId } });
  await prisma.savingsTransaction.deleteMany({ where: { associationId } });
  await prisma.savingsAccount.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.associationRule.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

describe("resetSavingsClock", () => {
  it("clears the arrears and fines of a member counted before they started", async () => {
    const policy = await getPolicy(associationId);
    const dailyTotal = policy.dailyTotal;

    // Four days' worth paid in, so there is something to collect a fine from.
    const deposit = toMoneyString(multiply(dailyTotal, 4));
    await postSavingsTransaction({
      savingsAccountId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: deposit,
      channel: "CASH",
      valueDate: at(1),
    });

    // Day 20: sixteen days behind, fined once, and the fine is collected.
    const first = await assessFines(associationId, { asOf: at(19), memberIds: [memberId] });
    expect(first.assessed).toBe(1);
    const collected = await prisma.contributionFine.findFirstOrThrow({
      where: { memberId },
      select: { id: true, amount: true, dueDayIndex: true },
    });
    await settleFine({ associationId, fineId: collected.id, actorId: adminId });

    // Day 31: far enough behind for a second fine, which stays owed.
    const second = await assessFines(associationId, { asOf: at(30), memberIds: [memberId] });
    expect(second.assessed).toBe(1);

    const before = await getMemberStanding(memberId, { asOf: at(30) });
    expect(before!.missedDays).toBeGreaterThan(0);
    expect(Number(before!.outstandingFineAmount)).toBeGreaterThan(0);

    const outcome = await resetSavingsClock({
      memberId,
      actorId: adminId,
      reason: "Approved during the trial period",
      asOf: at(30),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.reset.finesWaived).toBe(1);
    expect(outcome.reset.finesRefunded).toBe(1);
    expect(outcome.reset.amountRefunded).toBe(toMoneyString(collected.amount));

    const fines = await prisma.contributionFine.findMany({
      where: { memberId },
      orderBy: { assessedAt: "asc" },
      select: { status: true, cycle: true, waiverReason: true },
    });
    expect(fines.map((fine) => fine.status)).toEqual(["CANCELLED", "WAIVED"]);
    expect(fines.every((fine) => fine.cycle === 0)).toBe(true);
    expect(fines.every((fine) => fine.waiverReason?.includes("trial period"))).toBe(true);

    // The collected fine is back in their savings, and the ledger agrees.
    const account = await prisma.savingsAccount.findUniqueOrThrow({
      where: { id: savingsAccountId },
      select: { balance: true },
    });
    expect(toMoneyString(account.balance)).toBe(deposit);
    const integrity = await verifyAccountIntegrity(savingsAccountId);
    expect(integrity.ok).toBe(true);

    // Day one of the new run, with four days already paid for.
    const after = await getMemberStanding(memberId, { asOf: at(30) });
    expect(after!.dueDays).toBe(1);
    expect(after!.missedDays).toBe(0);
    expect(after!.status).toBe("CURRENT");
    expect(after!.outstandingFineAmount).toBe("0.00");
    expect(after!.obligationStart.getTime()).toBe(at(30).getTime());
  });

  it("still fines the new run on a day number an old fine holds", async () => {
    const old = await prisma.contributionFine.findFirstOrThrow({
      where: { memberId, status: "CANCELLED" },
      select: { dueDayIndex: true },
    });

    // Reset on day 30; the new run reaches the old fine's day number here.
    const asOf = at(30 + old.dueDayIndex - 1);
    const run = await assessFines(associationId, { asOf, memberIds: [memberId] });
    expect(run.assessed).toBe(1);

    const fresh = await prisma.contributionFine.findFirstOrThrow({
      where: { memberId, status: "OUTSTANDING" },
      select: { cycle: true, dueDayIndex: true },
    });
    expect(fresh.cycle).toBe(1);
    expect(fresh.dueDayIndex).toBe(old.dueDayIndex);
  });

  it("is refused for somebody whose saving has not started", async () => {
    const outcome = await applyMemberAction({
      action: "reset_savings",
      memberId: pendingMemberId,
      actorId: adminId,
      reason: "Trial period",
    });
    expect(outcome.ok).toBe(false);
  });
});
