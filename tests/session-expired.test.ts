import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthContext }));

import { GET } from "@/app/api/auth/session-expired/route";
import { apiUnauthorized, translateError } from "@/lib/api/response";
import { AuthorizationError } from "@/lib/auth/guards";

/**
 * Redirect-loop regression tests.
 *
 * The failure: a session idle-timed out in the database while its JWT cookie
 * was still unexpired. Pages sent the user to /login, middleware saw a valid
 * JWT there and sent them back, and the two bounced until the browser showed a
 * blank page. The fix is that whatever rejects the session also clears the
 * cookie, so middleware stops believing it.
 */

function request(query: string, cookie?: string) {
  return new NextRequest(`http://localhost/api/auth/session-expired${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function clearsSessionCookie(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  return /rta_session=;/.test(header) && /Expires=Thu, 01 Jan 1970/.test(header);
}

beforeEach(() => {
  getAuthContext.mockReset();
});

describe("GET /api/auth/session-expired", () => {
  it("clears a dead session's cookie and sends the user to login", async () => {
    getAuthContext.mockResolvedValue(null);

    const response = await GET(request("?next=%2Fadmin", "rta_session=stale"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin&expired=1"
    );
    expect(clearsSessionCookie(response)).toBe(true);
  });

  it("does not claim a session expired when there was no cookie", async () => {
    getAuthContext.mockResolvedValue(null);

    const response = await GET(request("?next=%2Fadmin"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin"
    );
  });

  it("forwards a live session instead of signing it out", async () => {
    // Otherwise any link to this URL would be a one-click logout.
    getAuthContext.mockResolvedValue({ user: { role: "ADMIN" } });

    const response = await GET(request("?next=%2Fadmin%2Fmembers", "rta_session=live"));

    expect(response.headers.get("location")).toBe("http://localhost/admin/members");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sends a live session with no destination to its role's landing page", async () => {
    getAuthContext.mockResolvedValue({ user: { role: "MEMBER" } });

    const response = await GET(request("", "rta_session=live"));

    expect(response.headers.get("location")).toBe("http://localhost/account/status");
  });

  it("drops an off-site next parameter", async () => {
    getAuthContext.mockResolvedValue(null);

    const response = await GET(
      request("?next=https%3A%2F%2Fevil.example.com", "rta_session=stale")
    );

    expect(response.headers.get("location")).toBe("http://localhost/login?expired=1");
  });
});

describe("API 401 responses", () => {
  it("clear the session cookie so the next page load reaches login", () => {
    expect(clearsSessionCookie(apiUnauthorized())).toBe(true);
    expect(
      clearsSessionCookie(
        translateError(
          new AuthorizationError("Authentication required", 401, "UNAUTHENTICATED")
        )
      )
    ).toBe(true);
  });

  it("leave the cookie alone on a 403 — the session is fine, the action is not", () => {
    const response = translateError(new AuthorizationError("Insufficient role", 403));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
