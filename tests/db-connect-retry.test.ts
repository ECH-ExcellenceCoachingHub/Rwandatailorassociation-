import { describe, expect, it } from "vitest";
import {
  ResilientPool,
  connectWithRetry,
  isTransientConnectError,
} from "@/lib/db/prisma";

/**
 * Connection retry.
 *
 * The hosted database is reached over connections where a DNS lookup fails
 * outright for a second at a time. Before this existed, one failed lookup on a
 * fresh pool connection surfaced as P1001 and took the whole page down, while
 * the very next click worked. These tests pin both halves of the fix: that a
 * blip is retried, and — just as important — that nothing else is.
 */

function socketError(code: string): Error {
  return Object.assign(new Error(`getaddrinfo ${code} db.example`), {
    code,
    syscall: "getaddrinfo",
    errno: -3008,
  });
}

describe("isTransientConnectError", () => {
  it("treats DNS, refused and reset connections as transient", () => {
    for (const code of ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"]) {
      expect(isTransientConnectError(socketError(code))).toBe(true);
    }
    expect(isTransientConnectError(new Error("Connection terminated unexpectedly"))).toBe(true);
  });

  it("does not retry real errors or a full pool", () => {
    // Wrong password: retrying only earns a lockout.
    expect(
      isTransientConnectError(Object.assign(new Error("password authentication failed"), { code: "28P01" }))
    ).toBe(false);
    // Waiting for a free slot timed out: retrying piles onto a full pool.
    expect(isTransientConnectError(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isTransientConnectError(null)).toBe(false);
  });
});

describe("connectWithRetry", () => {
  it("recovers from a blip", async () => {
    let calls = 0;
    const result = await connectWithRetry(async () => {
      calls++;
      if (calls < 3) throw socketError("ENOTFOUND");
      return "connected";
    }, [0, 0, 0]);

    expect(result).toBe("connected");
    expect(calls).toBe(3);
  });

  it("gives up once the delays are spent", async () => {
    let calls = 0;
    await expect(
      connectWithRetry(async () => {
        calls++;
        throw socketError("ENOTFOUND");
      }, [0, 0])
    ).rejects.toMatchObject({ code: "ENOTFOUND" });

    expect(calls).toBe(3);
  });

  it("fails immediately on an error that is not transient", async () => {
    let calls = 0;
    await expect(
      connectWithRetry(async () => {
        calls++;
        throw Object.assign(new Error("password authentication failed"), { code: "28P01" });
      }, [0, 0, 0])
    ).rejects.toMatchObject({ code: "28P01" });

    expect(calls).toBe(1);
  });
});

describe("ResilientPool", () => {
  // `.invalid` is reserved (RFC 2606) and never resolves, so this is a real
  // ENOTFOUND from the real driver rather than a mock of one.
  const unreachable = () =>
    new ResilientPool({ host: "rta-test.invalid", port: 5432, connectionTimeoutMillis: 5_000 });

  it("retries through pool.query's callback path and then reports the failure", async () => {
    const pool = unreachable();
    const started = Date.now();

    // pool.query() calls this.connect(callback) internally, so this proves the
    // callback form of the override works, not just the promise form.
    await expect(pool.query("SELECT 1")).rejects.toMatchObject({ code: "ENOTFOUND" });

    // Three retries at 200 + 600 + 1500ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_000);
    await pool.end();
  });

  it("retries through the promise form Prisma uses for transactions", async () => {
    const pool = unreachable();
    await expect(pool.connect()).rejects.toMatchObject({ code: "ENOTFOUND" });
    await pool.end();
  });
});
