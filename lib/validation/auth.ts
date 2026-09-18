import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth/password.shared";
import {
  checkDistrictInProvince,
  optionalDistrict,
  optionalProvince,
} from "@/lib/validation/rwanda";
import {
  normaliseInternAnswers,
  memberFieldsSchema,
  requireInternAnswers,
  requireSuccessorIdentity,
  wholeNumber,
} from "@/lib/validation/members";
import { MAX_APPLICATION_SHARES } from "@/lib/application-limits";
import {
  MAX_PHOTO_DATA_URL_LENGTH,
  PHOTO_DATA_URL_PATTERN,
} from "@/lib/images/photo";

/**
 * Auth request schemas.
 *
 * Shared by the route handlers and the forms, so the browser and the server
 * apply exactly the same rules. The client copy is a convenience that gives
 * fast inline feedback; the server copy is the one that decides.
 */

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`);

/** Accepts either an email address or a Rwandan phone number. */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, "Enter your email or phone number")
  .transform((value, ctx) => {
    if (value.includes("@")) {
      const parsed = z.string().email().safeParse(value.toLowerCase());
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
        return z.NEVER;
      }
      return { type: "email" as const, value: parsed.data };
    }

    const phone = normalisePhone(value);
    if (!phone) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid email address or Rwandan phone number",
      });
      return z.NEVER;
    }
    return { type: "phone" as const, value: phone };
  });

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean().optional().default(false),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, "Enter your first name").max(60),
    lastName: z.string().trim().min(2, "Enter your last name").max(60),
    /// The phone number is the required identifier here, not the email — the
    /// same way round as the desk form, and for the same reason. A tailor
    /// applying from a phone frequently has no email address, and the number
    /// is what actually reaches them; it is a payment-matching key besides.
    /// Either one signs them in, so an applicant who gives an email keeps both
    /// doors open.
    phone: z
      .string()
      .trim()
      .min(1, "Enter your phone number")
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
    nationalId: z
      .string()
      .trim()
      .regex(/^\d{16}$/, "The national ID must be 16 digits")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    occupation: z.string().trim().max(120).optional(),
    // Both come from linked dropdowns, so anything unrecognised is either a
    // crafted request or a stale client — either way it is not saved.
    province: optionalProvince(),
    district: optionalDistrict(),
    // The association's application questions. Shares and whether they have
    // a company are required here, because the applicant is present to give
    // them; the interns questions follow only a yes, which the refinement
    // below enforces. The rest follow the desk form's rules, so they are
    // picked from it rather than restated.
    sharesSubscribed: wholeNumber(
      1,
      MAX_APPLICATION_SHARES,
      `Choose between 1 and ${MAX_APPLICATION_SHARES} shares`
    ),
    hasCompany: z
      .enum(["YES", "NO"], { message: "Answer whether you have a company" })
      .transform((value) => value === "YES"),
    ...memberFieldsSchema.pick({
      email: true,
      acceptsInterns: true,
      internCapacity: true,
      successorName: true,
      successorPhone: true,
      successorRelation: true,
      successorNationalId: true,
      successorPhoto: true,
    }).shape,
    /// Required here, optional at the desk. The applicant is holding a phone
    /// with a camera in it; an administrator transcribing a paper form is not
    /// holding the applicant's face.
    photo: z
      .string()
      .trim()
      .min(1, "Add a passport photograph")
      .max(MAX_PHOTO_DATA_URL_LENGTH, "That photograph is too large. The limit is 1MB.")
      .regex(PHOTO_DATA_URL_PATTERN, "Choose a PNG or JPEG photograph"),
    /// Icyemezo cy'umwuga. A yes and a no are both useful answers; a blank is
    /// not, so the applicant has to pick one.
    hasProfessionalCertificate: z
      .enum(["YES", "NO"], {
        message: "Answer whether you have a professional certificate",
      })
      .transform((value) => value === "YES"),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z
      .boolean()
      .refine((v) => v, "You must accept the association rules to register"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine(checkDistrictInProvince)
  .superRefine(requireInternAnswers)
  .superRefine(requireSuccessorIdentity)
  .transform(normaliseInternAnswers);

export const forgotPasswordSchema = z.object({
  identifier: identifierSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset link is invalid"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.password, {
    message: "Choose a password different from your current one",
    path: ["password"],
  });

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
  purpose: z.enum(["EMAIL_VERIFICATION", "PHONE_VERIFICATION"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
