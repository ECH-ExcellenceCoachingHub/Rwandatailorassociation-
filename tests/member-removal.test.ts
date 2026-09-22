import { describe, expect, it } from "vitest";
import {
  CLOSABLE_STATUSES,
  historyToErase,
  type MemberHistory,
} from "@/lib/member-removal";
import { allowedMemberActions, canTake } from "@/lib/member-actions";

/**
 * What deleting a member takes with them, and when closing is the answer.
 *
 * Any member may be deleted — test accounts are exactly the ones with a few
 * transactions on them — but the administrator is told everything that goes
 * with them first, so a ledger is never erased by somebody who did not know
 * it was there.
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
  it("has nothing to warn about for a record money never touched", () => {
    expect(historyToErase(untouched)).toEqual([]);
  });

  it("names a single savings transaction", () => {
    expect(historyToErase({ ...untouched, savingsTransactions: 1 })).toEqual([
      { key: "savingsTransactions", count: 1 },
    ]);
  });

  it("names a balance even with no transactions behind it", () => {
    // The cache and the ledger disagreeing is exactly what the administrator
    // should hear about before erasing both.
    expect(historyToErase({ ...untouched, savingsBalance: "0.01" })).toEqual([
      { key: "savingsBalance", count: 0 },
    ]);
  });

  it("names payments matched to them, which go back to the unmatched queue", () => {
    expect(historyToErase({ ...untouched, payments: 2 })).toEqual([
      { key: "payments", count: 2 },
    ]);
  });

  it("names guarantees they gave on somebody else's loan", () => {
    expect(historyToErase({ ...untouched, guarantees: 1 })).toEqual([
      { key: "guarantees", count: 1 },
    ]);
  });

  it("lists everything, in a fixed order, so the screen can show it", () => {
    const history = historyToErase({
      ...untouched,
      guarantees: 1,
      loans: 2,
      savingsTransactions: 40,
      savingsBalance: "12000",
    });

    expect(history.map((entry) => entry.key)).toEqual([
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
