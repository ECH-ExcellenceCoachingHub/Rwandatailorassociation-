import "server-only";
import { prisma, type Prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { MemberStatus, type UserRole } from "@/lib/generated/prisma/enums";

/**
 * The card register: every member's card, for the office that prints them.
 *
 * ONE QUERY SHAPE FOR THE SCREEN AND THE DOWNLOAD. The page shows cards in
 * batches and the bulk route prints a batch; both build their filter and their
 * order here. If they drifted, "download cards 25–48" would print a different
 * twenty-four people from the ones on screen, and nobody would notice until
 * the cards were being handed out.
 */

/// Cards per screen and per bulk file — the same number on purpose, so a
/// batch on screen is exactly one file. Also a sensible stack to load into a
/// card printer, and small enough that a batch of full-size photographs stays
/// well inside a server's memory.
export const CARD_BATCH_SIZE = 24;

export type PhotoFilter = "missing" | "present";

export interface CardFilters {
  search?: string;
  /// Undefined means every status.
  status?: MemberStatus;
  photo?: PhotoFilter;
}

const STATUSES = new Set<string>(Object.values(MemberStatus));

/// Active members unless the reader asks otherwise. Cards are for people who
/// can use them; printing one for a rejected applicant is never the intent.
export const DEFAULT_CARD_STATUS: MemberStatus = "ACTIVE";

/**
 * Reads the filters from a query string. `status=ALL` is how the screen asks
 * for every status, since leaving `status` out means the default.
 */
export function parseCardFilters(params: Record<string, string | undefined>): CardFilters {
  const status = params.status;
  const photo = params.photo;

  return {
    search: params.q?.trim() || undefined,
    status:
      status === "ALL"
        ? undefined
        : status && STATUSES.has(status)
          ? (status as MemberStatus)
          : DEFAULT_CARD_STATUS,
    photo: photo === "missing" || photo === "present" ? photo : undefined,
  };
}

function cardWhere(
  associationId: string | null,
  filters: CardFilters
): Prisma.MemberWhereInput {
  const search = filters.search;

  return {
    ...(associationId ? { associationId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.photo === "missing"
      ? { user: { avatar: { is: null } } }
      : filters.photo === "present"
        ? { user: { avatar: { isNot: null } } }
        : {}),
    ...(search
      ? {
          OR: [
            { memberNumber: { contains: search, mode: "insensitive" } },
            { paymentReference: { contains: search, mode: "insensitive" } },
            { nationalId: { contains: search } },
            {
              user: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}

/// Family name first, as the card itself reads — so the printed stack comes
/// out in the order someone would look for their card in. The member number
/// breaks ties, which keeps batch boundaries stable between two requests.
const CARD_ORDER: Prisma.MemberOrderByWithRelationInput[] = [
  { user: { lastName: "asc" } },
  { user: { firstName: "asc" } },
  { memberNumber: "asc" },
];

export interface CardRegisterEntry {
  memberId: string;
  memberNumber: string;
  status: MemberStatus;
  /// Whose sign-in code the card carries — enough to look it up or issue it.
  holder: {
    id: string;
    role: UserRole;
    email: string | null;
    associationId: string;
  };
  user: {
    firstName: string;
    lastName: string;
    title: string | null;
    phone: string | null;
  };
  hasPhoto: boolean;
  /// When the office last downloaded this member's front, or null if it never
  /// has. A member printing their own card is not counted: that is not logged.
  lastPrintedAt: Date | null;
}

export async function listCardRegister(params: {
  associationId: string | null;
  filters: CardFilters;
  page: number;
}) {
  const where = cardWhere(params.associationId, params.filters);
  const withoutPhotoFilter = cardWhere(params.associationId, {
    ...params.filters,
    photo: undefined,
  });

  const [total, missingPhotos] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.count({
      where: { AND: [withoutPhotoFilter, { user: { avatar: { is: null } } }] },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / CARD_BATCH_SIZE));
  const page = Math.min(Math.max(1, params.page), totalPages);

  const members = await prisma.member.findMany({
    where,
    orderBy: CARD_ORDER,
    skip: (page - 1) * CARD_BATCH_SIZE,
    take: CARD_BATCH_SIZE,
    select: {
      id: true,
      memberNumber: true,
      status: true,
      associationId: true,
      user: {
        select: {
          id: true,
          role: true,
          email: true,
          firstName: true,
          lastName: true,
          title: true,
          phone: true,
          // Whether a photograph exists, not the photograph: the bytes go to
          // the browser through the photo route, one <image> at a time.
          avatar: { select: { userId: true } },
        },
      },
    },
  });

  const printed = await lastPrintedByOffice(members.map((m) => m.id));

  const cards: CardRegisterEntry[] = members.map((m) => ({
    memberId: m.id,
    memberNumber: m.memberNumber,
    status: m.status,
    holder: {
      id: m.user.id,
      role: m.user.role,
      email: m.user.email,
      associationId: m.associationId,
    },
    user: {
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      title: m.user.title,
      phone: m.user.phone,
    },
    hasPhoto: Boolean(m.user.avatar),
    lastPrintedAt: printed.get(m.id) ?? null,
  }));

  return {
    total,
    missingPhotos,
    page,
    pageSize: CARD_BATCH_SIZE,
    totalPages,
    cards,
  };
}

/**
 * The members in one bulk file, in register order. `batch` is 1-based and
 * lines up with the register's pages.
 */
export async function getCardBatch(params: {
  associationId: string | null;
  filters: CardFilters;
  batch: number;
}) {
  return prisma.member.findMany({
    where: cardWhere(params.associationId, params.filters),
    orderBy: CARD_ORDER,
    skip: (Math.max(1, params.batch) - 1) * CARD_BATCH_SIZE,
    take: CARD_BATCH_SIZE,
    select: { id: true, memberNumber: true, associationId: true, userId: true },
  });
}

/**
 * When each member's card front was last downloaded by staff, read from the
 * audit trail the card routes already write. Deriving it rather than storing
 * it means there is no second record to fall out of step with the log.
 */
async function lastPrintedByOffice(memberIds: string[]): Promise<Map<string, Date>> {
  if (memberIds.length === 0) return new Map();

  const rows = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: {
      action: AUDIT_ACTIONS.QR_ACCESS_ISSUED,
      entityType: "Member",
      entityId: { in: memberIds },
    },
    _max: { createdAt: true },
  });

  const printed = new Map<string, Date>();
  for (const row of rows) {
    if (row.entityId && row._max.createdAt) printed.set(row.entityId, row._max.createdAt);
  }
  return printed;
}
