import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "@/lib/db/prisma";
import { recordAudit, diffFields, AUDIT_ACTIONS } from "@/lib/audit";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import { hashPassword } from "@/lib/auth/password";
import { abs, add, subtract, toMoneyString } from "@/lib/money";
import { acceptPhotoDataUrl, type AcceptedPhoto } from "@/lib/images/photo";
import {
  CLOSABLE_STATUSES,
  removalBlockers,
  type BlockerCount,
  type MemberHistory,
} from "@/lib/member-removal";
import type { BulkMemberResult } from "@/lib/member-actions";
import { logger, serialiseError } from "@/lib/logger";
import type {
  CreateMemberInput,
  MemberAction,
  UpdateMemberInput,
} from "@/lib/validation/members";
import type { MemberStatus, UserStatus } from "@/lib/generated/prisma/enums";

/**
 * Member administration.
 *
 * Approval is the gate that turns an application into an account that can hold
 * money. It activates the User as well as the Member, because a member whose
 * membership is approved but whose login is still pending cannot sign in — a
 * mismatch that produces support tickets rather than errors.
 */

export interface MemberListFilters {
  associationId: string | null;
  status?: MemberStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listMembers(filters: MemberListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.MemberWhereInput = {
    ...(filters.associationId ? { associationId: filters.associationId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { memberNumber: { contains: filters.search, mode: "insensitive" } },
            { paymentReference: { contains: filters.search, mode: "insensitive" } },
            { nationalId: { contains: filters.search } },
            {
              user: {
                OR: [
                  { firstName: { contains: filters.search, mode: "insensitive" } },
                  { lastName: { contains: filters.search, mode: "insensitive" } },
                  { email: { contains: filters.search, mode: "insensitive" } },
                  { phone: { contains: filters.search } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        memberNumber: true,
        paymentReference: true,
        status: true,
        kycStatus: true,
        nationalId: true,
        occupation: true,
        district: true,
        joinedAt: true,
        createdAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            role: true,
            lastLoginAt: true,
          },
        },
        savingsAccounts: {
          where: { isActive: true },
          take: 1,
          select: { balance: true, lastTransactionAt: true },
        },
        loans: {
          where: { status: { in: ["ACTIVE", "DISBURSED", "OVERDUE"] } },
          select: {
            principalOutstanding: true,
            interestOutstanding: true,
            feesOutstanding: true,
            penaltyOutstanding: true,
            daysOverdue: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    members: members.map((m) => {
      const outstanding = m.loans.reduce(
        (sum, loan) =>
          add(
            sum,
            loan.principalOutstanding,
            loan.interestOutstanding,
            loan.feesOutstanding,
            loan.penaltyOutstanding
          ),
        add(0)
      );

      return {
        id: m.id,
        userId: m.userId,
        memberNumber: m.memberNumber,
        paymentReference: m.paymentReference,
        fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
        phone: m.user.phone,
        status: m.status,
        kycStatus: m.kycStatus,
        // The register only needs to know whether there is one to verify
        // against; the number itself stays on the member's file.
        hasNationalId: Boolean(m.nationalId),
        isStaff: m.user.role !== "MEMBER",
        userStatus: m.user.status,
        occupation: m.occupation,
        district: m.district,
        balance: m.savingsAccounts[0]?.balance.toFixed(2) ?? "0.00",
        outstandingLoan: toMoneyString(outstanding),
        hasOverdueLoan: m.loans.some((l) => l.daysOverdue > 0),
        joinedAt: m.joinedAt,
        appliedAt: m.createdAt,
        lastLoginAt: m.user.lastLoginAt,
        lastTransactionAt: m.savingsAccounts[0]?.lastTransactionAt ?? null,
      };
    }),
  };
}

/**
 * Approves a pending membership.
 *
 * Activates BOTH the member record and the login, opens the savings account if
 * one is somehow missing, and tells the member their payment reference — which
 * is the piece of information they need before they can contribute anything.
 */
export interface CreatedMember {
  memberId: string;
  memberNumber: string;
  paymentReference: string;
  /// Shown to the administrator ONCE so they can hand it over. Never stored in
  /// readable form and never retrievable again — only its hash is kept.
  temporaryPassword: string;
}

/**
 * Generates a temporary password.
 *
 * Deliberately not left to the administrator. Someone enrolling twenty members
 * at a desk will reuse one password across all of them, and an administrator
 * who chooses a member's password knows that member's password — which is
 * exactly the ambiguity you do not want when a withdrawal is later disputed.
 * `mustChangePassword` forces it to be replaced at first sign-in.
 *
 * Ambiguous characters are excluded because this gets read aloud or copied off
 * a screen onto paper.
 */
function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let password = "";
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  // A symbol and a digit guarantee the strength rules are met regardless of
  // which characters the random draw produced.
  return `${password}#7`;
}

/**
 * Turns the two `data:` URLs a member form may carry into bytes worth storing.
 *
 * Both are optional at the desk, unlike on the public form: an administrator
 * transcribing a paper application has the application, not the applicant's
 * face. An absent photograph leaves whatever is already on file alone; it is
 * not a way to delete one. Removing a photograph is its own action, on the
 * card screen, where it asks first.
 *
 * The bytes are re-identified from their own magic numbers. What the browser
 * called them was a claim, and a claim from the client side of a form is worth
 * exactly nothing.
 */
async function vetPhotos(input: {
  photo?: string;
  successorPhoto?: string;
}): Promise<
  | { ok: true; member: AcceptedPhoto | null; successor: AcceptedPhoto | null }
  | { ok: false; field: string; message: string }
> {
  let member: AcceptedPhoto | null = null;
  let successor: AcceptedPhoto | null = null;

  if (input.photo) {
    const vetted = acceptPhotoDataUrl(input.photo);
    if (!vetted.ok) return { ok: false, field: "photo", message: vetted.message };
    member = vetted.photo;
  }

  if (input.successorPhoto) {
    const vetted = acceptPhotoDataUrl(input.successorPhoto);
    if (!vetted.ok) {
      return { ok: false, field: "successorPhoto", message: vetted.message };
    }
    successor = vetted.photo;
  }

  return { ok: true, member, successor };
}

/**
 * Enrols a member on an administrator's authority.
 *
 * The counterpart to self-registration, and it shares that path's mechanics on
 * purpose: the same atomic sequence claim for the member number and payment
 * reference, the same savings account opened at zero, the same uniqueness
 * checks. What differs is who vouches. A self-registered applicant waits for
 * approval; here an administrator is transcribing a completed application and
 * saying it is good, so the member can be ACTIVE from the outset — and that
 * decision is recorded against their name.
 *
 * Money never arrives with the member. The savings account opens at zero and
 * can only be moved by the ledger, so enrolling somebody is not a way to
 * create a balance.
 */
export async function createMember(params: {
  input: CreateMemberInput;
  associationId: string;
  actorId: string;
}): Promise<{ ok: true; member: CreatedMember } | { ok: false; field: string; message: string }> {
  const { input, associationId, actorId } = params;

  // Uniqueness is checked here for a usable error message and enforced again
  // by the database constraints — this read cannot be atomic with the write.
  const [existingPhone, existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
    input.email
      ? prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (existingPhone) {
    return {
      ok: false,
      field: "phone",
      message: "An account with this phone number already exists",
    };
  }
  if (existingEmail) {
    return {
      ok: false,
      field: "email",
      message: "An account with this email address already exists",
    };
  }

  if (input.nationalId) {
    const duplicate = await prisma.member.findFirst({
      where: { associationId, nationalId: input.nationalId },
      select: { memberNumber: true },
    });
    if (duplicate) {
      return {
        ok: false,
        field: "nationalId",
        message: `This national ID already belongs to member ${duplicate.memberNumber}`,
      };
    }
  }

  // Vetted before the transaction opens, so a photograph that turns out not to
  // be one is reported without first creating and rolling back a user, a
  // member, a number and a savings account.
  const photos = await vetPhotos(input);
  if (!photos.ok) return photos;

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const active = input.status === "ACTIVE";
  const now = new Date();

  // Annotated rather than inlined: Prisma does not infer an enum through a
  // nested `create`, so a bare ternary there widens to `string` and is
  // rejected.
  const userStatus: UserStatus = active ? "ACTIVE" : "PENDING_VERIFICATION";

  const created = await prisma.$transaction(async (tx) => {
    const association = await tx.association.findUniqueOrThrow({
      where: { id: associationId },
      select: { id: true, code: true, currency: true },
    });

    // Atomic counter claim. Counting existing members would race: two
    // administrators enrolling at once would compute the same next number.
    const counter = await tx.association.update({
      where: { id: associationId },
      data: { memberRefSequence: { increment: 1 } },
      select: { memberRefSequence: true },
    });

    const sequence = String(counter.memberRefSequence).padStart(6, "0");
    const memberNumber = `${association.code}-M${sequence}`;
    const paymentReference = `${association.code}-${sequence}`;

    // The User is the root of the write, with the Member nested inside it —
    // the same shape self-registration uses. Creating the Member first is not
    // possible: `Member.userId` is a required scalar, so supplying it puts
    // Prisma into its "unchecked" input variant, which forbids nesting the
    // user relation that would provide it.
    const user = await tx.user.create({
      data: {
        associationId,
        email: input.email ?? null,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        // Usually blank at the desk; an office is normally awarded later.
        title: input.title ?? null,
        passwordHash,
        role: "MEMBER",
        status: userStatus,
        // The administrator has seen this password. It stops being a shared
        // secret the moment the member signs in.
        mustChangePassword: true,
        createdById: actorId,
        // The member's own photograph is their card photograph — one face, one
        // row, rather than a copy that drifts from the one the card prints.
        ...(photos.member ? { avatar: { create: photos.member } } : {}),
        member: {
          create: {
            associationId,
            memberNumber,
            paymentReference,
            status: active ? "ACTIVE" : "PENDING_APPROVAL",
            kycStatus: input.nationalId ? "PENDING" : "UNVERIFIED",
            nationalId: input.nationalId ?? null,
            dateOfBirth: input.dateOfBirth ?? null,
            gender: input.gender ?? null,
            occupation: input.occupation ?? null,
            businessName: input.businessName ?? null,
            addressLine1: input.addressLine1 ?? null,
            city: input.city ?? null,
            district: input.district ?? null,
            province: input.province ?? null,
            mobileMoneyNumber: input.mobileMoneyNumber ?? null,
            bankAccountNumber: input.bankAccountNumber ?? null,
            nextOfKinName: input.nextOfKinName ?? null,
            nextOfKinPhone: input.nextOfKinPhone ?? null,
            nextOfKinRelation: input.nextOfKinRelation ?? null,
            successorName: input.successorName ?? null,
            successorPhone: input.successorPhone ?? null,
            successorRelation: input.successorRelation ?? null,
            successorNationalId: input.successorNationalId ?? null,
            sharesSubscribed: input.sharesSubscribed ?? null,
            hasCompany: input.hasCompany ?? null,
            hasProfessionalCertificate: input.hasProfessionalCertificate ?? null,
            acceptsInterns: input.acceptsInterns ?? null,
            internCapacity: input.internCapacity ?? null,
            ...(photos.successor
              ? { successorPhoto: { create: photos.successor } }
              : {}),
            joinedAt: active ? now : null,
            approvedAt: active ? now : null,
            approvedById: active ? actorId : null,
            savingsAccounts: {
              create: {
                associationId,
                accountNumber: `${association.code}-SA-${sequence}`,
                currency: association.currency,
                // Opens at zero. Money only ever enters through the ledger.
                balance: "0",
              },
            },
          },
        },
      },
      select: { id: true, member: { select: { id: true } } },
    });

    const member = { id: user.member!.id, userId: user.id };

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_REGISTERED,
        entityType: "Member",
        entityId: member.id,
        associationId,
        newValue: {
          memberNumber,
          paymentReference,
          fullName: `${input.firstName} ${input.lastName}`,
          phone: input.phone,
          email: input.email ?? null,
          status: active ? "ACTIVE" : "PENDING_APPROVAL",
        },
        reason: input.note ?? null,
        metadata: { source: "admin_enrolment" },
        severity: "NOTICE",
      },
      { id: actorId },
      tx
    );

    return { memberId: member.id, userId: member.userId, memberNumber, paymentReference };
  });

  if (active) {
    // Best-effort: the member exists whether or not the message gets through.
    void notify({
      userId: created.userId,
      event: NOTIFICATION_EVENTS.MEMBER_APPROVED,
      context: { paymentReference: created.paymentReference },
      entityType: "Member",
      entityId: created.memberId,
    });
  }

  return {
    ok: true,
    member: {
      memberId: created.memberId,
      memberNumber: created.memberNumber,
      paymentReference: created.paymentReference,
      temporaryPassword,
    },
  };
}

/**
 * Opens a member account for a user who already exists — in practice, a member
 * of staff.
 *
 * WHY THIS IS SEPARATE FROM `createMember`. That function's unit of work is a
 * User with a Member nested inside it: it always makes a new login, complete
 * with a temporary password. An administrator already has a login, and giving
 * them a second one would split their identity in two — two sign-ins, two
 * password histories, two sets of sessions, and an audit trail that cannot say
 * whether the person who approved a loan is the person who took one.
 *
 * The association is taken from the user's own record and never from a
 * parameter, so this cannot enrol somebody into a tenant they do not belong
 * to. Everything else — the sequence claim, the account numbering, the opening
 * balance of zero — matches `createMember` exactly, because a member enrolled
 * this way must be indistinguishable from any other in the ledger.
 */
export async function enrolExistingUserAsMember(
  userId: string,
  actorId: string
): Promise<
  | { ok: true; memberId: string; memberNumber: string; paymentReference: string }
  | { ok: false; message: string }
> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      associationId: true,
      member: { select: { id: true } },
    },
  });

  if (!user) return { ok: false, message: "No such user" };

  if (user.member) {
    return { ok: false, message: "This account already has a member record" };
  }

  if (!user.associationId) {
    // A platform-level super admin belongs to no association, so there is no
    // register to enrol them into and no ledger their savings would sit in.
    return {
      ok: false,
      message: "This account is not attached to an association",
    };
  }

  const associationId = user.associationId;
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const association = await tx.association.findUniqueOrThrow({
      where: { id: associationId },
      select: { code: true, currency: true },
    });

    // Same atomic counter claim as `createMember`: counting rows would race
    // two simultaneous enrolments onto one number.
    const counter = await tx.association.update({
      where: { id: associationId },
      data: { memberRefSequence: { increment: 1 } },
      select: { memberRefSequence: true },
    });

    const sequence = String(counter.memberRefSequence).padStart(6, "0");
    const memberNumber = `${association.code}-M${sequence}`;
    const paymentReference = `${association.code}-${sequence}`;

    const member = await tx.member.create({
      data: {
        associationId,
        userId,
        memberNumber,
        paymentReference,
        // Active immediately. The approval step exists to admit a stranger who
        // applied from the public site; this person is already staff of the
        // association, vouched for by whoever appointed them.
        status: "ACTIVE",
        joinedAt: now,
        approvedAt: now,
        approvedById: actorId,
        savingsAccounts: {
          create: {
            associationId,
            accountNumber: `${association.code}-SA-${sequence}`,
            currency: association.currency,
            // Opens at zero. Money only ever enters through the ledger.
            balance: "0",
          },
        },
      },
      select: { id: true },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_REGISTERED,
        entityType: "Member",
        entityId: member.id,
        associationId,
        newValue: {
          memberNumber,
          paymentReference,
          fullName: `${user.firstName} ${user.lastName}`,
          phone: user.phone,
          email: user.email,
          status: "ACTIVE",
        },
        // Named distinctly from "admin_enrolment" so that a later reviewer can
        // pick out every staff member who opened an account for themselves.
        metadata: { source: "staff_self_enrolment", userId, actorId },
        severity: "NOTICE",
      },
      { id: actorId },
      tx
    );

    return { memberId: member.id, memberNumber, paymentReference };
  });

  return { ok: true, ...created };
}

/**
 * Fields an administrator may edit, in the shape the audit diff records them.
 * Kept as one flat list so the "before" snapshot and the diff cannot drift.
 */
const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "phone",
  "email",
  "nationalId",
  "dateOfBirth",
  "gender",
  "occupation",
  "businessName",
  "addressLine1",
  "city",
  "district",
  "province",
  "mobileMoneyNumber",
  "bankAccountNumber",
  "nextOfKinName",
  "nextOfKinPhone",
  "nextOfKinRelation",
  "successorName",
  "successorPhone",
  "successorRelation",
  "successorNationalId",
  "sharesSubscribed",
  "hasCompany",
  "hasProfessionalCertificate",
  "acceptsInterns",
  "internCapacity",
] as const;

type EditableSnapshot = Record<(typeof EDITABLE_FIELDS)[number], unknown>;

type SnapshotSource = Prisma.MemberGetPayload<{
  include: {
    user: {
      select: { firstName: true; lastName: true; title: true; phone: true; email: true };
    };
  };
}>;

/** The editable fields as they stand on the file right now. */
function snapshotOf(member: SnapshotSource): EditableSnapshot {
  return {
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    title: member.user.title,
    phone: member.user.phone,
    email: member.user.email,
    nationalId: member.nationalId,
    dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: member.gender,
    occupation: member.occupation,
    businessName: member.businessName,
    addressLine1: member.addressLine1,
    city: member.city,
    district: member.district,
    province: member.province,
    mobileMoneyNumber: member.mobileMoneyNumber,
    bankAccountNumber: member.bankAccountNumber,
    nextOfKinName: member.nextOfKinName,
    nextOfKinPhone: member.nextOfKinPhone,
    nextOfKinRelation: member.nextOfKinRelation,
    successorName: member.successorName,
    successorPhone: member.successorPhone,
    successorRelation: member.successorRelation,
    successorNationalId: member.successorNationalId,
    sharesSubscribed: member.sharesSubscribed,
    hasCompany: member.hasCompany,
    hasProfessionalCertificate: member.hasProfessionalCertificate,
    acceptsInterns: member.acceptsInterns,
    internCapacity: member.internCapacity,
  };
}

/**
 * Updates a member's file.
 *
 * WHAT THIS DOES NOT TOUCH, AND WHY:
 *
 *   • Membership status. Approval, suspension and reactivation each carry
 *     their own permission and their own mandatory reason. A profile edit that
 *     could also flip a suspended member back to active would bypass all of
 *     that.
 *
 *   • Member number and payment reference. They are printed on every payment
 *     instruction the member has ever been given; changing one orphans the
 *     payments already matched by it.
 *
 * PHONE AND MOBILE MONEY ARE NOT ORDINARY FIELDS. Both are payment-matching
 * keys, so editing them changes who future payments are attributed to. The
 * audit entry records the before and after values for exactly that reason —
 * if money later lands in the wrong account, the change that caused it is
 * findable.
 */
export async function updateMember(params: {
  memberId: string;
  input: UpdateMemberInput;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; field: string; message: string }> {
  const { memberId, input, actorId } = params;

  const existing = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          title: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false, field: "_", message: "Member not found" };
  }

  // Uniqueness, excluding this member's own user. Checked here for a usable
  // message and enforced again by the database constraints.
  const [phoneOwner, emailOwner] = await Promise.all([
    prisma.user.findFirst({
      where: { phone: input.phone, id: { not: existing.userId } },
      select: { id: true },
    }),
    input.email
      ? prisma.user.findFirst({
          where: { email: input.email, id: { not: existing.userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (phoneOwner) {
    return {
      ok: false,
      field: "phone",
      message: "Another account already uses this phone number",
    };
  }
  if (emailOwner) {
    return {
      ok: false,
      field: "email",
      message: "Another account already uses this email address",
    };
  }

  if (input.nationalId && input.nationalId !== existing.nationalId) {
    const duplicate = await prisma.member.findFirst({
      where: {
        associationId: existing.associationId,
        nationalId: input.nationalId,
        id: { not: memberId },
      },
      select: { memberNumber: true },
    });
    if (duplicate) {
      return {
        ok: false,
        field: "nationalId",
        message: `This national ID already belongs to member ${duplicate.memberNumber}`,
      };
    }
  }

  const before = snapshotOf(existing);

  const after: EditableSnapshot = {
    firstName: input.firstName,
    lastName: input.lastName,
    title: input.title ?? null,
    phone: input.phone,
    email: input.email ?? null,
    nationalId: input.nationalId ?? null,
    dateOfBirth: input.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: input.gender ?? null,
    occupation: input.occupation ?? null,
    businessName: input.businessName ?? null,
    addressLine1: input.addressLine1 ?? null,
    city: input.city ?? null,
    district: input.district ?? null,
    province: input.province ?? null,
    mobileMoneyNumber: input.mobileMoneyNumber ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    nextOfKinName: input.nextOfKinName ?? null,
    nextOfKinPhone: input.nextOfKinPhone ?? null,
    nextOfKinRelation: input.nextOfKinRelation ?? null,
    successorName: input.successorName ?? null,
    successorPhone: input.successorPhone ?? null,
    successorRelation: input.successorRelation ?? null,
    successorNationalId: input.successorNationalId ?? null,
    sharesSubscribed: input.sharesSubscribed ?? null,
    hasCompany: input.hasCompany ?? null,
    hasProfessionalCertificate: input.hasProfessionalCertificate ?? null,
    acceptsInterns: input.acceptsInterns ?? null,
    internCapacity: input.internCapacity ?? null,
  };

  const photos = await vetPhotos(input);
  if (!photos.ok) return photos;

  const { oldValue, newValue } = diffFields(before, after, [...EDITABLE_FIELDS]);

  // Nothing changed: writing an audit row saying so is noise in a log that
  // people have to read. A new photograph counts as a change even though it is
  // not a diffable field — the bytes are not put in the audit entry, so the
  // field list cannot see them.
  const replacingPhoto = Boolean(photos.member || photos.successor);
  if (Object.keys(newValue).length === 0 && !replacingPhoto) return { ok: true };

  // Recording a national ID where there was none puts identity back in the
  // queue to be checked; it has not been verified merely by being typed in.
  const kycStatus =
    input.nationalId && input.nationalId !== existing.nationalId && existing.kycStatus !== "VERIFIED"
      ? ("PENDING" as const)
      : existing.kycStatus;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        // Cleared rather than left behind when emptied: someone who stops
        // being treasurer should stop printing cards that say so.
        title: input.title ?? null,
        phone: input.phone,
        email: input.email ?? null,
      },
    });

    await tx.member.update({
      where: { id: memberId },
      data: {
        nationalId: input.nationalId ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        occupation: input.occupation ?? null,
        businessName: input.businessName ?? null,
        addressLine1: input.addressLine1 ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        province: input.province ?? null,
        mobileMoneyNumber: input.mobileMoneyNumber ?? null,
        bankAccountNumber: input.bankAccountNumber ?? null,
        nextOfKinName: input.nextOfKinName ?? null,
        nextOfKinPhone: input.nextOfKinPhone ?? null,
        nextOfKinRelation: input.nextOfKinRelation ?? null,
        successorName: input.successorName ?? null,
        successorPhone: input.successorPhone ?? null,
        successorRelation: input.successorRelation ?? null,
        successorNationalId: input.successorNationalId ?? null,
        sharesSubscribed: input.sharesSubscribed ?? null,
        hasCompany: input.hasCompany ?? null,
        hasProfessionalCertificate: input.hasProfessionalCertificate ?? null,
        acceptsInterns: input.acceptsInterns ?? null,
        internCapacity: input.internCapacity ?? null,
        kycStatus,
      },
    });

    // Replaced only when a new one was sent. A form submitted without a
    // photograph field is an edit to the rest of the file, not an instruction
    // to delete the face on it.
    if (photos.member) {
      await tx.userAvatar.upsert({
        where: { userId: existing.userId },
        create: { userId: existing.userId, ...photos.member },
        update: photos.member,
      });
    }
    if (photos.successor) {
      await tx.memberSuccessorPhoto.upsert({
        where: { memberId },
        create: { memberId, ...photos.successor },
        update: photos.successor,
      });
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_UPDATED,
        entityType: "Member",
        entityId: memberId,
        associationId: existing.associationId,
        oldValue,
        newValue,
        reason: input.note ?? null,
        // A changed matching key decides where future money goes, so it is
        // worth more than a routine edit when someone scans the log.
        severity:
          "phone" in newValue || "mobileMoneyNumber" in newValue || "bankAccountNumber" in newValue
            ? "WARNING"
            : "INFO",
      },
      { id: actorId },
      tx
    );
  });

  return { ok: true };
}

export async function approveMember(params: {
  memberId: string;
  actorId: string;
  note?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      status: true,
      associationId: true,
      memberNumber: true,
      paymentReference: true,
      userId: true,
      savingsAccounts: { select: { id: true } },
      association: { select: { code: true, currency: true } },
    },
  });

  if (!member) return { ok: false, message: "Member not found" };

  if (member.status !== "PENDING_APPROVAL") {
    return {
      ok: false,
      message: `This member is already ${member.status.toLowerCase().replace(/_/g, " ")}`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedById: params.actorId,
        joinedAt: new Date(),
      },
    });

    // Without this the member is approved but still cannot sign in.
    await tx.user.update({
      where: { id: member.userId },
      data: { status: "ACTIVE" },
    });

    if (member.savingsAccounts.length === 0) {
      const sequence = member.paymentReference.split("-").pop() ?? "000000";
      await tx.savingsAccount.create({
        data: {
          associationId: member.associationId,
          memberId: member.id,
          accountNumber: `${member.association.code}-SA-${sequence}`,
          currency: member.association.currency,
          balance: "0",
        },
      });
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_APPROVED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { status: "PENDING_APPROVAL" },
        newValue: { status: "ACTIVE", memberNumber: member.memberNumber },
        reason: params.note ?? null,
        severity: "NOTICE",
      },
      { id: params.actorId },
      tx
    );
  });

  void notify({
    userId: member.userId,
    event: NOTIFICATION_EVENTS.MEMBER_APPROVED,
    context: { paymentReference: member.paymentReference },
    entityType: "Member",
    entityId: member.id,
  });

  return { ok: true };
}

/** Declines a pending membership. Requires a reason. */
export async function rejectMember(params: {
  memberId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!params.reason?.trim()) {
    return { ok: false, message: "A reason is required" };
  }

  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { id: true, status: true, associationId: true, userId: true },
  });

  if (!member) return { ok: false, message: "Member not found" };
  if (member.status !== "PENDING_APPROVAL") {
    return { ok: false, message: "Only a pending application can be declined" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: { status: "REJECTED", suspensionReason: params.reason },
    });

    await tx.user.update({
      where: { id: member.userId },
      data: { status: "DISABLED" },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_REJECTED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        newValue: { status: "REJECTED" },
        reason: params.reason,
        severity: "NOTICE",
      },
      { id: params.actorId },
      tx
    );
  });

  void notify({
    userId: member.userId,
    event: NOTIFICATION_EVENTS.MEMBER_REJECTED,
    context: { reason: params.reason },
    channels: ["IN_APP", "EMAIL"],
  });

  return { ok: true };
}

const REACTIVATABLE_STATUSES: ReadonlySet<MemberStatus> = new Set<MemberStatus>([
  "SUSPENDED",
  "INACTIVE",
  "EXITED",
]);

/**
 * Suspends or reactivates a member.
 *
 * Suspension revokes every live session immediately — a suspended member must
 * lose access now, not when their cookie happens to expire. Their savings are
 * untouched: suspension restricts access, it does not confiscate money.
 */
export async function setMemberSuspension(params: {
  memberId: string;
  suspend: boolean;
  actorId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (params.suspend && !params.reason?.trim()) {
    return { ok: false, message: "A reason is required to suspend a member" };
  }

  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      status: true,
      associationId: true,
      userId: true,
      user: { select: { role: true } },
    },
  });

  if (!member) return { ok: false, message: "Member not found" };

  // Suspending a closed membership would put a departed member back on the
  // arrears list, which counts SUSPENDED members as owing; "reactivating" a
  // pending applicant would admit them without approval and without the
  // savings account approval opens. Both are refused rather than performed.
  if (params.suspend && member.status !== "ACTIVE" && member.status !== "INACTIVE") {
    return { ok: false, message: "Only an active member can be suspended" };
  }
  if (!params.suspend && !REACTIVATABLE_STATUSES.has(member.status)) {
    return {
      ok: false,
      message: "Only a suspended, inactive or closed membership can be reactivated",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: params.suspend ? "SUSPENDED" : "ACTIVE",
        suspendedAt: params.suspend ? new Date() : null,
        suspensionReason: params.suspend ? params.reason : null,
        // Reopening a closed membership: it is no longer closed.
        ...(params.suspend ? {} : { exitedAt: null }),
      },
    });

    // Only a plain member's login follows their membership. A member of
    // staff's sign-in is suspended and restored under `admins.suspend`;
    // letting `members.suspend` do it too would bypass that grant in both
    // directions.
    const followsMembership = member.user.role === "MEMBER";

    if (followsMembership) {
      await tx.user.update({
        where: { id: member.userId },
        data: { status: params.suspend ? "SUSPENDED" : "ACTIVE" },
      });
    }

    if (params.suspend && followsMembership) {
      await tx.session.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "MEMBER_SUSPENDED" },
      });
    }

    await recordAudit(
      {
        action: params.suspend
          ? AUDIT_ACTIONS.MEMBER_SUSPENDED
          : AUDIT_ACTIONS.MEMBER_REACTIVATED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { status: member.status },
        newValue: { status: params.suspend ? "SUSPENDED" : "ACTIVE" },
        reason: params.reason,
        severity: params.suspend ? "WARNING" : "NOTICE",
      },
      { id: params.actorId },
      tx
    );
  });

  if (params.suspend) {
    void notify({
      userId: member.userId,
      event: NOTIFICATION_EVENTS.MEMBER_SUSPENDED,
      context: { reason: params.reason },
      channels: ["IN_APP", "EMAIL"],
    });
  }

  return { ok: true };
}

/**
 * Records the outcome of an identity check.
 *
 * Verifying needs a national ID on file: an identity is checked against a
 * number, and "verified" with nothing to have verified it against is a claim
 * nobody can later test. Failing a check needs a reason, because the member
 * will ask what was wrong.
 */
export async function setMemberKyc(params: {
  memberId: string;
  actorId: string;
  verified: boolean;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const reason = params.reason?.trim() || null;

  if (!params.verified && !reason) {
    return { ok: false, message: "A reason is required to fail an identity check" };
  }

  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { id: true, associationId: true, kycStatus: true, nationalId: true },
  });

  if (!member) return { ok: false, message: "Member not found" };

  if (params.verified && !member.nationalId) {
    return {
      ok: false,
      message: "Record the member's national ID before verifying their identity",
    };
  }

  const next = params.verified ? ("VERIFIED" as const) : ("REJECTED" as const);
  if (member.kycStatus === next) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: { kycStatus: next },
    });

    await recordAudit(
      {
        action: params.verified
          ? AUDIT_ACTIONS.MEMBER_KYC_VERIFIED
          : AUDIT_ACTIONS.MEMBER_KYC_REJECTED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { kycStatus: member.kycStatus },
        // The number that was checked, so "verified against what" has an
        // answer after the ID on file is later edited.
        newValue: { kycStatus: next, nationalId: member.nationalId },
        reason,
        severity: "NOTICE",
      },
      { id: params.actorId },
      tx
    );
  });

  return { ok: true };
}

/**
 * Adds an administrator's note to a member's file.
 *
 * Always internal. The note carries its own author and time, and notes are
 * never edited or removed, so it is its own record and is not duplicated into
 * the audit log.
 */
export async function addMemberNote(params: {
  memberId: string;
  actorId: string;
  body: string;
}): Promise<void> {
  await prisma.memberNote.create({
    data: {
      memberId: params.memberId,
      authorId: params.actorId,
      body: params.body.trim(),
      isInternal: true,
    },
  });
}

/**
 * Closes a membership: the way somebody with a financial history leaves the
 * register.
 *
 * Nothing is erased. Their savings rows, loans and fines stay exactly where
 * they are, because the association's own balance is built from them. What
 * changes is that the member stops being one: they are no longer counted as
 * owing the daily contribution — the arrears list, the fines and the service
 * fee all skip a closed membership — and a plain member's login is disabled
 * and signed out everywhere.
 *
 * A member of staff who also saves keeps their sign-in. Closing their savings
 * file is not the same decision as removing them from the office.
 *
 * Money left on the file is not settled here. A balance still held, or a loan
 * still owed, is recorded on the audit entry so that whoever closed the
 * membership is on record as having seen it. Paying out or collecting is done
 * through withdrawals and repayments, like any other money.
 *
 * Reversible: reactivating a closed membership reopens it.
 */
export async function closeMembership(params: {
  memberId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const reason = params.reason?.trim();
  if (!reason) {
    return { ok: false, message: "A reason is required to close a membership" };
  }

  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      status: true,
      associationId: true,
      userId: true,
      user: { select: { role: true } },
      savingsAccounts: { select: { balance: true } },
      loans: {
        where: { status: { in: ["ACTIVE", "DISBURSED", "OVERDUE"] } },
        select: { totalPayable: true, totalPaid: true },
      },
    },
  });

  if (!member) return { ok: false, message: "Member not found" };

  if (member.userId === params.actorId) {
    return {
      ok: false,
      message: "You cannot close your own membership. Another administrator must do it.",
    };
  }

  if (!CLOSABLE_STATUSES.has(member.status)) {
    return {
      ok: false,
      message:
        member.status === "PENDING_APPROVAL"
          ? "A pending application is declined, not closed"
          : `This membership is already ${member.status.toLowerCase().replace(/_/g, " ")}`,
    };
  }

  const disableLogin = member.user.role === "MEMBER";
  const savingsBalance = member.savingsAccounts.reduce(
    (sum, account) => add(sum, account.balance),
    add(0)
  );
  const loansOutstanding = member.loans.reduce(
    (sum, loan) => add(sum, subtract(loan.totalPayable, loan.totalPaid)),
    add(0)
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: "EXITED",
        exitedAt: now,
        // A suspension that ends in a closure is over; the file must not go on
        // saying "Suspended" underneath "Closed".
        suspendedAt: null,
        suspensionReason: null,
      },
    });

    if (disableLogin) {
      await tx.user.update({
        where: { id: member.userId },
        data: { status: "DISABLED" },
      });

      await tx.session.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "MEMBERSHIP_CLOSED" },
      });
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_EXITED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { status: member.status },
        newValue: { status: "EXITED" },
        reason,
        metadata: {
          savingsBalance: toMoneyString(savingsBalance),
          loansOutstanding: toMoneyString(loansOutstanding),
          loginDisabled: disableLogin,
        },
        severity: "WARNING",
      },
      { id: params.actorId },
      tx
    );
  });

  return { ok: true };
}

/**
 * Loads a member with the counts that decide whether they can be erased.
 *
 * Shared by the member file, which shows the answer, and by `deleteMember`,
 * which acts on it, so the button on the screen and the refusal from the
 * server are always drawing on the same facts.
 */
async function loadForRemoval(memberId: string) {
  return prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          firstName: true,
          lastName: true,
          title: true,
          phone: true,
          email: true,
          // MemberNote.author is Restrict: a login that wrote notes on other
          // files cannot be removed without first removing what it wrote.
          _count: { select: { memberNotes: true } },
        },
      },
      savingsAccounts: {
        select: { id: true, accountNumber: true, balance: true, lockedBalance: true },
      },
      _count: {
        select: {
          transactions: true,
          withdrawals: true,
          loanApplications: true,
          loans: true,
          payments: true,
          bkTransactions: true,
          bkPaymentClaims: true,
          contributionFines: true,
          warehouseCreditFines: true,
          platformFeeCharges: true,
          interestDistributions: true,
          warehouseIssuances: true,
          warehouseCredits: true,
          guarantorFor: { where: { status: { in: ["PENDING", "ACCEPTED"] } } },
        },
      },
    },
  });
}

type RemovalRecord = NonNullable<Awaited<ReturnType<typeof loadForRemoval>>>;

function historyOf(member: RemovalRecord): MemberHistory {
  const counts = member._count;
  return {
    savingsTransactions: counts.transactions,
    // Absolute values, so a negative cache on one account cannot cancel a
    // positive one on another and read as zero.
    savingsBalance: member.savingsAccounts.reduce(
      (sum, account) => add(sum, abs(account.balance), abs(account.lockedBalance)),
      add(0)
    ),
    withdrawals: counts.withdrawals,
    loanApplications: counts.loanApplications,
    loans: counts.loans,
    payments: counts.payments + counts.bkTransactions + counts.bkPaymentClaims,
    fines: counts.contributionFines + counts.warehouseCreditFines,
    serviceFees: counts.platformFeeCharges,
    interestShares: counts.interestDistributions,
    warehouse: counts.warehouseIssuances + counts.warehouseCredits,
    guarantees: counts.guarantorFor,
  };
}

/**
 * What stands between this member and deletion, for the member file to show.
 * Null when there is no such member.
 */
export async function getMemberRemovalBlockers(
  memberId: string
): Promise<BlockerCount[] | null> {
  const member = await loadForRemoval(memberId);
  return member ? removalBlockers(historyOf(member)) : null;
}

/**
 * Permanently erases a member who never held money.
 *
 * For an application made in error or a record typed in twice — nothing else.
 * Anyone with a financial history is refused and must be closed instead; see
 * lib/member-removal.ts for what counts, and why the schema would refuse it
 * too.
 *
 * WHAT GOES: the member, their (empty) savings account, their notes and
 * successor photograph, and — for a plain member — their login, along with its
 * sessions, sign-in codes, photograph and notifications.
 *
 * WHAT STAYS: a member of staff's login. Somebody who runs the office and also
 * saves loses the savings file, not their job. The audit log also stays, and
 * gains a full copy of the file, because afterwards it is the only place the
 * member exists.
 */
export async function deleteMember(params: {
  memberId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const reason = params.reason?.trim();
  if (!reason) {
    return { ok: false, message: "A reason is required to delete a member" };
  }

  const member = await loadForRemoval(params.memberId);
  if (!member) return { ok: false, message: "Member not found" };

  if (member.userId === params.actorId) {
    return {
      ok: false,
      message: "You cannot delete your own member record. Another administrator must do it.",
    };
  }

  const blockers = removalBlockers(historyOf(member));
  if (blockers.length > 0) {
    return {
      ok: false,
      message:
        `This member has financial history (${blockers.map((b) => b.key).join(", ")}) ` +
        `and cannot be deleted. Close the membership instead: every record is kept ` +
        `and their login is disabled.`,
    };
  }

  const isPlainMember = member.user.role === "MEMBER";
  // A plain member's login goes with the record — unless it authored notes,
  // which pin it in place. Then it is disabled instead, which leaves it unable
  // to sign in just the same.
  const eraseLogin = isPlainMember && member.user._count.memberNotes === 0;

  await prisma.$transaction(async (tx) => {
    // Written first, inside the same transaction: if the delete fails the
    // entry goes with it, and if the entry cannot be written nothing is erased.
    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBER_DELETED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: {
          memberNumber: member.memberNumber,
          paymentReference: member.paymentReference,
          status: member.status,
          kycStatus: member.kycStatus,
          savingsAccounts: member.savingsAccounts.map((a) => a.accountNumber),
          joinedAt: member.joinedAt?.toISOString() ?? null,
          approvedAt: member.approvedAt?.toISOString() ?? null,
          appliedAt: member.createdAt.toISOString(),
          ...snapshotOf(member),
        },
        reason,
        metadata: {
          userId: member.userId,
          role: member.user.role,
          login: eraseLogin ? "erased" : isPlainMember ? "disabled" : "kept",
        },
        severity: "CRITICAL",
      },
      { id: params.actorId },
      tx
    );

    // The account points at the member with Restrict, so it goes first. It
    // is empty — nothing above lets a funded one get this far — and the
    // Restrict on its own transactions is the backstop if that ever changes.
    await tx.savingsAccount.deleteMany({ where: { memberId: member.id } });

    // Notes, documents, the successor's photograph and the contribution
    // standing cascade with the member.
    await tx.member.delete({ where: { id: member.id } });

    if (eraseLogin) {
      await tx.user.delete({ where: { id: member.userId } });
    } else if (isPlainMember) {
      await tx.user.update({
        where: { id: member.userId },
        data: { status: "DISABLED" },
      });
      await tx.session.updateMany({
        where: { userId: member.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "MEMBER_DELETED" },
      });
    }
  });

  return { ok: true };
}

/**
 * Applies one decision to one member.
 *
 * The single place an action's name is turned into the service that carries
 * it out, so a member suspended from their file and one suspended in a batch
 * from the register go through exactly the same checks and leave the same
 * audit entry.
 */
export async function applyMemberAction(params: {
  action: MemberAction;
  memberId: string;
  actorId: string;
  reason?: string;
  note?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { action, memberId, actorId } = params;
  const reason = params.reason?.trim() ?? "";

  switch (action) {
    case "approve":
      return approveMember({ memberId, actorId, note: params.note });
    case "reject":
      return rejectMember({ memberId, actorId, reason });
    case "suspend":
      return setMemberSuspension({ memberId, suspend: true, actorId, reason });
    case "reactivate":
      return setMemberSuspension({
        memberId,
        suspend: false,
        actorId,
        reason: reason || "Reactivated by administrator",
      });
    case "close":
      return closeMembership({ memberId, actorId, reason });
    case "verify_kyc":
      return setMemberKyc({ memberId, actorId, verified: true });
    case "reject_kyc":
      return setMemberKyc({ memberId, actorId, verified: false, reason });
    case "delete":
      return deleteMember({ memberId, actorId, reason });
  }
}

/**
 * Applies one decision to several members, from the register.
 *
 * Partial by design, like the bulk payment delete: each member is judged on
 * their own, and one who cannot take the action — already suspended, a ledger
 * behind them that rules out deletion — is reported back by name while the
 * rest go ahead. Failing the whole batch for one member would leave the
 * administrator doing them one at a time anyway.
 *
 * Each member gets their own transaction and their own audit entry through
 * `applyMemberAction`, so a batch reads in the log exactly like the same
 * decisions taken one by one, each carrying the reason given for the batch.
 *
 * Ids outside the caller's association are reported as not found, the same
 * answer as an id that does not exist, so a batch cannot be used to probe
 * another tenant's register.
 */
export async function applyMemberActionToMany(params: {
  action: MemberAction;
  memberIds: string[];
  associationId: string | null;
  actorId: string;
  reason?: string;
}): Promise<BulkMemberResult> {
  const ids = [...new Set(params.memberIds)];

  const members = await prisma.member.findMany({
    where: {
      id: { in: ids },
      ...(params.associationId ? { associationId: params.associationId } : {}),
    },
    select: {
      id: true,
      memberNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  const result: BulkMemberResult = { done: 0, refused: [] };

  // One after another, not in parallel: several of these claim rows other
  // members' actions may also touch, and a batch of a hundred concurrent
  // transactions is how a connection pool runs dry.
  for (const id of ids) {
    const member = byId.get(id);
    if (!member) {
      result.refused.push({ memberId: id, name: null, memberNumber: null, reason: "Member not found" });
      continue;
    }

    const refuse = (reason: string) =>
      result.refused.push({
        memberId: id,
        name: `${member.user.firstName} ${member.user.lastName}`.trim(),
        memberNumber: member.memberNumber,
        reason,
      });

    try {
      const outcome = await applyMemberAction({
        action: params.action,
        memberId: id,
        actorId: params.actorId,
        reason: params.reason,
      });
      if (outcome.ok) result.done += 1;
      else refuse(outcome.message);
    } catch (error) {
      // One member's failure must not abandon the rest of the batch. The
      // detail goes to the log; the screen gets a sentence.
      logger.error(
        { memberId: id, action: params.action, ...serialiseError(error) },
        "bulk member action failed for one member"
      );
      refuse("Could not be completed. Try this member on their own.");
    }
  }

  return result;
}

/** Full financial picture for one member, for the admin member file. */
export async function getMemberProfile(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          // The office printed on the membership card; the edit form needs the
          // current value to show it.
          title: true,
          // Staff who also save keep their login through anything done to
          // the membership, and the management panel says so.
          role: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          // Whether there is a photograph, never the photograph itself. The
          // bytes are the largest thing on the file and the page only needs to
          // know whether to render an <img> pointed at the route that serves
          // them.
          avatar: { select: { updatedAt: true } },
        },
      },
      successorPhoto: { select: { updatedAt: true } },
      savingsAccounts: { where: { isActive: true }, take: 1 },
      loans: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reference: true,
          status: true,
          principal: true,
          totalPayable: true,
          totalPaid: true,
          daysOverdue: true,
          disbursedAt: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          body: true,
          isInternal: true,
          createdAt: true,
          author: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return member;
}
