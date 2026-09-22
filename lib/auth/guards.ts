import "server-only";
import { redirect } from "next/navigation";
import { getAuthContext, type AuthContext } from "@/lib/auth/session";
import { ROLE_HOME, type PermissionCode } from "@/lib/auth/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { authLogger } from "@/lib/logger";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Server-side authorisation.
 *
 * THIS FILE IS THE ENFORCEMENT POINT. Navigation hiding, disabled buttons and
 * conditional rendering are cosmetic; they exist so the UI is not confusing.
 * Nothing is actually protected until one of these guards runs on the server,
 * inside the handler that performs the work.
 *
 * Two flavours, because the correct failure differs by context:
 *   • `require*`    — for pages/server components. Redirects the human.
 *   • `requireApi*` — for route handlers. Throws AuthorizationError, which the
 *                     handler wrapper turns into a 401/403 JSON response.
 */

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 403,
    readonly code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "WRONG_TENANT"
      | "ACCOUNT_INACTIVE"
      | "PASSWORD_CHANGE_REQUIRED" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

// ---------------------------------------------------------------------------
// Page / server component guards
// ---------------------------------------------------------------------------

/**
 * Where a page sends someone it does not recognise as signed in.
 *
 * Not /login directly: the browser may still hold a JWT that middleware
 * accepts, and middleware bounces a valid JWT away from /login — a redirect
 * loop. The session-expired handler clears the cookie first. See
 * app/api/auth/session-expired/route.ts.
 */
export function signInRedirectPath(returnTo?: string | null): string {
  return returnTo
    ? `/api/auth/session-expired?next=${encodeURIComponent(returnTo)}`
    : "/api/auth/session-expired";
}

/** Requires any authenticated user. Redirects to login with a return path. */
export async function requireAuth(returnTo?: string): Promise<AuthContext> {
  const context = await getAuthContext();

  if (!context) redirect(signInRedirectPath(returnTo));

  return context;
}

/**
 * Requires one of the given roles.
 *
 * A user with the wrong role is sent to their own dashboard rather than shown
 * a 403 — it is almost always a stale bookmark, and bouncing them somewhere
 * useful beats a dead end. The attempt is audited either way.
 */
export async function requireRole(
  roles: UserRole | UserRole[],
  returnTo?: string
): Promise<AuthContext> {
  const context = await requireAuth(returnTo);
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (!allowed.includes(context.user.role)) {
    authLogger.warn(
      {
        userId: context.user.id,
        role: context.user.role,
        required: allowed,
        path: returnTo,
      },
      "role check failed"
    );

    await recordAudit(
      {
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        entityType: "Route",
        entityId: returnTo ?? null,
        associationId: context.user.associationId,
        metadata: { requiredRoles: allowed, actualRole: context.user.role },
        severity: "WARNING",
      },
      context
    );

    redirect(ROLE_HOME[context.user.role]);
  }

  return context;
}

/**
 * Requires a personal member account — a savings/loan record of the caller's
 * own — whatever role they hold.
 *
 * DELIBERATELY NOT `requireRole("MEMBER")`. In a savings association the staff
 * save too: the treasurer contributes every month and takes loans like anyone
 * else, and the previous rule meant the person running the association was the
 * one person who could not see their own balance. Their administrative role is
 * about what they may do to *other* people's records; it says nothing about
 * whether they have money of their own here.
 *
 * The authorisation this performs is therefore ownership, not role: every page
 * behind it reads `context.member.id`, which is the caller's own record and
 * cannot be pointed at anyone else's.
 *
 * Someone with no member record is not being refused — there is simply nothing
 * to show them — so staff are sent to their own dashboard rather than to an
 * error. A MEMBER-role user without one is a different thing entirely: that is
 * a broken account, and it fails loudly.
 */
export async function requireMember(returnTo?: string): Promise<AuthContext> {
  const context = await requireAuth(returnTo);

  if (!context.member) {
    if (context.user.role === "MEMBER") {
      throw new Error(
        `User ${context.user.id} has role MEMBER but no member record`
      );
    }

    redirect(ROLE_HOME[context.user.role]);
  }

  return context;
}

/** Association admins and super admins. */
export async function requireAdmin(returnTo?: string): Promise<AuthContext> {
  return requireRole(["ADMIN", "SUPER_ADMIN"], returnTo);
}

export async function requireSuperAdmin(returnTo?: string): Promise<AuthContext> {
  return requireRole("SUPER_ADMIN", returnTo);
}

/** Requires a specific permission, checked against effective grants. */
export async function requirePermission(
  permission: PermissionCode,
  returnTo?: string
): Promise<AuthContext> {
  const context = await requireAuth(returnTo);

  if (!context.permissions.has(permission)) {
    await recordAudit(
      {
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        entityType: "Permission",
        entityId: permission,
        associationId: context.user.associationId,
        metadata: { permission, path: returnTo },
        severity: "WARNING",
      },
      context
    );

    redirect(ROLE_HOME[context.user.role]);
  }

  return context;
}

// ---------------------------------------------------------------------------
// Route handler guards
// ---------------------------------------------------------------------------

export async function requireApiAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new AuthorizationError("Authentication required", 401, "UNAUTHENTICATED");
  }
  return context;
}

export async function requireApiRole(
  roles: UserRole | UserRole[]
): Promise<AuthContext> {
  const context = await requireApiAuth();
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (!allowed.includes(context.user.role)) {
    await recordAudit(
      {
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        entityType: "Api",
        associationId: context.user.associationId,
        metadata: { requiredRoles: allowed, actualRole: context.user.role },
        severity: "WARNING",
      },
      context
    );
    throw new AuthorizationError("Insufficient role", 403, "FORBIDDEN");
  }

  return context;
}

/**
 * The route-handler counterpart of `requireMember`: the caller must have a
 * member record of their own. Same reasoning — an administrator requesting a
 * withdrawal from their own savings is an ordinary member action, and their
 * role is irrelevant to it.
 */
export async function requireApiMember(): Promise<AuthContext> {
  const context = await requireApiAuth();

  if (!context.member) {
    throw new AuthorizationError(
      "This account has no member record",
      403,
      "FORBIDDEN"
    );
  }

  return context;
}

export async function requireApiPermission(
  permission: PermissionCode | PermissionCode[]
): Promise<AuthContext> {
  const context = await requireApiAuth();
  const required = Array.isArray(permission) ? permission : [permission];

  // ALL required permissions must be present. Requiring every one is the safe
  // reading when a handler declares several.
  const missing = required.filter((p) => !context.permissions.has(p));

  if (missing.length > 0) {
    await recordAudit(
      {
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        entityType: "Permission",
        entityId: missing.join(","),
        associationId: context.user.associationId,
        metadata: { required, missing },
        severity: "WARNING",
      },
      context
    );
    throw new AuthorizationError(
      `Missing permission: ${missing.join(", ")}`,
      403,
      "FORBIDDEN"
    );
  }

  return context;
}

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

/**
 * Resolves the association filter for a request.
 *
 * Returns `null` only for a super admin who has not narrowed to one tenant,
 * meaning "no filter — platform scope". For everyone else it returns their own
 * associationId, and a mismatch is refused.
 *
 * Every repository query over tenant-scoped data must apply this. It is the
 * mechanism behind "data belonging to Association A must never be visible to
 * Association B".
 */
export function resolveAssociationScope(
  context: AuthContext,
  requestedAssociationId?: string | null
): string | null {
  if (context.user.role === "SUPER_ADMIN") {
    // Super admins may act within a chosen association, or platform-wide.
    return requestedAssociationId ?? null;
  }

  const own = context.user.associationId;

  if (!own) {
    throw new AuthorizationError(
      "Account is not attached to an association",
      403,
      "ACCOUNT_INACTIVE"
    );
  }

  if (requestedAssociationId && requestedAssociationId !== own) {
    authLogger.error(
      {
        userId: context.user.id,
        ownAssociation: own,
        requested: requestedAssociationId,
      },
      "cross-tenant access attempt"
    );

    void recordAudit(
      {
        action: AUDIT_ACTIONS.CROSS_TENANT_ACCESS_BLOCKED,
        entityType: "Association",
        entityId: requestedAssociationId,
        associationId: own,
        metadata: { requested: requestedAssociationId, own },
        severity: "CRITICAL",
      },
      context
    );

    throw new AuthorizationError(
      "Resource belongs to a different association",
      403,
      "WRONG_TENANT"
    );
  }

  return own;
}

/**
 * Asserts that a loaded record belongs to the caller's association.
 *
 * Defence in depth: the query filter should already have prevented this, so
 * reaching here means a query somewhere forgot its scope. Call it after
 * fetching any record by a client-supplied id.
 */
export function assertSameAssociation(
  context: AuthContext,
  record: { associationId: string | null } | null,
  entityType = "Resource"
): void {
  if (!record) {
    throw new AuthorizationError("Not found", 403, "FORBIDDEN");
  }

  if (context.user.role === "SUPER_ADMIN") return;

  if (record.associationId !== context.user.associationId) {
    authLogger.error(
      {
        userId: context.user.id,
        entityType,
        ownAssociation: context.user.associationId,
        recordAssociation: record.associationId,
      },
      "tenant isolation violation caught after query"
    );

    void recordAudit(
      {
        action: AUDIT_ACTIONS.CROSS_TENANT_ACCESS_BLOCKED,
        entityType,
        associationId: context.user.associationId,
        metadata: { recordAssociationId: record.associationId },
        severity: "CRITICAL",
      },
      context
    );

    throw new AuthorizationError(
      "Resource belongs to a different association",
      403,
      "WRONG_TENANT"
    );
  }
}

/**
 * Asserts the caller may act on a given member's records — either it is their
 * own member record, or they hold an association-wide permission.
 */
export function assertCanAccessMember(
  context: AuthContext,
  memberId: string,
  elevatedPermission: PermissionCode
): void {
  if (context.member?.id === memberId) return;
  if (context.permissions.has(elevatedPermission)) return;

  throw new AuthorizationError(
    "You may only access your own records",
    403,
    "FORBIDDEN"
  );
}
