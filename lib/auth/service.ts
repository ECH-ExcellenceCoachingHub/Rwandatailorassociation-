import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { authLogger } from "@/lib/logger";
import {
  hashPassword,
  verifyPassword,
  fakeVerifyPassword,
} from "@/lib/auth/password";
import { generateToken, sha256 } from "@/lib/auth/jwt";
import { createSession, revokeAllUserSessions } from "@/lib/auth/session";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { acceptPhotoDataUrl, type AcceptedPhoto } from "@/lib/images/photo";
import type { RegisterInput } from "@/lib/validation/auth";
import type { TokenPurpose } from "@/lib/generated/prisma/enums";

/**
 * Authentication service.
 *
 * Design notes that are easy to get wrong and expensive to get wrong:
 *
 *  • FAILURES ARE INDISTINGUISHABLE. Wrong password, unknown account, and
 *    unverified account all return the same generic message and take
 *    comparable time. Anything else is an account-enumeration oracle, which
 *    matters more than usual here: knowing someone is a member of a savings
 *    association is itself sensitive.
 *
 *  • LOCKOUT LIVES IN THE DATABASE. Rate limiting by IP is easily sidestepped
 *    with a proxy pool; a counter on the user row is not.
 *
 *  • PASSWORD RESET NEVER CONFIRMS EXISTENCE. The endpoint responds
 *    identically whether or not the account exists.
 */

export type LoginFailureReason =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_PENDING"
  | "ASSOCIATION_INACTIVE";

export type LoginResult =
  | {
      ok: true;
      userId: string;
      role: "MEMBER" | "ADMIN" | "SUPER_ADMIN";
      mustChangePassword: boolean;
      token: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      reason: LoginFailureReason;
      /// Client-safe message. Deliberately vague for credential failures.
      message: string;
      lockedUntil?: Date;
    };

const GENERIC_FAILURE =
  "Those credentials are not correct. Check your details and try again.";

/**
 * Who is signing in. `qr` is a scanned sign-in card: the card names the
 * account, and the password still has to be typed — see lib/auth/qr-access.ts.
 * Its `value` is what login activity records, `qr:<code id>`, so the owner's
 * security page shows the card rather than a bare user id.
 */
export type LoginIdentifier =
  | { type: "email" | "phone"; value: string }
  | { type: "qr"; value: string; userId: string };

export async function authenticate(
  identifier: LoginIdentifier,
  password: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<LoginResult> {
  const env = getEnv();

  const user = await prisma.user.findFirst({
    where:
      identifier.type === "qr"
        ? { id: identifier.userId }
        : identifier.type === "email"
          ? { email: identifier.value }
          : { phone: identifier.value },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      mustChangePassword: true,
      associationId: true,
      association: { select: { status: true } },
    },
  });

  if (!user) {
    // Burn equivalent CPU so response time does not reveal that the account
    // is unknown.
    await fakeVerifyPassword();
    await recordLoginAttempt(null, identifier.value, false, "NO_SUCH_USER", context);
    return { ok: false, reason: "INVALID_CREDENTIALS", message: GENERIC_FAILURE };
  }

  // Lockout is checked before the password so a locked account cannot be used
  // as an oracle to test passwords.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordLoginAttempt(user.id, identifier.value, false, "LOCKED", context);
    return {
      ok: false,
      reason: "ACCOUNT_LOCKED",
      message: `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
      lockedUntil: user.lockedUntil,
    };
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.AUTH_MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60_000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });

    await recordLoginAttempt(
      user.id,
      identifier.value,
      false,
      "BAD_PASSWORD",
      context
    );

    if (shouldLock) {
      authLogger.warn(
        { userId: user.id, attempts },
        "account locked after repeated failures"
      );
      await recordAudit(
        {
          action: AUDIT_ACTIONS.USER_LOCKED_OUT,
          entityType: "User",
          entityId: user.id,
          associationId: user.associationId,
          metadata: { attempts, lockedUntil },
          severity: "WARNING",
        },
        { id: user.id, role: user.role, email: user.email }
      );

      return {
        ok: false,
        reason: "ACCOUNT_LOCKED",
        message: `Too many failed attempts. Your account is locked for ${env.AUTH_LOCKOUT_MINUTES} minutes.`,
        lockedUntil: lockedUntil ?? undefined,
      };
    }

    return { ok: false, reason: "INVALID_CREDENTIALS", message: GENERIC_FAILURE };
  }

  // Password is correct — now check whether the account may actually be used.
  // These checks come after verification so they cannot be used to enumerate
  // account states without knowing the password.
  if (user.status === "SUSPENDED" || user.status === "DISABLED") {
    await recordLoginAttempt(user.id, identifier.value, false, "SUSPENDED", context);
    return {
      ok: false,
      reason: "ACCOUNT_SUSPENDED",
      message:
        "This account has been suspended. Please contact your association administrator.",
    };
  }

  if (user.status === "PENDING_VERIFICATION") {
    await recordLoginAttempt(user.id, identifier.value, false, "PENDING", context);
    return {
      ok: false,
      reason: "ACCOUNT_PENDING",
      message:
        "Your membership is awaiting approval. You will be notified once it is active.",
    };
  }

  if (user.association && user.association.status !== "ACTIVE") {
    await recordLoginAttempt(
      user.id,
      identifier.value,
      false,
      "ASSOCIATION_INACTIVE",
      context
    );
    return {
      ok: false,
      reason: "ASSOCIATION_INACTIVE",
      message: "Your association is not currently active. Please contact support.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: context.ipAddress ?? null,
    },
  });

  const session = await createSession(user.id, context);

  await recordLoginAttempt(user.id, identifier.value, true, null, context);
  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_LOGGED_IN,
      entityType: "User",
      entityId: user.id,
      associationId: user.associationId,
      metadata: { method: identifier.type },
    },
    { id: user.id, role: user.role, email: user.email }
  );

  return {
    ok: true,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

async function recordLoginAttempt(
  userId: string | null,
  identifier: string,
  success: boolean,
  failureReason: string | null,
  context: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  await prisma.loginActivity
    .create({
      data: {
        userId,
        identifier,
        success,
        failureReason,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      },
    })
    .catch((error) => {
      // Never block a login on the audit write, but make the gap visible.
      authLogger.error({ err: error }, "failed to record login activity");
    });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type RegistrationResult =
  | { ok: true; userId: string; memberNumber: string; paymentReference: string }
  | {
      ok: false;
      field: "email" | "phone" | "nationalId" | "photo" | "successorPhoto" | "_";
      message: string;
    };

/**
 * Registers a new member against an association.
 *
 * The user, member, savings account and member number are created in ONE
 * transaction. A half-created member — a user row with no savings account, or
 * a member number claimed by nobody — is a support problem that surfaces much
 * later, usually when a payment arrives and cannot be matched.
 *
 * New registrations land in PENDING_APPROVAL / PENDING_VERIFICATION. An admin
 * admits them. Nobody self-serves their way into an active savings account.
 */
export async function registerMember(
  input: RegisterInput,
  associationId: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<RegistrationResult> {
  const [existingEmail, existingPhone] = await Promise.all([
    // Only worth asking when one was given. `where: { email: undefined }` is
    // not "no email" to Prisma — it is an absent filter, which would match the
    // first user in the table and refuse every applicant who left it blank.
    input.email
      ? prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return {
      ok: false,
      field: "email",
      message: "An account with this email address already exists",
    };
  }
  if (existingPhone) {
    return {
      ok: false,
      field: "phone",
      message: "An account with this phone number already exists",
    };
  }

  if (input.nationalId) {
    const existingNationalId = await prisma.member.findFirst({
      where: { associationId, nationalId: input.nationalId },
      select: { id: true },
    });
    if (existingNationalId) {
      return {
        ok: false,
        field: "nationalId",
        message: "A member with this national ID is already registered",
      };
    }
  }

  // The bytes are vetted before the transaction opens. A photograph that turns
  // out not to be one is the applicant's mistake to correct, and finding that
  // out halfway through creating a user, a member, a number and an account
  // would mean rolling all of it back to say so. Both are optional; an
  // applicant who sent none is registered without one.
  let photo: AcceptedPhoto | null = null;
  if (input.photo) {
    const vetted = acceptPhotoDataUrl(input.photo);
    if (!vetted.ok) {
      return { ok: false, field: "photo", message: vetted.message };
    }
    photo = vetted.photo;
  }

  let successorPhoto: AcceptedPhoto | null = null;
  if (input.successorPhoto) {
    const vetted = acceptPhotoDataUrl(input.successorPhoto);
    if (!vetted.ok) {
      return { ok: false, field: "successorPhoto", message: vetted.message };
    }
    successorPhoto = vetted.photo;
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const association = await tx.association.findUniqueOrThrow({
      where: { id: associationId },
      select: { id: true, code: true, currency: true },
    });

    // Atomic counter claim. Counting existing members instead would race:
    // two simultaneous registrations would compute the same next number and
    // one would fail on the unique constraint.
    const counter = await tx.association.update({
      where: { id: associationId },
      data: { memberRefSequence: { increment: 1 } },
      select: { memberRefSequence: true },
    });

    const sequence = String(counter.memberRefSequence).padStart(6, "0");
    const memberNumber = `${association.code}-M${sequence}`;
    const paymentReference = `${association.code}-${sequence}`;
    const accountNumber = `${association.code}-SA-${sequence}`;

    const user = await tx.user.create({
      data: {
        associationId,
        email: input.email ?? null,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        role: "MEMBER",
        // Not ACTIVE. An admin approves membership before the account works.
        status: "PENDING_VERIFICATION",
        // The applicant's own photograph is their card photograph — one face,
        // one row, rather than a copy here that drifts from the one the card
        // prints.
        ...(photo ? { avatar: { create: photo } } : {}),
        member: {
          create: {
            associationId,
            memberNumber,
            paymentReference,
            status: "PENDING_APPROVAL",
            kycStatus: input.nationalId ? "PENDING" : "UNVERIFIED",
            nationalId: input.nationalId ?? null,
            occupation: input.occupation ?? null,
            district: input.district ?? null,
            province: input.province ?? null,
            successorName: input.successorName ?? null,
            successorPhone: input.successorPhone ?? null,
            successorRelation: input.successorRelation ?? null,
            successorNationalId: input.successorNationalId ?? null,
            sharesSubscribed: input.sharesSubscribed,
            hasCompany: input.hasCompany ?? null,
            hasProfessionalCertificate: input.hasProfessionalCertificate,
            acceptsInterns: input.acceptsInterns ?? null,
            internCapacity: input.internCapacity ?? null,
            ...(successorPhoto ? { successorPhoto: { create: successorPhoto } } : {}),
            savingsAccounts: {
              create: {
                associationId,
                accountNumber,
                currency: association.currency,
                // Opens at zero. Money only ever enters through the ledger.
                balance: "0",
              },
            },
          },
        },
      },
      select: { id: true },
    });

    return { userId: user.id, memberNumber, paymentReference };
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.MEMBER_REGISTERED,
      entityType: "Member",
      entityId: result.userId,
      associationId,
      newValue: {
        email: input.email ?? null,
        phone: input.phone,
        memberNumber: result.memberNumber,
      },
      metadata: { source: "self_registration", ...context },
    },
    null
  );

  authLogger.info(
    { userId: result.userId, memberNumber: result.memberNumber },
    "member registered"
  );

  return { ok: true, ...result };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Issues a password reset token.
 *
 * Always resolves successfully, whether or not the account exists — the caller
 * shows the same "if that account exists, we've sent a link" message either
 * way. Returns the token only when one was actually created, for the caller to
 * dispatch by email/SMS.
 */
export async function requestPasswordReset(
  identifier: { type: "email" | "phone"; value: string }
): Promise<{ token: string; userId: string; email: string | null; phone: string | null } | null> {
  const user = await prisma.user.findFirst({
    where:
      identifier.type === "email"
        ? { email: identifier.value }
        : { phone: identifier.value },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      associationId: true,
    },
  });

  if (!user) return null;
  if (user.status === "DISABLED" || user.status === "SUSPENDED") return null;

  const rawToken = generateToken(32);
  const tokenHash = await sha256(rawToken);

  // Invalidate outstanding reset tokens, so a link sent earlier (possibly to a
  // mailbox the user no longer controls) stops working the moment a new one is
  // requested.
  await prisma.verificationToken.updateMany({
    where: { userId: user.id, purpose: "PASSWORD_RESET", consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
    },
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
      entityType: "User",
      entityId: user.id,
      associationId: user.associationId,
      severity: "NOTICE",
    },
    { id: user.id, role: user.role, email: user.email }
  );

  return { token: rawToken, userId: user.id, email: user.email, phone: user.phone };
}

export type ResetResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<ResetResult> {
  const tokenHash = await sha256(rawToken);

  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      purpose: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { id: true, role: true, email: true, associationId: true } },
    },
  });

  const invalid = { ok: false as const, message: "This reset link is invalid or has expired." };

  if (!token) return invalid;
  if (token.purpose !== "PASSWORD_RESET") return invalid;
  if (token.consumedAt) return invalid;
  if (token.expiresAt <= new Date()) return invalid;

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    await tx.user.update({
      where: { id: token.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        // A successful reset clears any lockout — the legitimate owner has
        // just proved control of the registered email or phone.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  });

  // Every existing session dies. If the reset was triggered because an
  // attacker had access, leaving their session alive would defeat the point.
  await revokeAllUserSessions(token.userId, "PASSWORD_RESET");

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_COMPLETED,
      entityType: "User",
      entityId: token.userId,
      associationId: token.user.associationId,
      severity: "NOTICE",
    },
    { id: token.user.id, role: token.user.role, email: token.user.email }
  );

  return { ok: true, userId: token.userId };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      email: true,
      associationId: true,
    },
  });

  if (!user) return { ok: false, message: "Account not found" };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, message: "Your current password is not correct" };
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });

  // Keep the caller signed in on this device, evict every other one.
  await revokeAllUserSessions(userId, "PASSWORD_CHANGED", currentSessionId);

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entityType: "User",
      entityId: userId,
      associationId: user.associationId,
      severity: "NOTICE",
    },
    { id: user.id, role: user.role, email: user.email }
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Verification codes (email / phone)
// ---------------------------------------------------------------------------

export async function issueVerificationToken(
  userId: string,
  purpose: TokenPurpose,
  ttlMinutes = 15
): Promise<string> {
  const rawToken = generateToken(24);
  const tokenHash = await sha256(rawToken);

  await prisma.verificationToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash,
      purpose,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });

  return rawToken;
}

export async function consumeVerificationToken(
  rawToken: string,
  purpose: TokenPurpose
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const tokenHash = await sha256(rawToken);

  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, purpose: true, expiresAt: true, consumedAt: true },
  });

  if (!token || token.purpose !== purpose || token.consumedAt || token.expiresAt <= new Date()) {
    return { ok: false, message: "This verification link is invalid or has expired." };
  }

  await prisma.verificationToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });

  const field =
    purpose === "EMAIL_VERIFICATION" ? "emailVerifiedAt" : "phoneVerifiedAt";

  await prisma.user.update({
    where: { id: token.userId },
    data: { [field]: new Date() },
  });

  return { ok: true, userId: token.userId };
}
