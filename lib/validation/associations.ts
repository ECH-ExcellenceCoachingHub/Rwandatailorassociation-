import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { RESERVED_ASSOCIATION_CODES } from "@/lib/brand";

/**
 * Onboarding a new association: the tenant itself and its first administrator.
 *
 * THE CODE IS FOREVER. It is printed into every member number (ABC-M000123),
 * payment reference (ABC-000123) and savings account the association will ever
 * have, and payers type it into bank narrations — so it is short, letters
 * only, and cannot be changed after creation. Digits are refused because a
 * code ending in one runs straight into the reference number that follows it
 * ("AB1000123") and the statement matcher can no longer tell where the code
 * stops.
 *
 * It is also the association's web address (/abc, /abc/login, /abc/register),
 * which is why the names of the platform's own pages are reserved.
 */


function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((value) => value || undefined);
}

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    if (!z.email().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
      return z.NEVER;
    }
    return value;
  });

function optionalPhone() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const normalised = normalisePhone(value);
      if (!normalised) {
        ctx.addIssue({ code: "custom", message: "Enter a valid Rwandan mobile number" });
        return z.NEVER;
      }
      return normalised;
    });
}

function requiredPhone() {
  return z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .transform((value, ctx) => {
      const normalised = normalisePhone(value);
      if (!normalised) {
        ctx.addIssue({ code: "custom", message: "Enter a valid Rwandan mobile number" });
        return z.NEVER;
      }
      return normalised;
    });
}

export const createAssociationSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,8}$/, "Use 2 to 8 letters, no digits or spaces")
    .refine((code) => !RESERVED_ASSOCIATION_CODES.has(code), {
      message: "This code is reserved by the platform; choose another",
    }),
  name: z.string().trim().min(3, "Name is required").max(150),
  legalName: optionalText(150),
  email: optionalEmail,
  phone: optionalPhone(),
  city: optionalText(80),
  district: optionalText(80),

  // The first administrator. Phone is required because it is how people sign
  // in here; email is optional for the same reason it is for members.
  adminFirstName: z.string().trim().min(1, "First name is required").max(80),
  adminLastName: z.string().trim().min(1, "Last name is required").max(80),
  adminPhone: requiredPhone(),
  adminEmail: optionalEmail,
});

export type CreateAssociationInput = z.infer<typeof createAssociationSchema>;
