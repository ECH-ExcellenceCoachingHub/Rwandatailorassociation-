/**
 * Password rules shared between the browser and the server.
 *
 * Split out of lib/auth/password.ts because that module is `server-only` — it
 * holds the Argon2 hashing, which must never ship to a client bundle. The
 * policy constants and the strength meter, by contrast, need to run in both
 * places so the registration form and the API agree on what is acceptable.
 *
 * The server still re-validates everything here. Anything a browser checks is
 * advice, not enforcement.
 */

/**
 * Kept short on purpose. Members sign in on basic phones, often with help, and
 * a ten-character rule with symbols produced passwords written on paper — or
 * abandoned applications. Six characters with a letter and a number is easy to
 * remember and still rules out the "123456" that guessing starts with.
 */
export const MIN_PASSWORD_LENGTH = 6;
/** Unbounded input is a cheap denial-of-service against a slow KDF. */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * A stable identifier for each requirement, so the browser can render it in
 * the reader's language. The English `issues` strings stay as they are — they
 * are what the API returns and what a log records — but a Kinyarwanda-speaking
 * applicant needs to be told what to fix in Kinyarwanda, and matching on
 * English prose to work that out would break the moment the wording changed.
 */
export type PasswordIssue = "length" | "letter" | "number";

/** Every requirement, in the order a form lists them. */
export const PASSWORD_REQUIREMENTS: readonly PasswordIssue[] = [
  "length",
  "letter",
  "number",
];

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  /// The requirements still missing, in English.
  issues: string[];
  /// The same requirements as `issues`, in the same order, as translatable codes.
  codes: PasswordIssue[];
  acceptable: boolean;
}

/**
 * Checks a password against the three requirements. Anything that meets all
 * three is accepted; the score is only there to colour the meter.
 */
export function assessPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];
  const codes: PasswordIssue[] = [];

  /** Both forms of the same advice, kept in step by construction. */
  function advise(code: PasswordIssue, message: string) {
    codes.push(code);
    issues.push(message);
  }

  const hasLetter = /\p{L}/u.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (password.length < MIN_PASSWORD_LENGTH) {
    advise("length", `Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!hasLetter) advise("letter", "Add a letter");
  if (!hasNumber) advise("number", "Add a number");

  const acceptable =
    codes.length === 0 && password.length <= MAX_PASSWORD_LENGTH;

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (hasLetter && hasNumber) score++;
  if (acceptable && password.length >= 10) score++;
  if (acceptable && /[^\p{L}0-9]/u.test(password)) score++;

  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

  return {
    score: clamped,
    label: labels[clamped],
    issues,
    codes,
    acceptable,
  };
}
