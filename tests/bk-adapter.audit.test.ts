import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normaliseBkTransaction,
  fetchBkTransactions,
  getAccessToken,
  clearTokenCache,
} from "@/lib/bk/bk-adapter";
import { BkApiError } from "@/lib/bk/types";
import type { BkApiTransaction } from "@/lib/bk/types";

/**
 * Independent verification of the Bank of Kigali adapter.
 *
 * These tests exercise the shipped code unmodified. They assert the behaviour
 * the integration is supposed to have, so a failure here is a defect in the
 * integration rather than in the test.
 */

// --- fixtures --------------------------------------------------------------

function bkTransaction(overrides: Partial<BkApiTransaction> = {}): BkApiTransaction {
  return {
    clientId: "client-123",
    clientReference: "RTA-000123",
    debitedAccount: "10008***1234",
    debitedAccountOwnerNames: "JOHN DOE",
    debitCurrency: "RWF",
    creditedAccount: "10008***4321",
    creditedAccountOwnerNames: "RTA COLLECTIONS",
    creditCurrency: "RWF",
    amount: 5000,
    narration: "Savings deposit RTA-000123",
    serviceCode: "BK_TO_BK",
    transactionReference: "TXN-REF-9001",
    extras: {
      id: "ORD_0001",
      amount: 5000,
      status: "SUCCESS",
      currency: "RWF",
      narration: "Savings deposit RTA-000123",
      payerNames: "JOHN DOE",
      payerAccount: "1000812341234",
      payerContact: "250788123456",
      payeeAccount: "1000843214321",
      paymentCode: "PAYCODE-77",
      createdDate: "2026-09-01 10:15:30",
      updatedDate: "2026-09-01 10:15:35",
    },
    ...overrides,
  };
}

/**
 * BK authenticates at `identity/authenticate` with a JSON body, not at an
 * OAuth token endpoint. The response body is not published and the sandbox
 * credentials available are expired, so this is the shape the adapter is
 * written to read; `extractToken` accepts the other plausible spellings too.
 */
function tokenResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      accessToken: "tok-abc",
      sessionId: "sess-123",
      expiresIn: 3600,
    }),
    text: async () => "",
  };
}

const isAuthCall = (url: unknown) => String(url).includes("/identity/authenticate");

function pageResponse(
  content: BkApiTransaction[],
  page = { size: 50, number: 0, totalElements: content.length, totalPages: 1 }
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content, page }),
    text: async () => "",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await clearTokenCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- normalisation ---------------------------------------------------------

describe("normaliseBkTransaction", () => {
  it("maps the BK payload onto the storage shape", () => {
    const n = normaliseBkTransaction(bkTransaction());

    expect(n.bkTransactionId).toBe("ORD_0001");
    expect(n.amount).toBe("5000.00");
    expect(n.currency).toBe("RWF");
    expect(n.payerNames).toBe("JOHN DOE");
    expect(n.payerContact).toBe("250788123456");
    expect(n.bkPaymentCode).toBe("PAYCODE-77");
    expect(n.narration).toBe("Savings deposit RTA-000123");
  });

  it("parses the space-separated timestamps BK returns", () => {
    const n = normaliseBkTransaction(bkTransaction());
    expect(n.transactionDate).toBeInstanceOf(Date);
    expect(Number.isNaN(n.transactionDate!.getTime())).toBe(false);
  });

  it("pins BK timestamps to Kigali time, not the server's local zone", () => {
    // "2026-09-01 10:15:30" carries no offset, and BK's own error envelopes
    // label its clock CAT. Read as the server's local time instead, the same
    // transaction would be a different instant — and sometimes a different
    // day — on a UTC host than on a Kigali one. Asserting the absolute instant
    // makes this independent of wherever the test itself is running.
    const n = normaliseBkTransaction(bkTransaction());

    expect(n.transactionDate!.toISOString()).toBe("2026-09-01T08:15:30.000Z");
  });

  it("yields null, never an Invalid Date, for an unparseable timestamp", () => {
    const extras = { ...bkTransaction().extras!, createdDate: "not-a-date" };
    const n = normaliseBkTransaction(bkTransaction({ extras }));

    // An Invalid Date reaching Prisma throws at insert time and loses the row.
    expect(n.transactionDate === null || !Number.isNaN(n.transactionDate.getTime())).toBe(true);
  });

  it("does not invent a transaction id that changes between syncs", () => {
    // A payload with no extras.id and no transactionReference must still
    // dedupe against itself, or every sync re-inserts the same money.
    const raw = bkTransaction({ extras: undefined, transactionReference: undefined });

    const first = normaliseBkTransaction(raw);
    const second = normaliseBkTransaction(raw);

    expect(second.bkTransactionId).toBe(first.bkTransactionId);
  });

  it("does not collapse two distinct id-less transactions onto one id", () => {
    const a = normaliseBkTransaction(
      bkTransaction({ extras: undefined, transactionReference: undefined, amount: 100 })
    );
    const b = normaliseBkTransaction(
      bkTransaction({ extras: undefined, transactionReference: undefined, amount: 900 })
    );

    expect(a.bkTransactionId).not.toBe(b.bkTransactionId);
  });
});

// --- authentication --------------------------------------------------------

describe("getAccessToken", () => {
  it("caches the token across calls", async () => {
    fetchMock.mockResolvedValue(tokenResponse());

    await getAccessToken();
    await getAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates after the cache is cleared", async () => {
    fetchMock.mockResolvedValue(tokenResponse());

    await getAccessToken();
    await clearTokenCache();
    await getAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("raises AUTH_FAILED on rejected credentials", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "bad creds" });

    await expect(getAccessToken()).rejects.toMatchObject({
      name: "BkApiError",
      code: "AUTH_FAILED",
    });
  });

  it("authenticates at identity/authenticate with a JSON apiKey/apiSecret body", async () => {
    // Probed against the sandbox: /api/oauth/token does not exist there, and
    // every other /openAPI route answers AUTHENTICATION_REQUIRED_2 until this
    // call has been made. The body field names come from the 400 the endpoint
    // returns when they are missing.
    fetchMock.mockResolvedValue(tokenResponse());

    await getAccessToken();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(url).toContain("/api/bankingAsService/openAPI/identity/authenticate");
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Channel"]).toBe("OpenApi");

    const body = JSON.parse(String(init.body));
    expect(body).toHaveProperty("apiKey");
    expect(body).toHaveProperty("apiSecret");
    expect(body.apiKey).toBeTruthy();
    expect(body.apiSecret).toBeTruthy();
  });

  it("carries the session id from authenticate onto later calls", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url) ? tokenResponse() : pageResponse([])
    );

    await fetchBkTransactions({});

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("getTransactions"));
    const headers = (call?.[1] as RequestInit).headers as Record<string, string>;

    expect(headers["X-Session"]).toBe("sess-123");
    expect(headers.Authorization).toBe("Bearer tok-abc");
  });
});

// --- transaction fetching --------------------------------------------------

describe("fetchBkTransactions", () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url) ? tokenResponse() : pageResponse([bkTransaction()])
    );
  });

  function lastTransactionUrl(): string {
    return (
      fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("getTransactions"))
        .pop() ?? ""
    );
  }

  it("returns normalised transactions", async () => {
    const { transactions } = await fetchBkTransactions({ page: 0, size: 50 });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].bkTransactionId).toBe("ORD_0001");
  });

  it("sends the page and size the caller asked for", async () => {
    await fetchBkTransactions({ page: 3, size: 25 });

    expect(lastTransactionUrl()).toContain("page=3");
    expect(lastTransactionUrl()).toContain("size=25");
  });

  it("sends the date window to BK rather than dropping it", async () => {
    // Without this the lookback window does nothing: every run asks BK for the
    // same unfiltered first pages and pages forward through all history.
    await fetchBkTransactions({
      page: 0,
      size: 50,
      fromDate: new Date("2026-09-01T00:00:00Z"),
      toDate: new Date("2026-09-02T00:00:00Z"),
    });

    expect(lastTransactionUrl()).toMatch(/2026-09-01/);
  });

  it("reports hasMore on a middle page", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url)
        ? tokenResponse()
        : pageResponse([bkTransaction()], { size: 50, number: 1, totalElements: 300, totalPages: 6 })
    );

    expect((await fetchBkTransactions({ page: 1 })).hasMore).toBe(true);
  });

  it("reports hasMore=false on the final page", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url)
        ? tokenResponse()
        : pageResponse([bkTransaction()], { size: 50, number: 5, totalElements: 300, totalPages: 6 })
    );

    expect((await fetchBkTransactions({ page: 5 })).hasMore).toBe(false);
  });

  it("clears the token cache and signals retry on 401", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url)
        ? tokenResponse()
        : { ok: false, status: 401, text: async () => "expired" }
    );

    await expect(fetchBkTransactions({})).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
      retryable: true,
    });

    // The cache must be empty, so the next attempt re-authenticates.
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(tokenResponse());
    await getAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks a 429 as retryable", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url)
        ? tokenResponse()
        : { ok: false, status: 429, text: async () => "slow down" }
    );

    await expect(fetchBkTransactions({})).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("reports a malformed page envelope as INVALID_RESPONSE", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isAuthCall(url)
        ? tokenResponse()
        : { ok: true, status: 200, json: async () => ({ content: [] }), text: async () => "" }
    );

    // A missing `page` object must surface as a typed error, not as a
    // TypeError laundered into a retryable NETWORK failure.
    await expect(fetchBkTransactions({})).rejects.toBeInstanceOf(BkApiError);
    await expect(fetchBkTransactions({})).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
