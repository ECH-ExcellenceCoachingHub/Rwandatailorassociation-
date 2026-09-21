import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import {
  checkDistrictInProvince,
  optionalDistrict,
  optionalProvince,
} from "@/lib/validation/rwanda";
import { MAX_INTERN_CAPACITY, MAX_RECORDED_SHARES } from "@/lib/application-limits";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";
import {
  MAX_PHOTO_DATA_URL_LENGTH,
  PHOTO_DATA_URL_PATTERN,
} from "@/lib/images/photo";

/**
 * Admin member enrolment.
 *
 * Shared by the form and the route handler, so the browser and the server
 * apply the same rules. The client copy gives fast inline feedback; the server
 * copy is the one that decides.
 *
 * HOW THIS DIFFERS FROM SELF-REGISTRATION, AND WHY:
 *
 *   • No password. The member is not present to choose one, and an
 *     administrator choosing on their behalf means the administrator knows it.
 *     A temporary one is generated server-side and must be changed at first
 *     sign-in.
 *
 *   • Email is optional, phone is required. Self-registration happens on a
 *     web form, so the applicant necessarily has an email. A tailor enrolled
 *     at the desk frequently does not, and their phone is the identifier that
 *     actually reaches them — it is also a payment-matching key.
 *
 *   • Every field of the member file is accepted, not the handful the public
 *     form collects. The administrator is transcribing a paper application,
 *     and asking them to save a half-record and then edit it is how details
 *     get lost.
 */

/**
 * Optional free text: empty strings arrive from untouched form fields.
 *
 * The empty string is folded to undefined by a transform rather than by an
 * `.or(z.literal(""))` branch, because that branch is unreachable — "" is a
 * perfectly good string of no more than `max` characters, so the first arm of
 * the union always matches it and "" reaches the database as "". Every other
 * optional field in this file resolves to undefined when it is blank; a
 * cleared occupation has to do the same, or "not recorded" and "recorded as
 * nothing" become two different states that render differently.
 */
function optionalText(max: number, label?: string) {
  return z
    .string()
    .trim()
    .max(max, label ? `${label} is too long` : `Must be ${max} characters or fewer`)
    .optional()
    .transform((value) => value || undefined);
}

/** Optional Rwandan mobile, normalised to E.164 so matching keys line up. */
function optionalPhone(message: string) {
  return z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value, ctx) => {
      if (!value) return undefined;
      const normalised = normalisePhone(value);
      if (!normalised) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return normalised;
    });
}

/**
 * A whole number within bounds. Arrives as a string from a form field and as a
 * number from a JSON body, so both are accepted.
 */
export function wholeNumber(min: number, max: number, message: string) {
  return z.union([z.string(), z.number()]).transform((value, ctx) => {
    const n = String(value).trim() === "" ? NaN : Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return n;
  });
}

/** The same, with a blank read as unanswered rather than as a bad number. */
function optionalWholeNumber(min: number, max: number, message: string) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || String(value).trim() === "") return undefined;
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

/**
 * A yes/no question, sent as "YES" / "NO" by a select. Blank is unanswered,
 * which is not the same as "no".
 */
function optionalYesNo() {
  return z
    .enum(["YES", "NO"])
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value) => (value === undefined ? undefined : value === "YES"));
}

/**
 * A photograph carried in the JSON body as a `data:` URL.
 *
 * Only the shape is checked here. Whether the bytes are really a PNG or a JPEG
 * is decided by their own magic numbers once they are decoded, in
 * lib/images/photo.ts — a media type written into a string by the sender is a
 * claim, not a fact. The length cap is on the string rather than the decoded
 * bytes so an oversized upload is refused before it is allocated.
 */
function optionalPhotoDataUrl() {
  return z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || value.length <= MAX_PHOTO_DATA_URL_LENGTH, {
      message: "That photograph is too large. The limit is 1MB.",
    })
    .refine((value) => value === undefined || PHOTO_DATA_URL_PATTERN.test(value), {
      message: "Choose a PNG or JPEG photograph",
    });
}

/**
 * A successor recorded by name alone is a successor nobody can act on: the
 * warehouse counter settles who is who on the ID number, so a name without one
 * is a row that looks answered and answers nothing.
 *
 * The photograph is not insisted on. An applicant rarely has a usable picture
 * of somebody else to hand, and an administrator can add it at approval.
 *
 * Only the public form insists. The desk form does not — an administrator
 * transcribing a paper application may genuinely not have been given the
 * number, and refusing to save the rest of the file over it loses more than it
 * protects.
 */
export function requireSuccessorIdentity(
  data: {
    successorName?: string;
    successorNationalId?: string;
  },
  ctx: z.RefinementCtx
) {
  if (!data.successorName) return;

  if (!data.successorNationalId) {
    ctx.addIssue({
      code: "custom",
      path: ["successorNationalId"],
      message: "Enter the successor's national ID",
    });
  }
}

/**
 * The interns questions are only for someone with a company, and a capacity
 * only means something beside a yes. On the public form each answer is
 * required once the one before it says yes — the applicant is there to finish
 * it. The desk form does not insist: a paper application with a blank is
 * still worth saving.
 */
export function requireInternAnswers(
  data: { hasCompany?: boolean; acceptsInterns?: boolean; internCapacity?: number },
  ctx: z.RefinementCtx
) {
  if (data.hasCompany && data.acceptsInterns === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["acceptsInterns"],
      message: "Answer whether you would take on interns",
    });
  }
  if (data.hasCompany && data.acceptsInterns && data.internCapacity === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["internCapacity"],
      message: "Enter how many interns you can take on",
    });
  }
}

/**
 * Drops answers to questions that no longer apply — the interns answers
 * without a company, the capacity without a yes — so a value typed before an
 * earlier answer changed is not saved as if it still stood.
 */
export function normaliseInternAnswers<
  T extends { hasCompany?: boolean; acceptsInterns?: boolean; internCapacity?: number },
>(data: T): T {
  if (!data.hasCompany) {
    return { ...data, acceptsInterns: undefined, internCapacity: undefined };
  }
  return data.acceptsInterns ? data : { ...data, internCapacity: undefined };
}

/**
 * Every field of a member's file. Enrolment adds the status decision on top;
 * editing takes it as it stands — see the two schemas below.
 *
 * Exported because self-service editing asks for the same facts about the same
 * person — see lib/validation/profile.ts, which picks its subset out of this
 * object rather than restating the rules. A phone number that is valid when an
 * administrator types it must be valid when the member types it themselves.
 */
export const memberFieldsSchema = z.object({
  // Identity ----------------------------------------------------------------
  firstName: z.string().trim().min(2, "Enter the member's first name").max(60),
  lastName: z.string().trim().min(2, "Enter the member's last name").max(60),

  /// Office held in the association, printed under the name on the membership
  /// card. Blank is the ordinary case and prints the Kinyarwanda default;
  /// capped short because the card gives this line one line and no more.
  title: z
    .string()
    .trim()
    .max(40, "Keep the title short enough to print on a card")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  phone: z
    .string()
    .trim()
    .min(1, "Enter the member's phone number")
    .transform((value, ctx) => {
      const normalised = normalisePhone(value);
      if (!normalised) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid Rwandan mobile number, e.g. 0788123456",
        });
        return z.NEVER;
      }
      return normalised;
    }),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  nationalId: z
    .string()
    .trim()
    .regex(/^\d{16}$/, "The national ID must be 16 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value, ctx) => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date of birth" });
        return z.NEVER;
      }
      if (date > new Date()) {
        ctx.addIssue({ code: "custom", message: "Date of birth cannot be in the future" });
        return z.NEVER;
      }
      return date;
    }),

  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),

  // Livelihood --------------------------------------------------------------
  occupation: optionalText(120, "Occupation"),
  businessName: optionalText(160, "Business name"),

  // Address -----------------------------------------------------------------
  addressLine1: optionalText(160, "Address"),
  city: optionalText(80, "City"),
  // Chosen from Rwanda's fixed list rather than typed, and stored canonically,
  // so a district breakdown groups every member of a district together
  // regardless of who transcribed the form.
  district: optionalDistrict(),
  province: optionalProvince(),

  // Payment identifiers -----------------------------------------------------
  // Both are fallback matching keys when a payment carries no reference, which
  // is why they are normalised rather than stored as typed.
  mobileMoneyNumber: optionalPhone(
    "Enter a valid mobile money number, e.g. 0788123456"
  ),
  bankAccountNumber: z
    .string()
    .trim()
    .max(34)
    .regex(/^[A-Za-z0-9\s-]*$/, "Enter a valid account number")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value) => value?.replace(/[\s-]/g, "") || undefined),

  // Next of kin -------------------------------------------------------------
  nextOfKinName: optionalText(120, "Next of kin name"),
  nextOfKinPhone: optionalPhone("Enter a valid next of kin phone number"),
  nextOfKinRelation: optionalText(60, "Relationship"),

  // Successor (umusimbura) --------------------------------------------------
  successorName: optionalText(120, "Successor name"),
  successorPhone: optionalPhone("Enter a valid phone number for the successor"),
  successorRelation: optionalText(60, "Relationship"),
  successorNationalId: z
    .string()
    .trim()
    .regex(/^\d{16}$/, "The successor's national ID must be 16 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Application: shares and interns -----------------------------------------
  /// The public form caps this at MAX_APPLICATION_SHARES; the desk may record
  /// more, because more than that is agreed with the association first.
  sharesSubscribed: optionalWholeNumber(
    1,
    MAX_RECORDED_SHARES,
    `Enter a number of shares between 1 and ${MAX_RECORDED_SHARES}`
  ),
  hasCompany: optionalYesNo(),
  /// Icyemezo cy'umwuga. Asked of everyone, company or not — it is about the
  /// trade, not the business.
  hasProfessionalCertificate: optionalYesNo(),
  acceptsInterns: optionalYesNo(),
  internCapacity: optionalWholeNumber(
    1,
    MAX_INTERN_CAPACITY,
    `Enter a number of interns between 1 and ${MAX_INTERN_CAPACITY}`
  ),

  // Photographs -------------------------------------------------------------
  /// The member's own face, which is also what prints on their membership
  /// card — so it is stored as their UserAvatar rather than a second time
  /// here. Omitting it leaves whatever is already on file untouched.
  photo: optionalPhotoDataUrl(),
  /// The successor's face, checked at the warehouse counter when they collect
  /// in the member's place.
  successorPhoto: optionalPhotoDataUrl(),

  /// Recorded on the audit entry. Not optional: creating a member is creating
  /// a claim on the association's money.
  note: optionalText(500, "Note"),
});

export const createMemberSchema = memberFieldsSchema
  .extend({
    // Enrolment decision ----------------------------------------------------
    /// Whether the member may transact immediately. An administrator entering a
    /// completed paper application is vouching for it, so ACTIVE is the default;
    /// PENDING_APPROVAL exists for a form that still needs a second pair of eyes.
    status: z.enum(["ACTIVE", "PENDING_APPROVAL"]).default("ACTIVE"),
  })
  .superRefine(checkDistrictInProvince)
  .transform(normaliseInternAnswers);

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * Editing an existing member's file.
 *
 * The same fields as enrolment, minus `status`. Membership status is not a
 * profile field: approving, suspending and reactivating each have their own
 * permission, demand their own reason, and notify the member. Letting a
 * profile edit quietly flip someone from SUSPENDED to ACTIVE would route
 * around all three.
 *
 * Also absent, deliberately: `memberNumber` and `paymentReference`. Those are
 * the member's identity, printed on every payment instruction they have ever
 * been given. Editing a payment reference would orphan the payments already
 * matched by it and silently break the matching of future ones.
 */
export const updateMemberSchema = memberFieldsSchema
  .superRefine(checkDistrictInProvince)
  .transform(normaliseInternAnswers);

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/**
 * Decisions an administrator can take about a membership — on one member's
 * file, or on many at once from the register.
 *
 * One list, so the single and bulk endpoints cannot drift apart on what an
 * action is called, which permission it needs, or how long its reason must be.
 */
export const MEMBER_ACTIONS = [
  "approve",
  "reject",
  "suspend",
  "reactivate",
  "close",
  "verify_kyc",
  "reject_kyc",
  "delete",
] as const;

export type MemberAction = (typeof MEMBER_ACTIONS)[number];

/** Each decision is its own grant. */
export const MEMBER_ACTION_PERMISSION: Record<MemberAction, PermissionCode> = {
  approve: PERMISSIONS.MEMBERS_APPROVE,
  reject: PERMISSIONS.MEMBERS_APPROVE,
  suspend: PERMISSIONS.MEMBERS_SUSPEND,
  reactivate: PERMISSIONS.MEMBERS_SUSPEND,
  close: PERMISSIONS.MEMBERS_DELETE,
  verify_kyc: PERMISSIONS.MEMBERS_VERIFY_KYC,
  reject_kyc: PERMISSIONS.MEMBERS_VERIFY_KYC,
  delete: PERMISSIONS.MEMBERS_DELETE,
};

/**
 * The shortest written reason each action accepts. Absent means none is asked
 * for. The confirmation dialogs read this too: a dialog that accepts a shorter
 * reason than the API does lets someone write one and be refused for it.
 */
export const MEMBER_ACTION_REASON_MIN: Partial<Record<MemberAction, number>> = {
  reject: 5,
  suspend: 5,
  close: 5,
  reject_kyc: 5,
  delete: 10,
};

/** The most members one bulk request may touch — a full page of the register. */
export const MAX_BULK_MEMBERS = 100;

export const bulkMemberActionSchema = z
  .object({
    action: z.enum(MEMBER_ACTIONS),
    memberIds: z
      .array(z.string().min(1))
      .min(1, "Select at least one member")
      .max(MAX_BULK_MEMBERS, `Select at most ${MAX_BULK_MEMBERS} members at a time`),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    const min = MEMBER_ACTION_REASON_MIN[value.action];
    if (min && (value.reason?.length ?? 0) < min) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: `Give a reason of at least ${min} characters — it is recorded in the audit log`,
      });
    }
  });

export type BulkMemberActionInput = z.infer<typeof bulkMemberActionSchema>;
