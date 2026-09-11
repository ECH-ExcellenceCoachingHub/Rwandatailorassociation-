import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { memberFieldsSchema } from "@/lib/validation/members";
import { checkDistrictInProvince } from "@/lib/validation/rwanda";

/**
 * Self-service profile editing — what a person may change about themselves.
 *
 * WHAT IS ABSENT, AND WHY. Everything omitted here is omitted because letting
 * someone edit it about themselves would route around a control:
 *
 *   • `status` and `kycStatus` — a member who could set their own status could
 *     lift their own suspension. Both move only through the admin actions that
 *     demand a permission and a reason.
 *
 *   • `memberNumber` and `paymentReference` — the member's identity, printed
 *     on every payment instruction they have been given. Editing a reference
 *     orphans the payments already matched by it.
 *
 *   • `note` — the audit note is the *actor's* justification to whoever reads
 *     the log later. Self-edits are recorded with the diff and nothing else; a
 *     reason a person writes about their own change is not a control.
 *
 * `nationalId` IS accepted here, but the service refuses to change one that
 * KYC has already verified — see lib/services/profile.ts. Recording a new one
 * puts identity back in the queue to be checked rather than trusting the
 * person who typed it.
 */

/**
 * Name and contact, as the person themselves.
 *
 * These four are restated rather than picked out of `memberFieldsSchema`
 * because their messages are the difference between the two forms. The admin
 * schema says "Enter the member's first name" — correct at a desk, wrong on
 * the screen of the member reading it about themselves. Everything below this
 * point, where the rules are real work rather than a length check, is picked
 * from that schema so a rule exists in one place.
 */
const selfContactSchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name").max(60),
  lastName: z.string().trim().min(2, "Enter your last name").max(60),

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

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * The fields every signed-in person has, member or not.
 *
 * An administrator with no savings of their own still has a name to correct
 * and a phone number that changes, and those live on the user record.
 */
export const updateOwnAccountSchema = selfContactSchema;

export type UpdateOwnAccountInput = z.infer<typeof updateOwnAccountSchema>;

/**
 * The above plus the member file, for someone who saves with the association.
 *
 * The member half is taken straight from the admin schema. A phone number that
 * is valid when an administrator types it at the desk is valid when the member
 * types it at home; a district canonicalised on one form is canonicalised on
 * the other. Restating any of it here is how the two drift.
 *
 * The district/province cross-check runs for the same reason it runs on the
 * admin form: the two dropdowns cannot disagree, but a direct API call can,
 * and a member filed under "Kicukiro, Northern Province" is a record no report
 * can place.
 */
export const updateOwnProfileSchema = selfContactSchema
  .extend(
    memberFieldsSchema.omit({
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      note: true,
      // `title` is the office printed on the membership card. The others are
      // omitted because their wording differs between the two forms; this one
      // is omitted because it is a claim about standing in the association. A
      // member who could set their own would print themselves a card reading
      // "Chairman". Only an administrator awards it.
      title: true,
      // The application answers. Shares are a commitment the association
      // holds the member to, so once recorded only an administrator changes
      // the count; the successor and interns answers are not on the
      // self-service form yet. Omitted rather than accepted and then silently
      // dropped by the service, which writes only the fields it lists.
      successorName: true,
      successorPhone: true,
      successorRelation: true,
      sharesSubscribed: true,
      hasCompany: true,
      acceptsInterns: true,
      internCapacity: true,
    }).shape
  )
  .superRefine(checkDistrictInProvince);

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
