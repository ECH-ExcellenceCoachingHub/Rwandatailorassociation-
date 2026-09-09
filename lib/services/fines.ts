import { prisma } from "@/lib/db/prisma";
import { add, toMoneyString } from "@/lib/money";

/**
 * THE FINES REGISTER.
 *
 * An association fines its members for two different things, and until this
 * file the two lived on screens that had nothing to do with each other: a
 * missed daily contribution surfaced as a column on the compliance list, and a
 * late warehouse-credit instalment as a line inside one credit's card. Neither
 * screen could answer the question an officer actually asks — "what does this
 * member owe us in penalties, and what have we forgiven this month?" — and a
 * member had to visit two pages to learn they had been fined at all.
 *
 * So the register merges them. It does NOT merge the underlying records: a
 * ContributionFine and a WarehouseCreditFine are assessed by different rules,
 * settled through different money paths, and must stay separately auditable.
 * What is unified is the *view*, and `kind` on every row says which table a
 * row came from so the caller can route an action back to the right endpoint.
 *
 * MERGED IN THE APPLICATION, NOT IN SQL. Same trade the contribution service
 * documents: one association has hundreds of fines, not millions, and a UNION
 * across two tables with different columns would be a second place for the two
 * fine types' semantics to drift apart. Pagination stays correct because of the
 * property that, to serve page N of a merge of two date-sorted lists, the first
 * N*pageSize rows of each are always sufficient.
 */

export type FineKind = "CONTRIBUTION" | "WAREHOUSE_CREDIT";

/// The two enums are declared separately in the schema but hold the same four
/// values, deliberately: a fine ends the same four ways whatever raised it.
export type FineStatus = "OUTSTANDING" | "SETTLED" | "WAIVED" | "CANCELLED";

export const FINE_STATUSES: FineStatus[] = [
  "OUTSTANDING",
  "SETTLED",
  "WAIVED",
  "CANCELLED",
];

export const FINE_KINDS: FineKind[] = ["CONTRIBUTION", "WAREHOUSE_CREDIT"];

export interface FineRow {
  id: string;
  kind: FineKind;
  reference: string;

  memberId: string;
  memberName: string;
  memberNumber: string;

  /// The sum that produced the fine, kept together so the member can be shown
  /// the arithmetic rather than a bare figure: rate applied to arrears.
  amount: string;
  arrearsAmount: string;
  rate: string;
  currency: string;

  status: FineStatus;
  assessedAt: Date;
  settledAt: Date | null;
  waivedAt: Date | null;
  waiverReason: string | null;

  /// What earned it. Exactly one of these two shapes is populated, according to
  /// `kind` — a contribution fine has no instalment, and a credit fine has no
  /// missed contribution days.
  missedDays: number | null;
  daysLate: number | null;
  installmentNumber: number | null;
  creditReference: string | null;

  /// Whether an officer can take this one out of savings from the register.
  /// Only contribution fines: a credit fine is cleared by paying the credit, so
  /// offering "collect" here would imply a money path that does not exist.
  canSettle: boolean;
}

export interface FinesPage {
  rows: FineRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FinesOverview {
  outstandingAmount: string;
  outstandingCount: number;
  settledAmount: string;
  settledCount: number;
  waivedAmount: string;
  waivedCount: number;
  /// How many distinct members currently owe at least one fine. The figure an
  /// officer reads as "how many phone calls", which a total in francs is not.
  membersAffected: number;
}

export interface FineFilters {
  kind?: FineKind | "ALL";
  status?: FineStatus | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
}

function memberSearchWhere(search: string) {
  return [
    { reference: { contains: search, mode: "insensitive" as const } },
    { member: { memberNumber: { contains: search, mode: "insensitive" as const } } },
    {
      member: {
        user: { firstName: { contains: search, mode: "insensitive" as const } },
      },
    },
    {
      member: {
        user: { lastName: { contains: search, mode: "insensitive" as const } },
      },
    },
  ];
}

const MEMBER_SELECT = {
  id: true,
  memberNumber: true,
  user: { select: { firstName: true, lastName: true } },
} as const;

type SelectedMember = {
  id: string;
  memberNumber: string;
  user: { firstName: string; lastName: string };
};

function memberName(member: SelectedMember): string {
  return `${member.user.firstName} ${member.user.lastName}`.trim();
}

/**
 * Interleaves the two fine lists, newest first.
 *
 * Exported so the pagination property the register depends on can be asserted
 * without a database: merging the FIRST N*pageSize rows of each list and
 * slicing page N out of the result gives the same page as merging the complete
 * lists would. That holds because a row on page N can be preceded by at most
 * N*pageSize newer rows in total, so no row that could reach page N is ever
 * outside the first N*pageSize of its own list. If that stops being true the
 * register silently starts dropping rows from later pages, which is exactly the
 * kind of failure nobody notices until an audit — hence a test rather than a
 * comment.
 *
 * Ties broken by reference, not left to the sort. Two fines assessed in the
 * same batch share a timestamp to the millisecond, and an unstable order
 * between them would let a row shift between pages from one request to the
 * next — the same row read twice, or missed entirely, while paging through.
 */
export function mergeFines(...lists: FineRow[][]): FineRow[] {
  return lists.flat().sort((a, b) => {
    const byDate = b.assessedAt.getTime() - a.assessedAt.getTime();
    return byDate !== 0 ? byDate : a.reference.localeCompare(b.reference);
  });
}

/**
 * Every fine in the association, newest first.
 *
 * Newest first rather than worst first, unlike the compliance list. This is a
 * register — the question it answers is "what has happened" — and an officer
 * hunting one member reaches for the search box, not the sort order.
 */
export async function listFines(
  associationId: string,
  filters: FineFilters = {}
): Promise<FinesPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const kind = filters.kind ?? "ALL";
  const status = filters.status ?? "ALL";
  const search = filters.search?.trim();

  // Enough of each list to cover every page up to this one. See the note at the
  // top: this is what makes slicing the merged array correct.
  const reach = page * pageSize;

  const statusWhere = status === "ALL" ? {} : { status };
  const searchWhere = search ? { OR: memberSearchWhere(search) } : {};
  const where = { associationId, ...statusWhere, ...searchWhere };

  const wantsContribution = kind === "ALL" || kind === "CONTRIBUTION";
  const wantsCredit = kind === "ALL" || kind === "WAREHOUSE_CREDIT";

  const [contributionRows, contributionTotal, creditRows, creditTotal] =
    await Promise.all([
      wantsContribution
        ? prisma.contributionFine.findMany({
            where,
            orderBy: { assessedAt: "desc" },
            take: reach,
            select: {
              id: true,
              reference: true,
              amount: true,
              arrearsAmount: true,
              rate: true,
              currency: true,
              status: true,
              missedDays: true,
              assessedAt: true,
              settledAt: true,
              waivedAt: true,
              waiverReason: true,
              member: { select: MEMBER_SELECT },
            },
          })
        : Promise.resolve([]),
      wantsContribution
        ? prisma.contributionFine.count({ where })
        : Promise.resolve(0),
      wantsCredit
        ? prisma.warehouseCreditFine.findMany({
            where,
            orderBy: { assessedAt: "desc" },
            take: reach,
            select: {
              id: true,
              reference: true,
              amount: true,
              arrearsAmount: true,
              rate: true,
              currency: true,
              status: true,
              daysLate: true,
              assessedAt: true,
              settledAt: true,
              waivedAt: true,
              waiverReason: true,
              member: { select: MEMBER_SELECT },
              credit: { select: { reference: true } },
              installment: { select: { installmentNumber: true } },
            },
          })
        : Promise.resolve([]),
      wantsCredit
        ? prisma.warehouseCreditFine.count({ where })
        : Promise.resolve(0),
    ]);

  const merged = mergeFines(
    contributionRows.map((fine) => ({
      id: fine.id,
      kind: "CONTRIBUTION" as const,
      reference: fine.reference,
      memberId: fine.member.id,
      memberName: memberName(fine.member),
      memberNumber: fine.member.memberNumber,
      amount: toMoneyString(fine.amount),
      arrearsAmount: toMoneyString(fine.arrearsAmount),
      rate: fine.rate.toString(),
      currency: fine.currency,
      status: fine.status as FineStatus,
      assessedAt: fine.assessedAt,
      settledAt: fine.settledAt,
      waivedAt: fine.waivedAt,
      waiverReason: fine.waiverReason,
      missedDays: fine.missedDays,
      daysLate: null,
      installmentNumber: null,
      creditReference: null,
      canSettle: fine.status === "OUTSTANDING",
    })),
    creditRows.map((fine) => ({
      id: fine.id,
      kind: "WAREHOUSE_CREDIT" as const,
      reference: fine.reference,
      memberId: fine.member.id,
      memberName: memberName(fine.member),
      memberNumber: fine.member.memberNumber,
      amount: toMoneyString(fine.amount),
      arrearsAmount: toMoneyString(fine.arrearsAmount),
      rate: fine.rate.toString(),
      currency: fine.currency,
      status: fine.status as FineStatus,
      assessedAt: fine.assessedAt,
      settledAt: fine.settledAt,
      waivedAt: fine.waivedAt,
      waiverReason: fine.waiverReason,
      missedDays: null,
      daysLate: fine.daysLate,
      installmentNumber: fine.installment.installmentNumber,
      creditReference: fine.credit.reference,
      canSettle: false,
    }))
  );

  const total = contributionTotal + creditTotal;
  const start = (page - 1) * pageSize;

  return {
    rows: merged.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * The figures at the top of the register.
 *
 * Waived is shown beside settled rather than hidden, because forgiveness is the
 * number a committee is answerable for: money the association chose not to
 * collect is a decision, and a register that only totals what was taken makes
 * that decision invisible.
 */
export async function getFinesOverview(
  associationId: string
): Promise<FinesOverview> {
  const [contributionGroups, creditGroups, contributionMembers, creditMembers] =
    await Promise.all([
      prisma.contributionFine.groupBy({
        by: ["status"],
        where: { associationId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.warehouseCreditFine.groupBy({
        by: ["status"],
        where: { associationId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.contributionFine.findMany({
        where: { associationId, status: "OUTSTANDING" },
        select: { memberId: true },
        distinct: ["memberId"],
      }),
      prisma.warehouseCreditFine.findMany({
        where: { associationId, status: "OUTSTANDING" },
        select: { memberId: true },
        distinct: ["memberId"],
      }),
    ]);

  const bucket = (status: FineStatus) => {
    const a = contributionGroups.find((group) => group.status === status);
    const b = creditGroups.find((group) => group.status === status);
    return {
      amount: toMoneyString(add(a?._sum.amount ?? 0, b?._sum.amount ?? 0)),
      count: (a?._count._all ?? 0) + (b?._count._all ?? 0),
    };
  };

  const outstanding = bucket("OUTSTANDING");
  const settled = bucket("SETTLED");
  const waived = bucket("WAIVED");

  // Counted across both fine types, so a member fined for both a missed
  // contribution and a late instalment is one person to call, not two.
  const affected = new Set<string>([
    ...contributionMembers.map((row) => row.memberId),
    ...creditMembers.map((row) => row.memberId),
  ]);

  return {
    outstandingAmount: outstanding.amount,
    outstandingCount: outstanding.count,
    settledAmount: settled.amount,
    settledCount: settled.count,
    waivedAmount: waived.amount,
    waivedCount: waived.count,
    membersAffected: affected.size,
  };
}

export interface MemberFines {
  rows: FineRow[];
  outstandingAmount: string;
  outstandingCount: number;
  settledAmount: string;
  waivedCount: number;
  currency: string;
}

/**
 * One member's fines, both kinds, for their own page.
 *
 * Unpaginated on purpose. A member with more fines than fit on a screen has a
 * problem that hiding half of them behind a "next" link does not solve, and the
 * point of the page is that they can see the whole position they are being
 * asked to clear.
 */
export async function listMemberFines(memberId: string): Promise<MemberFines> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { association: { select: { currency: true } } },
  });

  if (!member) {
    return {
      rows: [],
      outstandingAmount: "0.00",
      outstandingCount: 0,
      settledAmount: "0.00",
      waivedCount: 0,
      currency: "RWF",
    };
  }

  const [contributionRows, creditRows] = await Promise.all([
    prisma.contributionFine.findMany({
      where: { memberId },
      orderBy: { assessedAt: "desc" },
      select: {
        id: true,
        reference: true,
        amount: true,
        arrearsAmount: true,
        rate: true,
        currency: true,
        status: true,
        missedDays: true,
        assessedAt: true,
        settledAt: true,
        waivedAt: true,
        waiverReason: true,
        member: { select: MEMBER_SELECT },
      },
    }),
    prisma.warehouseCreditFine.findMany({
      where: { memberId },
      orderBy: { assessedAt: "desc" },
      select: {
        id: true,
        reference: true,
        amount: true,
        arrearsAmount: true,
        rate: true,
        currency: true,
        status: true,
        daysLate: true,
        assessedAt: true,
        settledAt: true,
        waivedAt: true,
        waiverReason: true,
        member: { select: MEMBER_SELECT },
        credit: { select: { reference: true } },
        installment: { select: { installmentNumber: true } },
      },
    }),
  ]);

  const rows = mergeFines(
    contributionRows.map((fine) => ({
      id: fine.id,
      kind: "CONTRIBUTION" as const,
      reference: fine.reference,
      memberId,
      memberName: memberName(fine.member),
      memberNumber: fine.member.memberNumber,
      amount: toMoneyString(fine.amount),
      arrearsAmount: toMoneyString(fine.arrearsAmount),
      rate: fine.rate.toString(),
      currency: fine.currency,
      status: fine.status as FineStatus,
      assessedAt: fine.assessedAt,
      settledAt: fine.settledAt,
      waivedAt: fine.waivedAt,
      waiverReason: fine.waiverReason,
      missedDays: fine.missedDays,
      daysLate: null,
      installmentNumber: null,
      creditReference: null,
      canSettle: false,
    })),
    creditRows.map((fine) => ({
      id: fine.id,
      kind: "WAREHOUSE_CREDIT" as const,
      reference: fine.reference,
      memberId,
      memberName: memberName(fine.member),
      memberNumber: fine.member.memberNumber,
      amount: toMoneyString(fine.amount),
      arrearsAmount: toMoneyString(fine.arrearsAmount),
      rate: fine.rate.toString(),
      currency: fine.currency,
      status: fine.status as FineStatus,
      assessedAt: fine.assessedAt,
      settledAt: fine.settledAt,
      waivedAt: fine.waivedAt,
      waiverReason: fine.waiverReason,
      missedDays: null,
      daysLate: fine.daysLate,
      installmentNumber: fine.installment.installmentNumber,
      creditReference: fine.credit.reference,
      canSettle: false,
    }))
  );

  const outstanding = rows.filter((row) => row.status === "OUTSTANDING");
  const settled = rows.filter((row) => row.status === "SETTLED");

  return {
    rows,
    outstandingAmount: toMoneyString(add(0, ...outstanding.map((row) => row.amount))),
    outstandingCount: outstanding.length,
    settledAmount: toMoneyString(add(0, ...settled.map((row) => row.amount))),
    waivedCount: rows.filter((row) => row.status === "WAIVED").length,
    currency: member.association.currency,
  };
}
