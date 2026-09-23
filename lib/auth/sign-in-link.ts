import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getEnv } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";

/**
 * Sign-in links an admin copies from the member register: /in/:token opens a
 * bare sign-in screen with the member's phone number already filled in.
 *
 * The number is encrypted into the token (AES-256-GCM, key derived from
 * SESSION_SECRET) so a forwarded or screenshotted link does not show whose it
 * is. The token grants nothing on its own — the password is still required —
 * so it carries no expiry. Rotating SESSION_SECRET makes old links fall back
 * to the plain login page.
 *
 * Only the nine national digits are encrypted, to keep the link short.
 */

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  // Fixed salt: the input is already a high-entropy secret. A different salt
  // from the QR codes keeps the two keys independent.
  cachedKey = scryptSync(getEnv().SESSION_SECRET, "rta-sign-in-link-v1", 32);
  return cachedKey;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Token for a member's phone, or null if the number is not a valid one. */
export function signInLinkToken(phone: string | null | undefined): string | null {
  const normalised = normalisePhone(phone);
  if (!normalised) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalised.slice(4), "utf8"), // strip "+250"
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** The phone number (E.164) inside a token, or null if it is not genuine. */
export function phoneFromSignInLinkToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      raw.subarray(0, IV_BYTES)
    );
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const digits = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");

    return normalisePhone(digits);
  } catch {
    return null;
  }
}
