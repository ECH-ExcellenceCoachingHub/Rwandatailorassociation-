/**
 * Bounds on the membership application questions.
 *
 * A module of its own, with no imports, so the public registration form can
 * read them without pulling the zod schemas into the browser bundle.
 */

/// Shares an applicant may take on the public form. More than this is agreed
/// with the association and then recorded by an administrator.
export const MAX_APPLICATION_SHARES = 30;

/// Ceiling on what an administrator can record — a typo guard, not a policy.
export const MAX_RECORDED_SHARES = 1000;

/// Interns one workshop can take on at once — a typo guard, not a policy.
export const MAX_INTERN_CAPACITY = 100;
