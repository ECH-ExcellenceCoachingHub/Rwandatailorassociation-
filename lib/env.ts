import "server-only";
import { z } from "zod";

/**
 * Validated server-side environment.
 *
 * Importing this module from a client component is a build error, courtesy of
 * `server-only`. That is the mechanical guarantee behind the project rule that
 * Jenga credentials, database URLs and session secrets never reach the browser
 * — it is enforced by the bundler rather than by anyone remembering.
 *
 * Validation runs once at import time so a misconfigured deployment fails
 * loudly at boot instead of at 2am inside a payment webhook.
 */

/**
 * True while `next build` is collecting page data. Next sets NEXT_PHASE for
 * the build, which is the only reliable way to tell "being compiled" apart
 * from "running in production".
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

const booleanish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((v) => v === "true" || v === "1" || v === "yes");

const intFrom = (fallback: number, min?: number, max?: number) => {
  let schema = z.coerce.number().int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);
  return schema.default(fallback);
};

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),

    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
        "DATABASE_URL must be a PostgreSQL connection string"
      ),
    SHADOW_DATABASE_URL: z.string().optional(),

    // Auth ------------------------------------------------------------------
    // 32 bytes minimum. A short secret is the single easiest way to make every
    // session forgeable, so it is a hard failure rather than a warning.
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET must be at least 32 characters"),
    SESSION_TTL_MINUTES: intFrom(720, 5),
    SESSION_IDLE_TIMEOUT_MINUTES: intFrom(120, 5),
    AUTH_MAX_FAILED_ATTEMPTS: intFrom(5, 1, 50),
    AUTH_LOCKOUT_MINUTES: intFrom(15, 1),
    // How long a printed sign-in QR code stays valid. Six months balances
    // "a member should not have to reprint their card every term" against
    // "a card lost in January must not still open the account in December".
    // Members can regenerate at any time, which revokes the previous code.
    QR_ACCESS_TTL_DAYS: intFrom(180, 1, 3650),

    // Jenga -----------------------------------------------------------------
    JENGA_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
    JENGA_API_BASE_URL: z.string().url().default("https://uat.finserve.africa"),
    JENGA_API_KEY: z.string().optional(),
    JENGA_MERCHANT_CODE: z.string().optional(),
    JENGA_CONSUMER_SECRET: z.string().optional(),
    JENGA_PRIVATE_KEY_PATH: z.string().optional(),
    JENGA_PRIVATE_KEY_BASE64: z.string().optional(),
    JENGA_ACCOUNT_NUMBER: z.string().optional(),
    JENGA_COUNTRY_CODE: z.string().default("RW"),
    JENGA_WEBHOOK_SECRET: z.string().optional(),

    // Reconciliation --------------------------------------------------------
    RECONCILIATION_LOOKBACK_HOURS: intFrom(48, 1, 720),
    RECONCILIATION_CRON: z.string().default("*/15 * * * *"),
    PAYMENT_AUTO_MATCH_MIN_CONFIDENCE: intFrom(90, 0, 100),
    PAYMENT_MAX_RETRIES: intFrom(5, 0, 100),

    // Statement PDF extraction ----------------------------------------------
    // Reconstructing a table from a PDF is done by scripts/pdf_extract.py,
    // which uses pdfplumber. The JavaScript extractor remains as a fallback
    // for environments without Python; it is measurably worse on tightly-set
    // column layouts, where it can fuse two columns into one wrong number.
    //
    //   auto   — Python, silently falling back to JavaScript if unavailable.
    //   python — Python only; a missing interpreter fails the upload loudly.
    //            Use this in production, where a silent downgrade to the
    //            weaker parser is exactly what you do not want.
    //   node   — JavaScript only, for development without Python installed.
    STATEMENT_EXTRACTOR: z.enum(["auto", "python", "node"]).default("auto"),
    PYTHON_BIN: z.string().default(process.platform === "win32" ? "python" : "python3"),

    // Notifications ---------------------------------------------------------
    EMAIL_PROVIDER: z.enum(["log", "smtp"]).default("log"),
    EMAIL_FROM: z.string().default("RTA Savings <no-reply@rta.rw>"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: intFrom(587, 1, 65535),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    SMS_PROVIDER: z
      .enum(["log", "africastalking", "twilio"])
      .default("log"),
    SMS_SENDER_ID: z.string().default("RTA"),
    AFRICASTALKING_USERNAME: z.string().optional(),
    AFRICASTALKING_API_KEY: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // Storage ---------------------------------------------------------------
    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./storage"),
    STORAGE_MAX_UPLOAD_MB: intFrom(10, 1, 100),

    // Worker ----------------------------------------------------------------
    WORKER_ENABLED: booleanish.default(true),
    LOAN_REMINDER_CRON: z.string().default("0 8 * * *"),
    OVERDUE_CHECK_CRON: z.string().default("0 1 * * *"),

    // Bank of Kigali OpenAPI -----------------------------------------------
    BK_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
    BK_API_BASE_URL: z.string().url().default("https://sandbox.bk.rw"),
    BK_CLIENT_ID: z.string().optional(),
    BK_CLIENT_SECRET: z.string().optional(),
    BK_API_USERNAME: z.string().optional(),
    BK_API_PASSWORD: z.string().optional(),
    BK_COLLECTION_ACCOUNT: z.string().optional(),
    BK_SYNC_CRON: z.string().default("*/15 * * * *"),
    BK_SYNC_LOOKBACK_HOURS: intFrom(48, 1, 720),

    // Near-real-time poll. Separate from the cron sync above because they do
    // different jobs: this one asks "has anything landed in the last few
    // minutes", the cron sync sweeps a long window and repairs whatever the
    // poll missed while the worker was down.
    BK_POLL_ENABLED: booleanish.default(true),
    /// Seconds between polls. Floored at 1s; BK will rate-limit long before
    /// that is a good idea.
    BK_POLL_SECONDS: intFrom(5, 1, 3600),
    /// How far back each poll looks. Only has to cover the gap since the last
    /// poll, plus BK's own settlement lag.
    BK_POLL_LOOKBACK_MINUTES: intFrom(15, 1, 1440),
    /// Pages per poll. A poll is meant to be cheap; deep pagination is the
    /// cron sync's job.
    BK_POLL_MAX_PAGES: intFrom(2, 1, 20),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  // A production deployment running the mock payment adapter would silently
  // invent transactions that never happened. Refuse to start instead.
  //
  // Skipped during `next build`: Next forces NODE_ENV=production for every
  // build, including a development machine's, so enforcing it there would
  // block builds without saying anything true about the deployment. The check
  // that matters runs at request time on the live server, where NODE_ENV
  // genuinely reflects the environment.
  .refine((e) => isBuildPhase() || !(e.NODE_ENV === "production" && e.JENGA_MODE === "live"), {
    message:
      "JENGA_MODE=sandbox is not permitted in production — the sandbox adapter fabricates transactions and must never back real member balances",
    path: ["JENGA_MODE"],
  })
  .refine(
    (e) =>
      e.JENGA_MODE !== "live" ||
      Boolean(
        e.JENGA_API_KEY &&
          e.JENGA_MERCHANT_CODE &&
          e.JENGA_CONSUMER_SECRET &&
          e.JENGA_ACCOUNT_NUMBER &&
          (e.JENGA_PRIVATE_KEY_PATH || e.JENGA_PRIVATE_KEY_BASE64)
      ),
    {
      message:
        "JENGA_MODE=live requires JENGA_API_KEY, JENGA_MERCHANT_CODE, JENGA_CONSUMER_SECRET, JENGA_ACCOUNT_NUMBER and one of JENGA_PRIVATE_KEY_PATH / JENGA_PRIVATE_KEY_BASE64",
      path: ["JENGA_MODE"],
    }
  )
  .refine((e) => e.EMAIL_PROVIDER !== "smtp" || Boolean(e.SMTP_HOST), {
    message: "EMAIL_PROVIDER=smtp requires SMTP_HOST",
    path: ["SMTP_HOST"],
  })
  // Only binding once BK is actually in use. BK_MODE defaults to `sandbox`, so
  // enforcing this unconditionally would stop every production deployment from
  // booting until it had been given Bank of Kigali credentials — including the
  // deployments that do not use BK at all.
  .refine(
    (e) =>
      isBuildPhase() ||
      !(
        e.NODE_ENV === "production" &&
        e.BK_MODE === "sandbox" &&
        Boolean(e.BK_CLIENT_ID || e.BK_CLIENT_SECRET)
      ),
    {
      message:
        "BK_MODE=sandbox is not permitted in production — sandbox transactions must never be used for real reconciliation. Unset BK_CLIENT_ID/BK_CLIENT_SECRET to disable the integration entirely.",
      path: ["BK_MODE"],
    }
  )
  .refine(
    (e) =>
      e.BK_MODE !== "live" ||
      Boolean(e.BK_CLIENT_ID && e.BK_CLIENT_SECRET),
    {
      message:
        "BK_MODE=live requires BK_CLIENT_ID and BK_CLIENT_SECRET",
      path: ["BK_MODE"],
    }
  )
  .refine(
    (e) =>
      e.BK_MODE !== "live" ||
      Boolean(e.BK_COLLECTION_ACCOUNT),
    {
      message:
        "BK_MODE=live requires BK_COLLECTION_ACCOUNT to identify the association's bank account",
      path: ["BK_COLLECTION_ACCOUNT"],
    }
  );

export type ServerEnv = z.infer<typeof schema>;

function load(): ServerEnv {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    // Print the failing keys and reasons, but never the values — this output
    // routinely ends up in CI logs and deployment consoles.
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the required values.`
    );
  }

  return parsed.data;
}

let cached: ServerEnv | null = null;

/**
 * Lazily validated accessor. Lazy rather than eager so that importing a module
 * which merely *references* env does not blow up tooling (codegen, tests) that
 * has no need for a full configuration.
 */
export function getEnv(): ServerEnv {
  if (!cached) cached = load();
  return cached;
}

export const isProduction = () => getEnv().NODE_ENV === "production";
export const isDevelopment = () => getEnv().NODE_ENV === "development";
