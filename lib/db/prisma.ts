import "server-only";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/lib/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { logger, serialiseError } from "@/lib/logger";

/**
 * PrismaClient singleton.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every edit until Postgres refuses connections. Stashing
 * the instance on globalThis keeps exactly one pool alive across reloads.
 *
 * IMPORTANT: this module is Node-runtime only. It must never be imported from
 * middleware, which runs on the Edge runtime where the pg driver does not
 * exist. Middleware does stateless cookie verification only; see lib/auth.
 */

declare global {
  // `var` is required here — `let`/`const` do not create a property on
  // globalThis, which is exactly what the hot-reload cache depends on.
  var __rtaPrisma: PrismaClient | undefined;
}

/**
 * Failures that mean a new connection never got as far as sending a query:
 * the host name did not resolve, the host refused, or the socket was cut
 * during the handshake.
 *
 * WHY THESE ARE RETRIED. The database is hosted (Neon, eu-central-1) and the
 * people using this reach it over home and mobile connections where a DNS
 * lookup fails outright for a second at a time. The pool closes idle
 * connections after 30s, so the first query after any pause opens a fresh one —
 * and a single failed lookup then surfaced as P1001, "Can't reach database
 * server", which killed the whole page while the next click worked fine.
 *
 * WHY THIS IS SAFE FOR WRITES. Only connection establishment is retried, never
 * a query. A client that failed to connect has sent nothing, so trying again
 * cannot apply anything twice. Errors on an established connection, and the
 * pool's own "timed out waiting for a free connection", are deliberately not
 * here: the first may have reached the server, and retrying the second only
 * piles more load onto a pool that is already full.
 */
const TRANSIENT_CONNECT_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
]);

/// Delays before each retry. Short, because a member is watching a spinner;
/// three tries spread over about two seconds clear an ordinary network blip.
const CONNECT_RETRY_DELAYS_MS = [200, 600, 1_500];

export function isTransientConnectError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TRANSIENT_CONNECT_CODES.has(code)) return true;

  const message = error instanceof Error ? error.message : "";
  return (
    // The server closed the socket mid-handshake.
    message === "Connection terminated unexpectedly" ||
    // Neon's proxy, when the compute behind it is still waking from suspend.
    message.toLowerCase().includes("couldn't connect to compute node")
  );
}

type ConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void
) => void;

/**
 * A pg Pool whose `connect()` retries transient connection failures.
 *
 * Overriding `connect` covers every path the Prisma adapter takes: it calls
 * `pool.connect()` itself to open a transaction, and `pool.query()` calls
 * `this.connect(callback)` internally — which is why the callback form has to
 * keep working as well as the promise form.
 */
export class ResilientPool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const connectOnce = () => super.connect();
    const connecting = connectWithRetry(connectOnce);

    if (!callback) return connecting;

    connecting.then(
      (client) => callback(undefined, client, (release) => client.release(release as Error)),
      (error: Error) => callback(error, undefined, () => undefined)
    );
  }
}

export async function connectWithRetry<T>(
  connectOnce: () => Promise<T>,
  delaysMs: readonly number[] = CONNECT_RETRY_DELAYS_MS
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await connectOnce();
    } catch (error) {
      const delay = delaysMs[attempt];
      if (delay === undefined || !isTransientConnectError(error)) throw error;

      logger.warn(
        {
          component: "db",
          attempt: attempt + 1,
          retryInMs: delay,
          code: (error as { code?: unknown }).code,
          ...serialiseError(error),
        },
        "database connection failed — retrying"
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function createClient(): PrismaClient {
  const env = getEnv();

  const pool = new ResilientPool({
    connectionString: env.DATABASE_URL,
    // Sizing note: a ledger posting holds its connection for the whole time it
    // is queued behind another writer's row lock, so concurrent postings to the
    // SAME account consume pool slots while doing nothing. A pool of 10 is
    // therefore exhausted by ~10 simultaneous deposits and the eleventh fails
    // to acquire a connection rather than simply waiting its turn — which is
    // what the concurrency test hit.
    max: 20,
    // Long enough to outlast a queue of writers on a busy account. Failing to
    // acquire a connection surfaces to a member as a failed deposit, so it is
    // better to wait than to give up quickly.
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
  });

  // The adapter would otherwise build its own plain Pool. `disposeExternalPool`
  // keeps the old shutdown behaviour: `$disconnect()` still ends the pool, so
  // the worker and scripts exit instead of hanging on open sockets.
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });

  return new PrismaClient({
    adapter,
    // Prisma's built-in default is a 5s transaction budget, which is a
    // local-Postgres number. Against a hosted database every statement inside
    // a transaction pays real network latency, so a perfectly small
    // transaction — the two writes an amendment makes, say — can run past it
    // through no fault of its own. It then fails as P2028, "a rollback cannot
    // be executed on an expired transaction", which names the timeout rather
    // than whatever the transaction was actually doing.
    //
    // Money movement sets its own, longer budget in withFinancialTransaction
    // below; this is the floor for everything else. Deliberately still finite:
    // a transaction that has held its locks for fifteen seconds is stuck, and
    // waiting longer only spreads the problem to whoever is queued behind it.
    transactionOptions: {
      timeout: 15_000,
      maxWait: 10_000,
    },
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

/**
 * Lazily constructed, so that merely importing this module does not build a
 * client or read the environment.
 *
 * This matters at build time: `next build` imports every route module to
 * collect page data, and an eager client would open a connection pool — and
 * demand a complete, valid configuration — during a build that may have
 * neither. The proxy defers all of that to the first actual query.
 */
function getClient(): PrismaClient {
  if (!globalThis.__rtaPrisma) {
    globalThis.__rtaPrisma = createClient();
  }
  return globalThis.__rtaPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    // Prisma's top-level methods ($transaction, $queryRaw, …) rely on `this`,
    // which Reflect.get would otherwise strip.
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { Prisma };
export type { PrismaClient };

/**
 * The transaction-scoped client handed to service functions. Typed as the
 * subset of PrismaClient available inside `$transaction`, so a service can be
 * called either standalone or as part of a larger atomic operation.
 */
export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * Runs `fn` inside a database transaction suitable for moving money.
 *
 * ISOLATION CHOICE — READ COMMITTED, not SERIALIZABLE.
 *
 * What actually prevents a lost update here is the `SELECT … FOR UPDATE` row
 * lock the ledger takes on the savings account before reading its balance (see
 * lib/services/ledger.ts). Under READ COMMITTED, a locking read re-evaluates
 * the row once the lock is granted, so a writer that queued behind another
 * sees the balance the first one committed — never a stale one.
 *
 * SERIALIZABLE was the first instinct and it was the wrong one. It gives no
 * extra safety over an explicit row lock for this access pattern, and it
 * converts every ordinary queue-behind-the-lock into a `could not serialize
 * access` abort. Under twenty concurrent deposits that meant most transactions
 * failing and retrying rather than simply waiting their turn — worse
 * throughput for identical correctness.
 *
 * Callers that genuinely need snapshot-level guarantees across several rows
 * can still request it via `isolationLevel`.
 */
export async function withFinancialTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  options: {
    retries?: number;
    timeoutMs?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  } = {}
): Promise<T> {
  const {
    retries = 5,
    timeoutMs = 20_000,
    isolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel,
        timeout: timeoutMs,
        // Generous: under contention a writer waits for the row lock, and
        // giving up early would surface as a spurious failure to the member.
        maxWait: 15_000,
      });
    } catch (error) {
      lastError = error;

      if (!isRetryableTransactionError(error) || attempt === retries) {
        throw error;
      }

      // Exponential backoff with jitter, so two conflicting writers do not
      // retry in lockstep and collide again immediately.
      const backoff = Math.min(50 * 2 ** attempt, 500);
      await new Promise((resolve) =>
        setTimeout(resolve, backoff + Math.random() * backoff)
      );
    }
  }

  throw lastError;
}

/**
 * Postgres 40001 (serialization_failure) and 40P01 (deadlock_detected) mean
 * "your transaction was aborted, but retrying may well succeed". Anything else
 * is a real error and must propagate — silently retrying, say, a
 * unique-constraint violation is how a duplicate payment sneaks through.
 *
 * Detecting them is fiddlier than it should be. Prisma documents P2034 for
 * write conflicts, but with the pg driver adapter the same condition arrives
 * as P2010 with the original SQLSTATE buried in
 * `meta.driverAdapterError.cause.originalCode`. Checking only P2034 means
 * retries never fire, which is precisely what the concurrency tests caught.
 * All the known shapes are therefore checked.
 */
function isRetryableTransactionError(error: unknown): boolean {
  const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;

    if (error.code === "P2010") {
      const adapterError = (
        error.meta as
          | { driverAdapterError?: { cause?: { originalCode?: string; kind?: string } } }
          | undefined
      )?.driverAdapterError;

      const originalCode = adapterError?.cause?.originalCode;
      if (originalCode && RETRYABLE_SQLSTATES.has(originalCode)) return true;
      if (adapterError?.cause?.kind === "TransactionWriteConflict") return true;
    }
  }

  const code = (error as { code?: string } | null)?.code;
  if (code && RETRYABLE_SQLSTATES.has(code)) return true;

  // Last resort: the driver adapter sometimes throws a plain error whose only
  // distinguishing feature is the Postgres message text.
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("could not serialize access") ||
    message.includes("deadlock detected") ||
    message.includes("TransactionWriteConflict")
  );
}

/**
 * True when the error is a unique-constraint violation on the given field.
 * Used by the payment pipeline to turn "this provider transaction already
 * exists" from an exception into the expected, harmless duplicate outcome.
 */
export function isUniqueConstraintError(
  error: unknown,
  field?: string
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!field) return true;

  // Field names need normalising before comparison. Prisma reports the target
  // of a composite unique as a mix of bare and quoted identifiers — the
  // constraint on (provider, externalTransactionId) arrives as
  // ["provider", "\"externalTransactionId\""], with literal double quotes in
  // the second entry. A plain `includes(field)` therefore misses it, which is
  // how a duplicate payment turned into an unhandled exception instead of the
  // expected no-op.
  const normalise = (value: string) => value.replace(/["`\s]/g, "").toLowerCase();
  const wanted = normalise(field);

  const candidates: string[] = [];

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    candidates.push(...target.map(String));
  } else if (typeof target === "string") {
    candidates.push(target);
  }

  // The pg driver adapter also reports the constraint's columns separately.
  const adapterFields = (
    error.meta as
      | { driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } }
      | undefined
  )?.driverAdapterError?.cause?.constraint?.fields;

  if (Array.isArray(adapterFields)) candidates.push(...adapterFields.map(String));

  return candidates.some((candidate) => normalise(candidate).includes(wanted));
}
