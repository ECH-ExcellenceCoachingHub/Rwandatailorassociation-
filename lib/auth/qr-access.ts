import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { authLogger } from "@/lib/logger";
import { generateToken, sha256 } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Printable sign-in QR codes.
 *
 * WHY THIS EXISTS. The people this platform serves are tailors, and a good
 * number of them will never reliably reproduce a password on a phone keyboard.
 * A card they can keep in a wallet and hold up to a camera is the difference
 * between checking their own balance and asking someone in the office to check
 * it for them.
 *
 * WHAT IT COSTS. The image is a bearer credential. Anyone who photographs the
 * card, or picks it up off a workbench, can sign in as its owner. That is the
 * same bargain a bank card makes, and it is defensible only with the controls
 * that come with one:
 *
 *   - every code expires (QR_ACCESS_TTL_DAYS, default 180 days);
 *   - issuing a new code revokes the previous one, so "I lost my card" has a
 *     one-click answer;
 *   - the owner can revoke without replacing;
 *   - issue, scan, rejection and revocation are all audited, and a scan is
 *     recorded in login activity where the owner can see it;
 *   - the scan endpoint is rate limited, so a stolen-looking run of failures
 *     is throttled rather than merely logged.
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

export type QrRedemption =
  | {
      ok: true;
      userId: string;
      role: UserRole;
      token: string;
      expiresAt: Date;
      mustChangePassword: boolean;
    }
  | { ok: false; reason: QrRejectionReason };

/**
 * Validates a scanned code and, if it holds up, opens a session.
 *
 * The failure reasons are distinguished for the log and the audit trail, not
 * for the person holding the card: the screen says the same thing either way,
 * because telling a stranger *why* a code failed tells them whether they have
 * found a real one.
 */
export async function redeemQrToken(
  rawToken: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<QrRedemption> {
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
          status: true,
          associationId: true,
          mustChangePassword: true,
          association: { select: { status: true } },
        },
      },
    },
  });

  if (!row) {
    await recordRejection(null, "INVALID", context);
    return { ok: false, reason: "INVALID" };
  }

  const reject = async (reason: QrRejectionReason): Promise<QrRedemption> => {
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

  const session = await createSession(row.userId, context);

  // Usage counters feed the owner's own "where has my card been used" panel.
  // A failure here must not cost them the sign-in they have just made.
  await prisma.accessQrCode
    .update({
      where: { id: row.id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: context.ipAddress ?? null,
        useCount: { increment: 1 },
      },
    })
    .catch((error) => {
      authLogger.warn({ err: error, qrCodeId: row.id }, "failed to record QR code use");
    });

  await prisma.loginActivity
    .create({
      data: {
        userId: row.userId,
        // The security page lists these back to the owner; naming the code
        // rather than an email is what makes a scan legible there.
        identifier: `qr:${row.id}`,
        success: true,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      },
    })
    .catch((error) => {
      authLogger.warn(
        { err: error, userId: row.userId },
        "failed to record QR login activity"
      );
    });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.QR_ACCESS_SIGNED_IN,
      entityType: "AccessQrCode",
      entityId: row.id,
      associationId: row.user.associationId,
      metadata: { sessionId: session.sessionId },
    },
    { id: row.userId, role: row.user.role, email: row.user.email }
  );

  return {
    ok: true,
    userId: row.userId,
    role: row.user.role,
    token: session.token,
    expiresAt: session.expiresAt,
    mustChangePassword: row.user.mustChangePassword,
  };
}

async function recordRejection(
  row: {
    id: string;
    userId: string;
    user: { role: UserRole; email: string | null; associationId: string | null };
  } | null,
  reason: QrRejectionReason,
  context: { ipAddress?: string | null; userAgent?: string | null }
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
