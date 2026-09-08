import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { BkApiError } from "@/lib/bk/types";
import {
  createBkPaymentClaim,
  markClaimsObserved,
  listBkPaymentClaims,
} from "@/lib/services/bk-claims";

/**
 * The claim half of the BK loop.
 *
 * The case that matters is the round trip: a claim we raised is only useful if
 * the transaction sync can later recognise the same money coming back. These
 * tests drive that end to end with BK stubbed, since the sandbox credentials
 * are expired.
 */

const RUN = `BKC${Date.now().toString(36).toUpperCase()}`;
const CODE = RUN.slice(0, 8);

let associationId: string;
let adminUserId: string;
let memberId: string;

beforeAll(async () => {
  const association = await prisma.association.create({
    data: { code: CODE, name: `BK Claims ${RUN}`, status: "ACTIVE", currency: "RWF" },
  });
  associationId = association.id;

  const admin = await prisma.user.create({
    data: {
      associationId,
      email: `admin-${RUN.toLowerCase()}@bkclaims.test`,
      firstName: "Claim",
      lastName: "Admin",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  adminUserId = admin.id;

  const user = await prisma.user.create({
    data: {
      associationId,
      email: `member-${RUN.toLowerCase()}@bkclaims.test`,
      phone: "+250788400001",
      firstName: "Claim",
      lastName: "Member",
      passwordHash: "x",
      role: "MEMBER",
      status: "ACTIVE",
      member: {
        create: {
          associationId,
          memberNumber: `${CODE}-M000001`,
          paymentReference: `${CODE}-000001`,
          status: "ACTIVE",
        },
      },
    },
    include: { member: true },
  });
  memberId = user.member!.id;
});

afterAll(async () => {
  await prisma.bkPaymentClaim.deleteMany({ where: { associationId } });
  await prisma.bkTransaction.deleteMany({ where: { associationId } });
  await prisma.auditLog.deleteMany({ where: { associationId } });
  await prisma.member.deleteMany({ where: { associationId } });
  await prisma.user.deleteMany({ where: { associationId } });
  await prisma.association.delete({ where: { id: associationId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

async function stubClaim(response: unknown) {
  const bk = await import("@/lib/bk");
  return vi.spyOn(bk, "claimPayment").mockResolvedValue(response as never);
}

describe("createBkPaymentClaim", () => {
  it("records the claim and returns BK's reference", async () => {
    await stubClaim({
      request: {},
      expiryTime: "2026-09-10 12:14:58",
      status: "CLAIMED",
    });

    const result = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Monthly savings",
      amount: 5000,
      memberId,
      createdById: adminUserId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await prisma.bkPaymentClaim.findUniqueOrThrow({
      where: { id: result.claimId },
    });

    expect(stored.status).toBe("CLAIMED");
    expect(stored.payerCode).toBe("123456");
    expect(stored.amount.toFixed(2)).toBe("5000.00");
    expect(stored.memberId).toBe(memberId);
    expect(stored.observedAt).toBeNull();
    expect(stored.clientReference).toBe(result.clientReference);
  });

  it("gives every claim its own client reference", async () => {
    await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const first = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "One",
      amount: 100,
      createdById: adminUserId,
    });
    const second = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Two",
      amount: 100,
      createdById: adminUserId,
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // BK uses clientReference for duplicate detection, so a repeated value
    // would make the second claim vanish into the first.
    expect(second.clientReference).not.toBe(first.clientReference);
  });

  it("rejects a payer code that is not six digits", async () => {
    const spy = await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const result = await createBkPaymentClaim({
      associationId,
      payerCode: "12345",
      narration: "Too short",
      amount: 100,
      createdById: adminUserId,
    });

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount without calling BK", async () => {
    const spy = await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const result = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Zero",
      amount: 0,
      createdById: adminUserId,
    });

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a member from another association", async () => {
    const other = await prisma.association.create({
      data: { code: `Z${CODE.slice(1)}`, name: `Other ${RUN}`, status: "ACTIVE", currency: "RWF" },
    });
    const outsider = await prisma.user.create({
      data: {
        associationId: other.id,
        email: `outsider-${RUN.toLowerCase()}@bkclaims.test`,
        firstName: "Out",
        lastName: "Sider",
        passwordHash: "x",
        role: "MEMBER",
        status: "ACTIVE",
        member: {
          create: {
            associationId: other.id,
            memberNumber: `Z-M000001`,
            paymentReference: `Z-000001`,
            status: "ACTIVE",
          },
        },
      },
      include: { member: true },
    });

    const result = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Cross tenant",
      amount: 100,
      memberId: outsider.member!.id,
      createdById: adminUserId,
    });

    expect(result.ok).toBe(false);

    await prisma.member.deleteMany({ where: { associationId: other.id } });
    await prisma.user.deleteMany({ where: { associationId: other.id } });
    await prisma.association.delete({ where: { id: other.id } });
  });

  it("keeps a record when BK rejects the claim", async () => {
    // The credentials-expired case. The claim must still be recorded, or a
    // failed attempt leaves no trace to investigate.
    const bk = await import("@/lib/bk");
    vi.spyOn(bk, "claimPayment").mockRejectedValue(
      new BkApiError("Client credentials expired", "AUTH_FAILED", false, 401)
    );

    const result = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Will fail",
      amount: 250,
      createdById: adminUserId,
    });

    expect(result.ok).toBe(false);
    if (result.ok || !result.claimId) throw new Error("expected a recorded claim id");

    const stored = await prisma.bkPaymentClaim.findUniqueOrThrow({
      where: { id: result.claimId },
    });

    expect(stored.failed).toBe(true);
    expect(stored.status).toBe("FAILED");
    expect(stored.errorMessage).toContain("expired");
  });
});

describe("markClaimsObserved", () => {
  it("marks a claim seen once a transaction carries its reference", async () => {
    await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const claim = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Round trip",
      amount: 7500,
      createdById: adminUserId,
    });
    if (!claim.ok) throw new Error("claim should have succeeded");

    // BK surfaces the money as a transaction quoting our reference.
    await prisma.bkTransaction.create({
      data: {
        associationId,
        bkTransactionId: `${RUN}-OBSERVED`,
        bkClientReference: claim.clientReference,
        amount: "7500.00",
        currency: "RWF",
      },
    });

    const stamped = await markClaimsObserved(associationId);
    expect(stamped).toBe(1);

    const stored = await prisma.bkPaymentClaim.findUniqueOrThrow({
      where: { id: claim.claimId },
    });
    expect(stored.observedAt).not.toBeNull();
    expect(stored.observedTransactionId).not.toBeNull();
  });

  it("also recognises the reference on the extras envelope", async () => {
    await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const claim = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Extras envelope",
      amount: 1200,
      createdById: adminUserId,
    });
    if (!claim.ok) throw new Error("claim should have succeeded");

    await prisma.bkTransaction.create({
      data: {
        associationId,
        bkTransactionId: `${RUN}-OBSERVED-EXTRAS`,
        bkExtrasClientReference: claim.clientReference,
        amount: "1200.00",
        currency: "RWF",
      },
    });

    expect(await markClaimsObserved(associationId)).toBe(1);
  });

  it("leaves a claim unobserved when no transaction quotes it", async () => {
    await stubClaim({ request: {}, expiryTime: null, status: "CLAIMED" });

    const claim = await createBkPaymentClaim({
      associationId,
      payerCode: "123456",
      narration: "Never arrives",
      amount: 300,
      createdById: adminUserId,
    });
    if (!claim.ok) throw new Error("claim should have succeeded");

    await markClaimsObserved(associationId);

    const stored = await prisma.bkPaymentClaim.findUniqueOrThrow({
      where: { id: claim.claimId },
    });
    expect(stored.observedAt).toBeNull();
  });

  it("does not re-stamp a claim already observed", async () => {
    await markClaimsObserved(associationId);
    expect(await markClaimsObserved(associationId)).toBe(0);
  });
});

describe("listBkPaymentClaims", () => {
  it("returns this association's claims, newest first", async () => {
    const claims = await listBkPaymentClaims(associationId);

    expect(claims.length).toBeGreaterThan(0);
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
        claims[i].createdAt.getTime()
      );
    }
  });
});
