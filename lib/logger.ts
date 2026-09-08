import "server-only";
import pino from "pino";

/**
 * Structured application logger.
 *
 * The redaction list is not optional decoration. This system handles payment
 * credentials, session tokens and member PII, and logs routinely get shipped
 * to third-party aggregators, pasted into tickets and read by people who have
 * no business seeing an OTP. Anything sensitive is stripped at the logger
 * rather than trusted to every call site.
 */

const REDACTED_PATHS = [
  "password",
  "passwordHash",
  "confirmPassword",
  "currentPassword",
  "newPassword",
  "token",
  "tokenHash",
  "sessionToken",
  "accessToken",
  "refreshToken",
  "apiKey",
  "privateKey",
  "consumerSecret",
  "secret",
  "authorization",
  "cookie",
  "signature",
  "twoFactorSecret",
  "nationalId",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.apiKey",
  "*.privateKey",
  "*.consumerSecret",
  "*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
  base: { service: "rta-savings" },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" },
      }
    : undefined,
});

/**
 * Child loggers per subsystem, so a reconciliation run can be filtered out of
 * the noise with `component=reconciliation`.
 */
export const authLogger = logger.child({ component: "auth" });
export const ledgerLogger = logger.child({ component: "ledger" });
export const paymentLogger = logger.child({ component: "payment" });
export const jengaLogger = logger.child({ component: "jenga" });
export const bkLogger = logger.child({ component: "bk" });
export const loanLogger = logger.child({ component: "loan" });
export const notificationLogger = logger.child({ component: "notification" });
export const workerLogger = logger.child({ component: "worker" });
export const apiLogger = logger.child({ component: "api" });

/** Narrows an unknown caught value into something safe to log. */
export function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: isDev ? error.stack : undefined,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    };
  }
  return { message: String(error) };
}
