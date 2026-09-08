import "server-only";
import { getEnv } from "@/lib/env";
import { bkLogger } from "@/lib/logger";
import type {
  BkApiResponse,
  BkApiTransaction,
  BkApiPage,
  NormalisedBkTransaction,
  BkHealthCheck,
  BkFetchTransactionsParams,
  BkSession,
  BkClaimRequest,
  BkClaimResponse,
} from "@/lib/bk/types";
import { BkApiError } from "@/lib/bk/types";
import { toMoneyString } from "@/lib/money";

const CHANNEL = "OpenApi";

const OPENAPI = "/api/bankingAsService/openAPI";
const AUTH_ENDPOINT = `${OPENAPI}/identity/authenticate`;
const SESSIONS_ENDPOINT = `${OPENAPI}/identity/getSessions`;
const TRANSACTION_ENDPOINT = `${OPENAPI}/transaction/transfer/getTransactions`;
const CLAIM_ENDPOINT = `${OPENAPI}/payment/claim`;

/**
 * BK reports timestamps in Kigali local time with no offset attached
 * ("2025-06-24 12:14:58"), which its own error envelopes label CAT. Rwanda
 * does not observe daylight saving, so the offset is a fixed +02:00.
 *
 * Parsing these without an explicit offset would read them as the *server's*
 * local time, so the same transaction would land on a different instant — and
 * sometimes a different day — depending on where the worker happens to run.
 */
const BK_UTC_OFFSET = "+02:00";

interface SessionCache {
  accessToken: string;
  expiresAt: Date;
  sessionId: string | null;
}

let sessionCache: SessionCache | null = null;

/** Parses a BK timestamp, returning null rather than an Invalid Date. */
function parseBkDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Already carries an offset or a zone (ISO-8601 from the session endpoints).
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const isoish = trimmed.replace(" ", "T");
  const parsed = new Date(hasZone ? isoish : `${isoish}${BK_UTC_OFFSET}`);

  // `new Date` never throws: it yields an Invalid Date, which would only fail
  // later at the database boundary and take the whole row down with it.
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A stable identity for a transaction that BK gave no id.
 *
 * Falling back to a clock reading would mint a new id on every sync — the same
 * money re-imported forever — while simultaneously colliding any two id-less
 * transactions read in the same millisecond. Deriving the id from the payload
 * instead means an identical transaction always resolves to an identical id,
 * and two different ones never share it.
 */
function syntheticId(raw: BkApiTransaction): string {
  const parts = [
    raw.clientReference,
    raw.debitedAccount,
    raw.creditedAccount,
    raw.amount,
    raw.narration,
    raw.createdDate,
  ].map((p) => (p === undefined || p === null ? "" : String(p)));

  let hash = 5381;
  const material = parts.join("|");
  for (let i = 0; i < material.length; i++) {
    hash = ((hash << 5) + hash + material.charCodeAt(i)) >>> 0;
  }

  return `BK-SYNTH-${hash.toString(16).padStart(8, "0")}`;
}

export function normaliseBkTransaction(raw: BkApiTransaction): NormalisedBkTransaction {
  const extras = raw.extras;

  return {
    bkTransactionId: extras?.id ?? raw.transactionReference ?? syntheticId(raw),
    bkClientReference: raw.clientReference ?? null,
    bkTransactionReference: raw.transactionReference ?? null,
    bkPaymentCode: extras?.paymentCode ?? null,
    bkExtrasClientReference: extras?.clientReference ?? null,
    amount: toMoneyString(extras?.amount ?? raw.amount ?? 0),
    currency: extras?.currency ?? raw.creditCurrency ?? raw.debitCurrency ?? "RWF",
    bkStatus: raw.status ?? null,
    bkExtrasStatus: extras?.status ?? null,
    payerNames: extras?.payerNames ?? raw.debitedAccountOwnerNames ?? null,
    payerAccount: extras?.payerAccount ?? raw.debitedAccount ?? null,
    payerContact: extras?.payerContact ?? null,
    payeeNames: extras?.payeeNames ?? raw.creditedAccountOwnerNames ?? null,
    payeeAccount: extras?.payeeAccount ?? raw.creditedAccount ?? null,
    beneficiaryNames: raw.beneficiaryNames ?? null,
    beneficiaryBank: raw.beneficiaryBank ?? null,
    beneficiaryBankCode: raw.beneficiaryBankCode ?? null,
    narration: extras?.narration ?? raw.narration ?? null,
    serviceCode: raw.serviceCode ?? null,
    transferType: extras?.transferType ?? null,
    sourceChannel: extras?.sourceChannel ?? null,
    transactionStage: raw.transactionStage ?? null,
    transactionStatus: raw.transactionStatus ?? null,
    transactionStatusComment: raw.transactionStatusComment ?? null,
    digitalProfileId: raw.digitalProfileId ?? null,
    debitedAccount: raw.debitedAccount ?? null,
    debitedAccountOwnerNames: raw.debitedAccountOwnerNames ?? null,
    creditedAccount: raw.creditedAccount ?? null,
    creditedAccountOwnerNames: raw.creditedAccountOwnerNames ?? null,
    debitCurrency: raw.debitCurrency ?? null,
    creditCurrency: raw.creditCurrency ?? null,
    debitAccount: extras?.payerAccount ?? raw.debitedAccount ?? null,
    creditAccount: extras?.payeeAccount ?? raw.creditedAccount ?? null,
    transactionDate: parseBkDate(extras?.createdDate ?? raw.createdDate),
    createdDate: parseBkDate(raw.createdDate),
    updatedDate: parseBkDate(raw.updatedDate ?? extras?.updatedDate),
    rawPayload: raw,
  };
}

// --- credentials -----------------------------------------------------------

function credentials(): { apiKey: string; apiSecret: string; baseUrl: string } {
  const env = getEnv();

  // BK_CLIENT_ID/SECRET are optional in the environment schema, so an install
  // that has not been given credentials reaches this point with undefined.
  // Posting "undefined" at a bank earns an opaque 404 that looks like an
  // outage; failing here says what is actually wrong.
  if (!env.BK_CLIENT_ID || !env.BK_CLIENT_SECRET) {
    throw new BkApiError(
      "BK credentials are not configured. Set BK_CLIENT_ID and BK_CLIENT_SECRET.",
      "NOT_CONFIGURED",
      false
    );
  }

  return {
    apiKey: env.BK_CLIENT_ID,
    apiSecret: env.BK_CLIENT_SECRET,
    baseUrl: env.BK_API_BASE_URL,
  };
}

/**
 * Pulls the bearer token out of an authenticate response.
 *
 * BK's published documentation does not show this response body, and the
 * sandbox credentials we hold are expired, so the exact field name could not
 * be confirmed against a live 200. The candidates below cover the shapes BK
 * uses elsewhere; anything unrecognised is reported with the keys that were
 * actually present, so the first successful live call names the field itself
 * rather than failing silently.
 */
function extractToken(payload: Record<string, unknown>): { token: string; expiresIn: number } {
  const tokenKeys = ["accessToken", "access_token", "token", "jwt", "idToken"];
  const key = tokenKeys.find((k) => typeof payload[k] === "string" && payload[k]);

  if (!key) {
    throw new BkApiError(
      `BK authenticate returned no recognisable token. Fields present: ${Object.keys(payload).join(", ") || "(none)"}`,
      "INVALID_RESPONSE",
      false
    );
  }

  const expiryKeys = ["expiresIn", "expires_in", "expiry", "ttl"];
  const expiryKey = expiryKeys.find((k) => typeof payload[k] === "number");
  const expiresIn = expiryKey ? (payload[expiryKey] as number) : 3600;

  return { token: payload[key] as string, expiresIn };
}

function extractSessionId(payload: Record<string, unknown>): string | null {
  const keys = ["sessionId", "session_id", "session", "sid", "jti"];
  const key = keys.find((k) => typeof payload[k] === "string" && payload[k]);
  return key ? (payload[key] as string) : null;
}

/**
 * Authenticates against BK and caches the resulting session.
 *
 * The endpoint is `identity/authenticate`, taking JSON `{apiKey, apiSecret}` —
 * not an OAuth token endpoint. Everything under `/openAPI` other than this
 * route sits behind a gateway filter that answers AUTHENTICATION_REQUIRED_2,
 * so this call has to come first.
 */
export async function getAccessToken(): Promise<{
  token: string;
  expiresAt: Date;
  sessionId: string | null;
}> {
  const cached = sessionCache;
  if (cached && cached.expiresAt > new Date()) {
    return { token: cached.accessToken, expiresAt: cached.expiresAt, sessionId: cached.sessionId };
  }

  const { apiKey, apiSecret, baseUrl } = credentials();
  const start = Date.now();
  let latencyMs = 0;

  try {
    const response = await fetch(`${baseUrl}${AUTH_ENDPOINT}`, {
      method: "POST",
      headers: {
        accept: "*/*",
        "Content-Type": "application/json",
        "X-Channel": CHANNEL,
      },
      body: JSON.stringify({ apiKey, apiSecret }),
      signal: AbortSignal.timeout(30_000),
    });

    latencyMs = Date.now() - start;

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      bkLogger.error({ status: response.status, body, latencyMs }, "BK authenticate failed");

      // 401 here means the credentials were recognised but rejected — the
      // sandbox says "Client credentials expired". Retrying cannot help.
      throw new BkApiError(
        `BK authentication failed (${response.status}): ${body.slice(0, 200)}`,
        "AUTH_FAILED",
        false,
        response.status
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const { token, expiresIn } = extractToken(payload);
    const sessionId = extractSessionId(payload);

    // Expire a minute early so a call cannot start with a token that dies
    // while it is in flight.
    const expiresAt = new Date(Date.now() + Math.max(expiresIn - 60, 30) * 1000);

    sessionCache = { accessToken: token, expiresAt, sessionId };

    bkLogger.debug(
      { latencyMs, expiresAt: expiresAt.toISOString(), hasSession: Boolean(sessionId) },
      "BK authenticated"
    );

    return { token, expiresAt, sessionId };
  } catch (error) {
    if (error instanceof BkApiError) throw error;

    const cause = error instanceof Error ? error : String(error);
    bkLogger.error({ latencyMs, cause }, "BK authenticate threw");
    throw new BkApiError("Failed to authenticate with BK", "NETWORK", true, undefined, cause);
  }
}

export async function clearTokenCache(): Promise<void> {
  sessionCache = null;
}

/** Headers every authenticated BK call carries. */
async function authHeaders(): Promise<Record<string, string>> {
  const { token, sessionId } = await getAccessToken();

  const headers: Record<string, string> = {
    accept: "*/*",
    "X-Channel": CHANNEL,
    Authorization: `Bearer ${token}`,
  };

  // BK documents X-Session on the payment and identity routes. It is only
  // sent when authenticate actually returned one.
  if (sessionId) headers["X-Session"] = sessionId;

  return headers;
}

/** Maps a non-OK BK response onto a typed error. */
async function failFor(response: Response, what: string): Promise<never> {
  const body = await response.text().catch(() => "");

  if (response.status === 401) {
    bkLogger.warn({ what }, "BK session rejected, clearing cache");
    await clearTokenCache();
    throw new BkApiError("BK session expired", "TOKEN_EXPIRED", true, 401);
  }

  if (response.status === 403) {
    throw new BkApiError("BK access forbidden", "AUTH_FAILED", false, 403);
  }

  if (response.status === 429) {
    throw new BkApiError("BK rate limited", "RATE_LIMITED", true, 429);
  }

  bkLogger.error({ status: response.status, body, what }, `BK ${what} failed`);

  throw new BkApiError(
    `BK API error on ${what} (${response.status}): ${body.slice(0, 200)}`,
    response.status >= 500 ? "UNKNOWN" : "INVALID_RESPONSE",
    response.status >= 500,
    response.status
  );
}

/** BK expects plain calendar dates on its filters. */
function bkDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchBkTransactions(
  params: BkFetchTransactionsParams = {}
): Promise<{ transactions: NormalisedBkTransaction[]; page: BkApiPage; hasMore: boolean }> {
  const { baseUrl } = credentials();
  const headers = await authHeaders();

  const query = new URLSearchParams();
  query.append("page", String(params.page ?? 0));
  query.append("size", String(params.size ?? 50));
  if (params.sort) query.append("sort", params.sort);

  // The caller's window has to reach BK, or the sync's lookback setting is
  // decoration and every run pages through the whole history again.
  if (params.fromDate) query.append("fromDate", bkDateParam(params.fromDate));
  if (params.toDate) query.append("toDate", bkDateParam(params.toDate));

  const start = Date.now();
  let latencyMs = 0;

  try {
    const response = await fetch(`${baseUrl}${TRANSACTION_ENDPOINT}?${query.toString()}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(60_000),
    });

    latencyMs = Date.now() - start;

    if (!response.ok) await failFor(response, "getTransactions");

    const data = (await response.json()) as BkApiResponse;

    // A response missing its page envelope is a contract violation, not a
    // network fault: reading through it would throw a TypeError that the
    // catch below would relabel as retryable and spin on.
    if (!data || typeof data !== "object" || !data.page || typeof data.page.number !== "number") {
      throw new BkApiError(
        "BK returned a transaction page with no page envelope",
        "INVALID_RESPONSE",
        false,
        response.status
      );
    }

    bkLogger.debug(
      {
        latencyMs,
        page: data.page.number,
        pageSize: data.page.size,
        totalElements: data.page.totalElements,
        totalPages: data.page.totalPages,
      },
      "BK transactions fetched"
    );

    return {
      transactions: (data.content ?? []).map(normaliseBkTransaction),
      page: data.page,
      hasMore: data.page.number < data.page.totalPages - 1,
    };
  } catch (error) {
    if (error instanceof BkApiError) throw error;

    const cause = error instanceof Error ? error : String(error);
    bkLogger.error({ latencyMs, cause }, "BK fetch threw");
    throw new BkApiError("Failed to fetch BK transactions", "NETWORK", true, undefined, cause);
  }
}

/**
 * Registers an intent to collect a payment, returning BK's CLAIMED receipt.
 *
 * This is the first half of the loop the association needs in order to test
 * reconciliation end to end: claim a payment here, then run the transaction
 * sync and see whether the same clientReference comes back.
 */
export async function claimPayment(request: BkClaimRequest): Promise<BkClaimResponse> {
  const { baseUrl } = credentials();
  const headers = await authHeaders();

  if (!request.clientReference?.trim()) {
    throw new BkApiError("A clientReference is required to claim a payment", "INVALID_RESPONSE", false);
  }

  const start = Date.now();
  let latencyMs = 0;

  try {
    const response = await fetch(`${baseUrl}${CLAIM_ENDPOINT}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        clientReference: request.clientReference,
        payerCode: request.payerCode,
        narration: request.narration,
        amount: request.amount,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    latencyMs = Date.now() - start;

    if (!response.ok) await failFor(response, "claimPayment");

    const data = (await response.json()) as BkClaimResponse;

    bkLogger.info(
      {
        latencyMs,
        clientReference: request.clientReference,
        status: data?.status,
      },
      "BK payment claimed"
    );

    return data;
  } catch (error) {
    if (error instanceof BkApiError) throw error;

    const cause = error instanceof Error ? error : String(error);
    bkLogger.error({ latencyMs, cause }, "BK claim threw");
    throw new BkApiError("Failed to claim BK payment", "NETWORK", true, undefined, cause);
  }
}

/** Lists the sessions BK holds for this client. Read-only. */
export async function getSessions(): Promise<BkSession[]> {
  const { baseUrl } = credentials();
  const headers = await authHeaders();

  try {
    const response = await fetch(`${baseUrl}${SESSIONS_ENDPOINT}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) await failFor(response, "getSessions");

    const data = (await response.json()) as BkSession[];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error instanceof BkApiError) throw error;

    const cause = error instanceof Error ? error : String(error);
    throw new BkApiError("Failed to list BK sessions", "NETWORK", true, undefined, cause);
  }
}

export async function healthCheck(): Promise<BkHealthCheck> {
  const start = Date.now();

  try {
    const { expiresAt, sessionId } = await getAccessToken();

    return {
      ok: true,
      message: sessionId
        ? "BK API is reachable and authenticated"
        : "BK API authenticated, but returned no session id",
      latencyMs: Date.now() - start,
      authenticated: true,
      tokenExpiresAt: expiresAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof BkApiError ? error.message : "BK API is unreachable",
      latencyMs: Date.now() - start,
      authenticated: false,
    };
  }
}

export function getBkConfig() {
  const env = getEnv();
  return {
    mode: env.BK_MODE,
    baseUrl: env.BK_API_BASE_URL,
    isSandbox: env.BK_MODE === "sandbox",
    configured: Boolean(env.BK_CLIENT_ID && env.BK_CLIENT_SECRET),
    collectionAccount: env.BK_COLLECTION_ACCOUNT,
    syncCron: env.BK_SYNC_CRON,
    syncLookbackHours: env.BK_SYNC_LOOKBACK_HOURS,
  };
}
