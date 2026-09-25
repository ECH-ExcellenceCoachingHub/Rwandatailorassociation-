import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { authLogger } from "@/lib/logger";
import { generateToken, sha256 } from "@/lib/auth/jwt";
import { authenticate, type LoginFailureReason } from "@/lib/auth/service";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Printable sign-in QR codes.
 *
 * WHY THIS EXISTS. The people this platform serves are tailors, and many of
 * them struggle to type a phone number and a password on a phone keyboard. A
 * card they keep in a wallet and hold up to a camera takes them straight to
 * their own sign-in screen, where the only thing left to type is the password.
 *
 * A SCAN IS NOT A SIGN-IN. The card names an account; it does not unlock it.
 * Scanning opens a password screen, the same as the sign-in link an admin
 * shares (/in/:token), and the password goes through the normal checks,
 * including the per-account lockout. Someone who finds or photographs a card
 * still cannot get into the account. Even so, the code carries the usual
 * controls:
 *
 *   - every code expires (QR_ACCESS_TTL_DAYS, default 180 days);
 *   - issuing a new code revokes the previous one, so "I lost my card" has a
 *     one-click answer;
 *   - the owner can revoke without replacing;
 *   - issue, scan, rejection and revocation are all audited, and a sign-in by
 *     card is recorded in login activity where the owner can see it;
 *   - both the scan and the password step are rate limited.
 *
 * WHAT IS STORED. Two derivations of one secret, never the secret itself:
 *   - `tokenHash`    - SHA-256, the lookup key when a code is scanned.
 *   - `secretCipher` - AES-256-GCM ciphertext, so the owner can re-download
 *                      the card later. The key comes from SESSION_SECRET,
 *                      which is in the environment and not in the database, so
 *                      a dump of the table alone produces nothing scannable.
 *
 * The consequence of that second point is worth stating plainly: rotating
 * SESSION_SECRET makes existing codes undecryptable. Rotation already signs
 * everyone out, and `getActiveQrCode` treats an undecryptable row as "no code"
 * so the owner is simply offered a new one instead of an error.
 */

// ---------------------------------------------------------------------------
// Secret storage
// ---------------------------------------------------------------------------

const CIPHER_VERSION = "v1";

/// scrypt is deliberately slow, so the derived key is computed once per
/// process rather than once per read.
let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  // A fixed salt is correct here: the input is already a high-entropy secret,
  // so the salt's usual job — defeating precomputation against low-entropy
  // passwords — does not apply, and a per-row salt would mean a key derivation
  // on every read.
  cachedKey = scryptSync(getEnv().SESSION_SECRET, "rta-qr-access-v1", 32);
  return cachedKey;
}

function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Returns null rather than throwing — an unreadable row is a recoverable
 * state (a rotated SESSION_SECRET), not an exception the page should surface.
 */
function decryptSecret(payload: string): string | null {
  try {
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== CIPHER_VERSION || !iv || !tag || !ciphertext) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The scannable value
// ---------------------------------------------------------------------------

/**
 * What the image actually encodes: an absolute URL back to this deployment.
 *
 * A URL rather than a bare token, because it has to work in the camera app a
 * member already has. Every phone camera offers to open a URL; none of them
 * know what to do with 43 characters of base64.
 */
export function qrAccessUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/+$/, "")}/qr/${token}`;
}

/**
 * Cheap shape check before touching the database. `generateToken(32)` produces
 * 43 base64url characters; anything else is a typo or a probe, and rejecting it
 * here keeps scanner noise off the database.
 */
function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ActiveQrCode {
  id: string;
  /// The scannable secret, decrypted. This never leaves the server except as
  /// pixels in the owner's own image.
  token: string;
  url: string;
  issuedAt: Date;
  expiresAt: Date;
  /// Whole days remaining, rounded up. Computed here rather than in the page
  /// so that no component reads the clock while rendering.
  daysUntilExpiry: number;
  lastUsedAt: Date | null;
  useCount: number;
}

/**
 * The caller's live code, or null when they have none, it expired, it was
 * revoked, or it can no longer be decrypted.
 */
export async function getActiveQrCode(userId: string): Promise<ActiveQrCode | null> {
  const row = await prisma.accessQrCode.findFirst({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      secretCipher: true,
      issuedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      useCount: true,
    },
  });

  if (!row) return null;

  const token = decryptSecret(row.secretCipher);
  if (!token) {
    authLogger.warn(
      { userId, qrCodeId: row.id },
      "QR access code could not be decrypted — SESSION_SECRET has probably rotated"
    );
    return null;
  }

  return {
    id: row.id,
    token,
    url: qrAccessUrl(token),
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    daysUntilExpiry: daysUntil(row.expiresAt),
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
  };
}

/**
 * `getActiveQrCode` for many holders at once, keyed by user id. A holder with
 * no usable code is simply absent from the map.
 *
 * For printing cards in bulk: one query for the whole batch instead of one per
 * card, with the same rules — newest live code wins, and an undecryptable one
 * counts as none.
 */
export async function getActiveQrCodes(
  userIds: readonly string[]
): Promise<Map<string, ActiveQrCode>> {
  const codes = new Map<string, ActiveQrCode>();
  if (userIds.length === 0) return codes;

  const rows = await prisma.accessQrCode.findMany({
    where: { userId: { in: [...userIds] }, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      userId: true,
      secretCipher: true,
      issuedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      useCount: true,
    },
  });

  const seen = new Set<string>();

  for (const row of rows) {
    // Newest first, so the first row seen for a holder is the one that counts
    // — even when it cannot be decrypted, exactly as in `getActiveQrCode`.
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);

    const token = decryptSecret(row.secretCipher);
    if (!token) continue;

    codes.set(row.userId, {
      id: row.id,
      token,
      url: qrAccessUrl(token),
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      daysUntilExpiry: daysUntil(row.expiresAt),
      lastUsedAt: row.lastUsedAt,
      useCount: row.useCount,
    });
  }

  return codes;
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Issuing and revoking
// ---------------------------------------------------------------------------

/** The fields `recordAudit` needs, plus the tenant the entry belongs to. */
export interface QrActor {
  id: string;
  role: UserRole;
  email: string | null;
  associationId: string | null;
}

/**
 * Issues a fresh code, revoking any the user already holds.
 *
 * Replacing rather than accumulating is the point: a member who has lost their
 * card presses one button and the lost card stops working. Allowing several
 * live codes at once would mean the lost one keeps working until somebody
 * works out which row it was.
 */
export async function issueQrCode(
  userId: string,
  actor: QrActor
): Promise<ActiveQrCode> {
  const env = getEnv();
  const token = generateToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + env.QR_ACCESS_TTL_DAYS * 86_400_000);

  const created = await prisma.$transaction(async (tx) => {
    const replaced = await tx.accessQrCode.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "REPLACED" },
    });

    const row = await tx.accessQrCode.create({
      data: {
        userId,
        tokenHash,
        secretCipher: encryptSecret(token),
        expiresAt,
      },
      select: { id: true, issuedAt: true, expiresAt: true },
    });

    return { ...row, replaced: replaced.count };
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.QR_ACCESS_ISSUED,
      entityType: "AccessQrCode",
      entityId: created.id,
      associationId: actor.associationId,
      metadata: {
        expiresAt: created.expiresAt.toISOString(),
        replacedCodes: created.replaced,
      },
      severity: "WARNING",
    },
    actor
  );

  authLogger.info(
    { userId, qrCodeId: created.id, replaced: created.replaced },
    "QR access code issued"
  );

  return {
    id: created.id,
    token,
    url: qrAccessUrl(token),
    issuedAt: created.issuedAt,
    expiresAt: created.expiresAt,
    daysUntilExpiry: env.QR_ACCESS_TTL_DAYS,
    lastUsedAt: null,
    useCount: 0,
  };
}

/** Revokes every live code for a user. Returns how many were revoked. */
export async function revokeQrCodes(
  userId: string,
  reason: string,
  actor: QrActor
): Promise<number> {
  const result = await prisma.accessQrCode.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });

  if (result.count > 0) {
    await recordAudit(
      {
        action: AUDIT_ACTIONS.QR_ACCESS_REVOKED,
        entityType: "AccessQrCode",
        entityId: userId,
        associationId: actor.associationId,
        reason,
        metadata: { revokedCount: result.count },
        severity: "WARNING",
      },
      actor
    );

    authLogger.info({ userId, reason, count: result.count }, "QR access codes revoked");
  }

  return result.count;
}

// ---------------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------------

export type QrRejectionReason =
  | "INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "ACCOUNT_INACTIVE";

type QrContext = { ipAddress?: string | null; userAgent?: string | null };

export type QrLookup =
  | {
      ok: true;
      qrCodeId: string;
      userId: string;
      role: UserRole;
      email: string | null;
      associationId: string | null;
      /// Shown on the password screen, so the holder can see whose card this
      /// is. The printed card already carries it; nothing new is revealed.
      fullName: string;
    }
  | { ok: false; reason: QrRejectionReason };

/**
 * Checks a scanned code WITHOUT signing anyone in.
 *
 * The card names an account; it does not unlock it. What it saves the owner is
 * typing their phone number — the password is still asked for on the next
 * screen, exactly as with the sign-in link an admin shares (/in/:token). A
 * card picked up off a workbench is therefore worth nothing on its own.
 *
 * The failure reasons are distinguished for the log and the audit trail, not
 * for the person holding the card: the screen says the same thing either way,
 * because telling a stranger *why* a code failed tells them whether they have
 * found a real one.
 */
export async function lookupQrToken(
  rawToken: string,
  context: QrContext = {}
): Promise<QrLookup> {
  const token = rawToken.trim();

  if (!looksLikeToken(token)) {
    await recordRejection(null, "INVALID", context);
    return { ok: false, reason: "INVALID" };
  }

  const tokenHash = await sha256(token);

  const row = await prisma.accessQrCode.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          role: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          associationId: true,
          association: { select: { status: true } },
        },
      },
    },
  });

  if (!row) {
    await recordRejection(null, "INVALID", context);
    return { ok: false, reason: "INVALID" };
  }

  const reject = async (reason: QrRejectionReason): Promise<QrLookup> => {
    await recordRejection(row, reason, context);
    return { ok: false, reason };
  };

  if (row.revokedAt) return reject("REVOKED");
  if (row.expiresAt.getTime() <= Date.now()) return reject("EXPIRED");

  // The card says who its owner was when it was printed. The database says
  // whether that account may still be used, and the database wins — the same
  // rule the session loader applies on every request.
  if (row.user.status !== "ACTIVE") return reject("ACCOUNT_INACTIVE");
  if (row.user.association && row.user.association.status !== "ACTIVE") {
    return reject("ACCOUNT_INACTIVE");
  }

  return {
    ok: true,
    qrCodeId: row.id,
    userId: row.userId,
    role: row.user.role,
    email: row.user.email,
    associationId: row.user.associationId,
    fullName: `${row.user.firstName} ${row.user.lastName}`.trim(),
  };
}

export type QrRedemption =
  | {
      ok: true;
      userId: string;
      role: UserRole;
      token: string;
      expiresAt: Date;
      mustChangePassword: boolean;
    }
  /// The card itself is no good. The caller sends the holder to /qr-invalid.
  | { ok: false; reason: QrRejectionReason }
  /// The card is fine; the password was not. `message` is client-safe.
  | { ok: false; reason: LoginFailureReason; message: string };

/**
 * Signs in the owner of a scanned code, given their password.
 *
 * The password goes through `authenticate`, so a scan is held to everything a
 * normal sign-in is: the per-account lockout, the account-status checks, and a
 * login-activity row — recorded as `qr:<code id>`, which is what makes a scan
 * legible on the owner's security page.
 */
export async function redeemQrToken(
  rawToken: string,
  password: string,
  context: QrContext = {}
): Promise<QrRedemption> {
  const code = await lookupQrToken(rawToken, context);
  if (!code.ok) return code;

  const login = await authenticate(
    { type: "qr", value: `qr:${code.qrCodeId}`, userId: code.userId },
    password,
    context
  );

  if (!login.ok) {
    return { ok: false, reason: login.reason, message: login.message };
  }

  // Usage counters feed the owner's own "where has my card been used" panel.
  // A failure here must not cost them the sign-in they have just made.
  await prisma.accessQrCode
    .update({
      where: { id: code.qrCodeId },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: context.ipAddress ?? null,
        useCount: { increment: 1 },
      },
    })
    .catch((error) => {
      authLogger.warn({ err: error, qrCodeId: code.qrCodeId }, "failed to record QR code use");
    });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.QR_ACCESS_SIGNED_IN,
      entityType: "AccessQrCode",
      entityId: code.qrCodeId,
      associationId: code.associationId,
    },
    { id: code.userId, role: code.role, email: code.email }
  );

  return login;
}

async function recordRejection(
  row: {
    id: string;
    userId: string;
    user: { role: UserRole; email: string | null; associationId: string | null };
  } | null,
  reason: QrRejectionReason,
  context: QrContext
): Promise<void> {
  authLogger.warn(
    { reason, qrCodeId: row?.id ?? null, ip: context.ipAddress ?? null },
    "QR access code rejected"
  );

  // A failed scan must still render a page. Auditing it is important enough to
  // attempt and not important enough to turn a bad card into a 500.
  await recordAudit(
    {
      action: AUDIT_ACTIONS.QR_ACCESS_REJECTED,
      entityType: "AccessQrCode",
      entityId: row?.id ?? null,
      associationId: row?.user.associationId ?? null,
      metadata: { reason },
      severity: "WARNING",
    },
    row ? { id: row.userId, role: row.user.role, email: row.user.email } : null
  ).catch(() => undefined);
}

/** Housekeeping for the background worker, mirroring purgeExpiredSessions. */
export async function purgeExpiredQrCodes(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const result = await prisma.accessQrCode.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return result.count;
}
