import { describe, expect, it } from "vitest";
import {
  CLOSABLE_STATUSES,
  removalBlockers,
  type MemberHistory,
} from "@/lib/member-removal";
import { allowedMemberActions, canTake } from "@/lib/member-actions";

/**
 * Who may be erased, and who may only be closed.
 *
 * The line is money: a record that never held any may go; anything the
 * association's accounts are built from must stay.
 */

const untouched: MemberHistory = {
  savingsTransactions: 0,
  savingsBalance: "0.00",
  withdrawals: 0,
  loanApplications: 0,
  loans: 0,
  payments: 0,
  fines: 0,
  serviceFees: 0,
  interestShares: 0,
  warehouse: 0,
  guarantees: 0,
};

describe("deleting a member", () => {
  it("is allowed for a record money never touched", () => {
    expect(removalBlockers(untouched)).toEqual([]);
  });

  it("is refused once a single savings transaction exists", () => {
    expect(removalBlockers({ ...untouched, savingsTransactions: 1 })).toEqual([
      { key: "savingsTransactions", count: 1 },
    ]);
  });

  it("is refused when the cached balance is not zero, even with no transactions", () => {
    // The cache and the ledger disagreeing is a reason to stop and look,
    // not to erase the evidence.
    expect(removalBlockers({ ...untouched, savingsBalance: "0.01" })).toEqual([
      { key: "savingsBalance", count: 0 },
    ]);
  });

  it("is refused for money that was matched to them but never posted", () => {
    // Payment links are SetNull: deleting would quietly turn attributed
    // money back into unattributed money.
    expect(removalBlockers({ ...untouched, payments: 2 })).toEqual([
      { key: "payments", count: 2 },
    ]);
  });

  it("is refused while they stand guarantor for somebody else's loan", () => {
    expect(removalBlockers({ ...untouched, guarantees: 1 })).toEqual([
      { key: "guarantees", count: 1 },
    ]);
  });

  it("reports every obstacle, in a fixed order, so the screen can list them", () => {
    const blockers = removalBlockers({
      ...untouched,
      guarantees: 1,
      loans: 2,
      savingsTransactions: 40,
      savingsBalance: "12000",
    });

    expect(blockers.map((b) => b.key)).toEqual([
      "savingsTransactions",
      "savingsBalance",
      "loans",
      "guarantees",
    ]);
  });
});

describe("closing a membership", () => {
  it("is open to members who are active, suspended or inactive", () => {
    expect(CLOSABLE_STATUSES.has("ACTIVE")).toBe(true);
    expect(CLOSABLE_STATUSES.has("SUSPENDED")).toBe(true);
    expect(CLOSABLE_STATUSES.has("INACTIVE")).toBe(true);
  });

  it("is not how a pending application ends, nor something done twice", () => {
    expect(CLOSABLE_STATUSES.has("PENDING_APPROVAL")).toBe(false);
    expect(CLOSABLE_STATUSES.has("REJECTED")).toBe(false);
    expect(CLOSABLE_STATUSES.has("EXITED")).toBe(false);
  });
});

describe("which decisions the screens offer", () => {
  const member = {
    status: "ACTIVE" as const,
    kycStatus: "PENDING" as const,
    hasNationalId: true,
    isSelf: false,
  };

  it("offers suspension to an active member and reopening to a closed one", () => {
    expect(canTake("suspend", member)).toBe(true);
    expect(canTake("reopen", member)).toBe(false);
    expect(canTake("suspend", { ...member, status: "EXITED" })).toBe(false);
    expect(canTake("reopen", { ...member, status: "EXITED" })).toBe(true);
  });

  it("keeps approval to pending applications", () => {
    expect(canTake("approve", member)).toBe(false);
    expect(canTake("approve", { ...member, status: "PENDING_APPROVAL" })).toBe(true);
    expect(canTake("decline", { ...member, status: "PENDING_APPROVAL" })).toBe(true);
  });

  it("will not verify an identity with no national ID to verify it against", () => {
    expect(canTake("verify", member)).toBe(true);
    expect(canTake("verify", { ...member, hasNationalId: false })).toBe(false);
    expect(canTake("verify", { ...member, kycStatus: "VERIFIED" })).toBe(false);
  });

  it("never lets administrators suspend, close or delete themselves", () => {
    const self = { ...member, isSelf: true };
    expect(canTake("suspend", self)).toBe(false);
    expect(canTake("close", self)).toBe(false);
    expect(canTake("delete", self)).toBe(false);
  });

  it("follows the permission behind each action", () => {
    expect(allowedMemberActions(new Set(["members.suspend"]))).toEqual([
      "suspend",
      "reactivate",
      "reopen",
    ]);
    expect(allowedMemberActions(new Set(["members.delete"]))).toEqual(["close", "delete"]);
    expect(allowedMemberActions(new Set())).toEqual([]);
  });
});
