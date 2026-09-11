import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "@/lib/db/prisma";
import { recordAudit, diffFields, AUDIT_ACTIONS } from "@/lib/audit";
import { notify, NOTIFICATION_EVENTS } from "@/lib/notifications";
import { hashPassword } from "@/lib/auth/password";
import { add, toMoneyString } from "@/lib/money";
import type { CreateMemberInput, UpdateMemberInput } from "@/lib/validation/members";
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
        memberNumber: true,
        paymentReference: true,
        status: true,
        kycStatus: true,
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
        memberNumber: m.memberNumber,
        paymentReference: m.paymentReference,
        fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
        phone: m.user.phone,
        status: m.status,
        kycStatus: m.kycStatus,
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
            sharesSubscribed: input.sharesSubscribed ?? null,
            hasCompany: input.hasCompany ?? null,
            acceptsInterns: input.acceptsInterns ?? null,
            internCapacity: input.internCapacity ?? null,
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
  "sharesSubscribed",
  "hasCompany",
  "acceptsInterns",
  "internCapacity",
] as const;

type EditableSnapshot = Record<(typeof EDITABLE_FIELDS)[number], unknown>;

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

  const before: EditableSnapshot = {
    firstName: existing.user.firstName,
    lastName: existing.user.lastName,
    title: existing.user.title,
    phone: existing.user.phone,
    email: existing.user.email,
    nationalId: existing.nationalId,
    dateOfBirth: existing.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: existing.gender,
    occupation: existing.occupation,
    businessName: existing.businessName,
    addressLine1: existing.addressLine1,
    city: existing.city,
    district: existing.district,
    province: existing.province,
    mobileMoneyNumber: existing.mobileMoneyNumber,
    bankAccountNumber: existing.bankAccountNumber,
    nextOfKinName: existing.nextOfKinName,
    nextOfKinPhone: existing.nextOfKinPhone,
    nextOfKinRelation: existing.nextOfKinRelation,
    successorName: existing.successorName,
    successorPhone: existing.successorPhone,
    successorRelation: existing.successorRelation,
    sharesSubscribed: existing.sharesSubscribed,
    hasCompany: existing.hasCompany,
    acceptsInterns: existing.acceptsInterns,
    internCapacity: existing.internCapacity,
  };

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
    sharesSubscribed: input.sharesSubscribed ?? null,
    hasCompany: input.hasCompany ?? null,
    acceptsInterns: input.acceptsInterns ?? null,
    internCapacity: input.internCapacity ?? null,
  };

  const { oldValue, newValue } = diffFields(before, after, [...EDITABLE_FIELDS]);

  // Nothing changed: writing an audit row saying so is noise in a log that
  // people have to read.
  if (Object.keys(newValue).length === 0) return { ok: true };

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
        sharesSubscribed: input.sharesSubscribed ?? null,
        hasCompany: input.hasCompany ?? null,
        acceptsInterns: input.acceptsInterns ?? null,
        internCapacity: input.internCapacity ?? null,
        kycStatus,
      },
    });

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
    select: { id: true, status: true, associationId: true, userId: true },
  });

  if (!member) return { ok: false, message: "Member not found" };

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: params.suspend ? "SUSPENDED" : "ACTIVE",
        suspendedAt: params.suspend ? new Date() : null,
        suspensionReason: params.suspend ? params.reason : null,
      },
    });

    await tx.user.update({
      where: { id: member.userId },
      data: { status: params.suspend ? "SUSPENDED" : "ACTIVE" },
    });

    if (params.suspend) {
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
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
        },
      },
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
