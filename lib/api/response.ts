import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/guards";
import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { apiLogger, serialiseError } from "@/lib/logger";
import { Prisma } from "@/lib/db/prisma";

/**
 * Uniform API envelope and error handling.
 *
 * Two invariants worth stating outright:
 *
 *  1. MONEY LEAVES AS A STRING. `serialise` converts every Decimal to its
 *     fixed-scale string form. Serialising a Decimal as a JSON number would
 *     hand it to JSON.parse as an IEEE-754 double and quietly reintroduce the
 *     floating-point error the whole ledger is built to avoid.
 *
 *  2. INTERNAL ERRORS DO NOT LEAK. Unexpected exceptions are logged in full
 *     server-side and returned to the client as a generic message with a
 *     correlation id. Prisma errors in particular carry table and column names
 *     that map out the schema for anyone probing.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /// Field-level messages for form rendering.
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

export function apiSuccess<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(serialise(data), {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function apiCreated<T>(data: T) {
  return apiSuccess(data, { status: 201 });
}

export function apiNoContent() {
  return new NextResponse(null, { status: 204 });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, string[]>
) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

export const apiBadRequest = (message: string, details?: Record<string, string[]>) =>
  apiError("BAD_REQUEST", message, 400, details);

/**
 * A 401 means the database no longer honours this browser's session cookie,
 * though middleware — which checks only the JWT — still would. Clearing it
 * here keeps the two in agreement, so the next page load goes to /login
 * cleanly instead of being bounced back to the dashboard.
 */
export const apiUnauthorized = (
  message = "Your session has ended. Please sign in again."
) => {
  const response = apiError("UNAUTHENTICATED", message, 401);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
};

export const apiForbidden = (message = "You do not have permission to do that") =>
  apiError("FORBIDDEN", message, 403);

export const apiNotFound = (message = "Not found") =>
  apiError("NOT_FOUND", message, 404);

export const apiConflict = (message: string, code = "CONFLICT") =>
  apiError(code, message, 409);

export const apiTooManyRequests = (message: string, retryAfterSeconds?: number) => {
  const response = apiError("RATE_LIMITED", message, 429);
  if (retryAfterSeconds) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }
  return response;
};

/**
 * Recursively converts values into JSON-safe forms.
 *
 * Decimal → fixed-scale string, Date → ISO 8601, BigInt → string.
 */
export function serialise<T>(value: T): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();

  if (Array.isArray(value)) return value.map(serialise);

  if (typeof value === "object") {
    // Decimal instances from a differently-resolved copy of decimal.js would
    // fail the instanceof above; duck-typing catches them.
    const candidate = value as { toFixed?: unknown; s?: unknown; d?: unknown; e?: unknown };
    if (
      typeof candidate.toFixed === "function" &&
      "s" in candidate &&
      "d" in candidate &&
      "e" in candidate
    ) {
      return (candidate.toFixed as (dp: number) => string)(2);
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = serialise(item);
    }
    return output;
  }

  return value;
}

/**
 * Wraps a route handler with error translation.
 *
 * Every handler should be wrapped, so that no unexpected throw ever escapes as
 * a stack trace or an unhandled 500 with internal detail in the body.
 */
export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return translateError(error);
    }
  };
}

export function translateError(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    if (error.status === 401) return apiUnauthorized();
    return apiError(error.code, error.message, error.status);
  }

  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "_";
      (details[path] ??= []).push(issue.message);
    }
    return apiBadRequest("Validation failed", details);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Translate only the codes with a meaningful, safe client-facing message.
    // Everything else falls through to the generic handler below rather than
    // exposing constraint and column names.
    switch (error.code) {
      case "P2002":
        return apiConflict("That record already exists", "DUPLICATE");
      case "P2025":
        return apiNotFound();
      case "P2003":
        return apiBadRequest("Referenced record does not exist");
      case "P2034":
        return apiConflict(
          "The request conflicted with another operation. Please try again.",
          "WRITE_CONFLICT"
        );
    }
  }

  const requestId = crypto.randomUUID();

  apiLogger.error(
    { requestId, ...serialiseError(error) },
    "unhandled error in route handler"
  );

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    } satisfies ApiErrorBody,
    { status: 500 }
  );
}

/** Standard paginated envelope. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}
