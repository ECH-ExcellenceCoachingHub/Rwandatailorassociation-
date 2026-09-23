import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, formatMoney, toMoney, toMoneyString, type MoneyInput } from "@/lib/money";
import { availableBalance } from "@/lib/services/ledger";
import {
  computeStandings,
  type ContributionStanding,
} from "@/lib/services/contributions";
import { getPolicy } from "@/lib/services/rulebook";
import { getWarehouseSummariesByMember } from "@/lib/services/warehouse";
import {
  ADVANCED_LOAN_STATUSES,
  LIVE_LOAN_STATUSES,
  OPEN_LOAN_STATUSES,
  assessBorrowingLimit,
  buildLoanSummary,
  buildShareholding,
  type AccountBorrowingLimit,
  type AccountLoanSummary,
  type ShareholdingSummary,
} from "@/lib/services/account-status";
import { csvCell, escapeHtml } from "@/lib/services/statements";
import { status as statusCopy, statusLabel } from "@/lib/i18n/dashboard/status";
import type { MemberStatus } from "@/lib/generated/prisma/enums";

/**
 * THE MEMBER ACCOUNT STATEMENT — every member's account status, one row each.
 *
 * What an officer takes to a general assembly or hands to an auditor: for each
 * member on the register, what they hold, what they can draw, what their
 * shareholding has reached, how far behind they are, and what they owe the
 * association on a loan, in fines and to the store.
 *
 * WHY IT IS BUILT FROM THE ACCOUNT STATUS PAGE'S OWN PIECES. Each row is the
 * headline of that member's /account/status page, and the two must agree to
 * the franc — a member shown one figure on their phone and another on the
 * printout will believe neither. So the shareholding, the loan summary and the
 * borrowing limit are produced by the same functions that page uses, the
 * arrears by the same `computeStanding`, and the warehouse debt by the same
 * totalling. What differs is only how the inputs are fetched: once for the
 * whole association rather than once per member, because a few hundred
 * members times a dozen queries each is a download that times out.
 */

/// Everyone admitted to the register. Applicants have no account yet and a
/// rejected application never had one; an exited member stays listed, because
/// one who left with money still on their account is precisely the row the
/// officer reading this needs to find.
const STATEMENT_MEMBER_STATUSES: MemberStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "EXITED",
];

export interface MemberAccountRow {
  memberNumber: string;
  fullName: string;
  phone: string | null;
  paymentReference: string;
  status: MemberStatus;
  joinedAt: Date | null;

  /// Null when no savings account has been opened yet — shown as such rather
  /// than as zero, as on the account status page.
  accountNumber: string | null;
  balance: string;
  available: string;
  locked: string;
  totalContributed: string;
  totalWithdrawn: string;

  /// Null for a member with no daily obligation — inactive or exited. The
  /// compliance screen leaves the same members out, and a departed member
  /// reported as "behind" would be an accusation about days they never owed.
  shareholding: ShareholdingSummary | null;
  /// Unpaid fines of both kinds: missed saving and late warehouse instalments.
  finesOwed: string;
  loan: AccountLoanSummary | null;
  /// Only for ACTIVE members. A suspended or departed member cannot borrow
  /// whatever their balance says, and printing a limit beside them invites
  /// the question of why they were refused it.
  borrowing: AccountBorrowingLimit | null;
  /// Everything the store is owed: outright purchases plus credit still
  /// being collected.
  owedToStore: string;
}

export interface MemberAccountStatement {
  association: {
    name: string;
    code: string;
    address: string;
    email: string | null;
    phone: string | null;
    timezone: string;
  };
  currency: string;
  asOf: Date;
  rows: MemberAccountRow[];
  totals: {
    balance: string;
    available: string;
    locked: string;
    totalContributed: string;
    totalWithdrawn: string;
    sharesHeld: string;
    arrears: string;
    finesOwed: string;
    loanOutstanding: string;
    lifetimeBorrowed: string;
    lifetimeRepaid: string;
    owedToStore: string;
  };
  counts: {
    members: number;
    active: number;
    suspended: number;
    departed: number;
    upToDate: number;
    behind: number;
    fineDue: number;
    excused: number;
    withLoan: number;
    loansOverdue: number;
  };
}

export async function buildMemberAccountStatement(
  associationId: string,
  asOf: Date = new Date()
): Promise<MemberAccountStatement | null> {
  const association = await prisma.association.findUnique({
    where: { id: associationId },
    select: {
      name: true,
      code: true,
      email: true,
      phone: true,
      addressLine1: true,
      city: true,
      district: true,
      country: true,
      currency: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!association) return null;

  const [
    members,
    standings,
    policy,
    openLoans,
    lifetimeLoans,
    contributionFines,
    creditFines,
    warehouse,
  ] = await Promise.all([
    prisma.member.findMany({
      where: { associationId, status: { in: STATEMENT_MEMBER_STATUSES } },
      orderBy: { memberNumber: "asc" },
      select: {
        id: true,
        memberNumber: true,
        paymentReference: true,
        status: true,
        joinedAt: true,
        approvedAt: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, phone: true } },
        // The first active account, as the account status page reads it.
        savingsAccounts: {
          where: { isActive: true },
          orderBy: { openedAt: "asc" },
          take: 1,
          select: {
            accountNumber: true,
            balance: true,
            lockedBalance: true,
            totalDeposits: true,
            totalWithdrawals: true,
          },
        },
      },
    }),

    computeStandings(associationId, { asOf }),
    getPolicy(associationId),

    // Newest first, so the first live loan per member is the one the account
    // status page calls "current".
    prisma.loan.findMany({
      where: { associationId, status: { in: OPEN_LOAN_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: {
        memberId: true,
        reference: true,
        status: true,
        principal: true,
        totalPaid: true,
        principalOutstanding: true,
        interestOutstanding: true,
        feesOutstanding: true,
        penaltyOutstanding: true,
        daysOverdue: true,
      },
    }),

    prisma.loan.groupBy({
      by: ["memberId"],
      where: { associationId, status: { in: ADVANCED_LOAN_STATUSES } },
      _sum: { principal: true, totalPaid: true },
      _count: { _all: true },
    }),

    prisma.contributionFine.groupBy({
      by: ["memberId"],
      where: { associationId, status: "OUTSTANDING" },
      _sum: { amount: true },
    }),
    prisma.warehouseCreditFine.groupBy({
      by: ["memberId"],
      where: { associationId, status: "OUTSTANDING" },
      _sum: { amount: true },
    }),

    getWarehouseSummariesByMember(associationId),
  ]);

  const standingByMember = new Map<string, ContributionStanding>(
    standings.map(({ row, standing }) => [row.memberId, standing])
  );

  const loansByMember = new Map<string, typeof openLoans>();
  for (const loan of openLoans) {
    const list = loansByMember.get(loan.memberId) ?? [];
    list.push(loan);
    loansByMember.set(loan.memberId, list);
  }

  const lifetimeByMember = new Map(lifetimeLoans.map((row) => [row.memberId, row]));

  const finesByMember = new Map<string, MoneyInput>();
  for (const row of [...contributionFines, ...creditFines]) {
    finesByMember.set(
      row.memberId,
      add(finesByMember.get(row.memberId) ?? 0, row._sum.amount ?? 0)
    );
  }

  const rows = members.map((member): MemberAccountRow => {
    const account = member.savingsAccounts[0] ?? null;
    const available = account
      ? availableBalance(account.balance, account.lockedBalance)
      : "0.00";

    const standing = standingByMember.get(member.id) ?? null;
    const memberLoans = loansByMember.get(member.id) ?? [];
    const lifetime = lifetimeByMember.get(member.id);

    return {
      memberNumber: member.memberNumber,
      fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
      phone: member.user.phone,
      paymentReference: member.paymentReference,
      status: member.status,
      joinedAt: member.joinedAt ?? member.approvedAt,

      accountNumber: account?.accountNumber ?? null,
      balance: toMoneyString(account?.balance ?? 0),
      available,
      locked: toMoneyString(account?.lockedBalance ?? 0),
      totalContributed: toMoneyString(account?.totalDeposits ?? 0),
      totalWithdrawn: toMoneyString(account?.totalWithdrawals ?? 0),

      shareholding: standing ? buildShareholding(standing) : null,
      finesOwed: toMoneyString(finesByMember.get(member.id) ?? 0),

      loan: buildLoanSummary({
        activeLoan:
          memberLoans.find((loan) => LIVE_LOAN_STATUSES.includes(loan.status)) ?? null,
        // The statement does not print the next instalment.
        nextInstalment: null,
        lifetimeBorrowed: lifetime?._sum.principal ?? null,
        lifetimeRepaid: lifetime?._sum.totalPaid ?? null,
        loanCount: lifetime?._count._all ?? 0,
      }),

      borrowing:
        member.status === "ACTIVE"
          ? assessBorrowingLimit({
              policy,
              available,
              member,
              associationCreatedAt: association.createdAt,
              standing,
              openLoanCount: memberLoans.length,
              asOf,
            })
          : null,

      owedToStore: warehouse.get(member.id)?.totalDueToStore ?? "0.00",
    };
  });

  const sum = (pick: (row: MemberAccountRow) => MoneyInput | null | undefined) =>
    toMoneyString(rows.reduce((total, row) => add(total, pick(row) ?? 0), toMoney(0)));

  const contributionStatus = (row: MemberAccountRow) => row.shareholding?.status;

  return {
    association: {
      name: association.name,
      code: association.code,
      address: [
        association.addressLine1,
        association.district,
        association.city,
        association.country,
      ]
        .filter(Boolean)
        .join(", "),
      email: association.email,
      phone: association.phone,
      timezone: association.timezone,
    },
    currency: association.currency,
    asOf,
    rows,
    totals: {
      balance: sum((row) => row.balance),
      available: sum((row) => row.available),
      locked: sum((row) => row.locked),
      totalContributed: sum((row) => row.totalContributed),
      totalWithdrawn: sum((row) => row.totalWithdrawn),
      sharesHeld: sum((row) => row.shareholding?.sharesHeld),
      arrears: sum((row) => row.shareholding?.behindAmount),
      finesOwed: sum((row) => row.finesOwed),
      loanOutstanding: sum((row) => row.loan?.outstanding),
      lifetimeBorrowed: sum((row) => row.loan?.lifetimeBorrowed),
      lifetimeRepaid: sum((row) => row.loan?.lifetimeRepaid),
      owedToStore: sum((row) => row.owedToStore),
    },
    counts: {
      members: rows.length,
      active: rows.filter((row) => row.status === "ACTIVE").length,
      suspended: rows.filter((row) => row.status === "SUSPENDED").length,
      departed: rows.filter((row) => row.status === "INACTIVE" || row.status === "EXITED")
        .length,
      upToDate: rows.filter((row) => contributionStatus(row) === "CURRENT").length,
      behind: rows.filter(
        (row) => contributionStatus(row) === "BEHIND" || contributionStatus(row) === "AT_RISK"
      ).length,
      fineDue: rows.filter((row) => contributionStatus(row) === "FINABLE").length,
      excused: rows.filter((row) => contributionStatus(row) === "EXEMPT").length,
      withLoan: rows.filter((row) => row.loan?.reference).length,
      loansOverdue: rows.filter((row) => (row.loan?.daysOverdue ?? 0) > 0).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// The same words the status badges use, so "Fine due" on the printout is
/// "Fine due" on the screen. English, like the member statement.
const label = (value: string) => statusLabel(value, statusCopy.en);

/**
 * CSV rendering: every figure on its own column, as plain two-decimal numbers
 * a spreadsheet can total. Blank, not zero, where a figure does not apply —
 * a departed member has no arrears to be zero.
 */
export function memberAccountStatementToCsv(statement: MemberAccountStatement): string {
  const line = (...cells: (string | number)[]) => cells.map(csvCell).join(",");

  const lines: string[] = [
    line(`${statement.association.name} — Member account statement`),
    "",
    line("Association code", statement.association.code),
    line("As of", statement.asOf.toISOString()),
    line("Currency", statement.currency),
    line("Members", statement.counts.members),
    "",
    line(
      "Member number",
      "Full name",
      "Phone",
      "Payment reference",
      "Account number",
      "Member status",
      "Member since",
      "Savings balance",
      "Available balance",
      "Locked",
      "Total contributed",
      "Total withdrawn",
      "Shares held",
      "Contribution status",
      "Days behind",
      "Arrears",
      "Days paid ahead",
      "Paid ahead",
      "Fines owed",
      "Current loan",
      "Loan status",
      "Loan outstanding",
      "Days overdue",
      "Total borrowed",
      "Total repaid",
      "Loan limit",
      "Can borrow now",
      "Why not",
      "Owed to store"
    ),
  ];

  for (const row of statement.rows) {
    const shares = row.shareholding;
    const loan = row.loan;

    lines.push(
      line(
        row.memberNumber,
        row.fullName,
        row.phone ?? "",
        row.paymentReference,
        row.accountNumber ?? "",
        label(row.status),
        row.joinedAt ? row.joinedAt.toISOString().slice(0, 10) : "",
        row.balance,
        row.available,
        row.locked,
        row.totalContributed,
        row.totalWithdrawn,
        shares?.sharesHeld ?? "",
        shares ? label(shares.status) : "",
        shares?.behindDays ?? "",
        shares?.behindAmount ?? "",
        shares?.advanceDays ?? "",
        shares?.advanceAmount ?? "",
        row.finesOwed,
        loan?.reference ?? "",
        loan?.status ? label(loan.status) : "",
        loan?.outstanding ?? "0.00",
        loan?.daysOverdue ?? 0,
        loan?.lifetimeBorrowed ?? "0.00",
        loan?.lifetimeRepaid ?? "0.00",
        row.borrowing?.limit ?? "",
        row.borrowing ? (row.borrowing.canBorrow ? "Yes" : "No") : "",
        row.borrowing?.blockers.map((blocker) => blocker.message).join(" ") ?? "",
        row.owedToStore
      )
    );
  }

  const { totals } = statement;
  lines.push(
    line(
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.balance,
      totals.available,
      totals.locked,
      totals.totalContributed,
      totals.totalWithdrawn,
      totals.sharesHeld,
      "",
      "",
      totals.arrears,
      "",
      "",
      totals.finesOwed,
      "",
      "",
      totals.loanOutstanding,
      "",
      totals.lifetimeBorrowed,
      totals.lifetimeRepaid,
      "",
      "",
      "",
      totals.owedToStore
    )
  );

  // BOM so Excel opens UTF-8 correctly — see statementToCsv.
  return `﻿${lines.join("\r\n")}`;
}

/**
 * Print-ready HTML, landscape, for the reason the member statement gives for
 * not producing a PDF itself: the browser's print-to-PDF makes a better one.
 *
 * The table header repeats on every printed page and no row splits across
 * two, so page 7 of a long register can still be read on its own.
 */
export function memberAccountStatementToHtml(statement: MemberAccountStatement): string {
  const { association, totals, counts } = statement;
  const money = (value: MoneyInput) => formatMoney(value, { currency: statement.currency });
  const figure = (value: MoneyInput) =>
    formatMoney(value, { currency: statement.currency, showSymbol: false });
  const dash = `<span class="muted">—</span>`;

  const rows = statement.rows
    .map((row, index) => {
      const shares = row.shareholding;
      const loan = row.loan;

      const contribution = shares
        ? `${escapeHtml(label(shares.status))}${
            shares.behindDays > 0
              ? `<span class="sub">${plural(shares.behindDays, "day")} behind</span>`
              : shares.advanceDays > 0
                ? `<span class="sub">${plural(shares.advanceDays, "day")} ahead</span>`
                : ""
          }`
        : dash;

      const loanCell =
        loan && loan.reference
          ? `${figure(loan.outstanding)}<span class="sub mono">${escapeHtml(loan.reference)}</span>${
              loan.daysOverdue > 0
                ? `<span class="sub bad">${plural(loan.daysOverdue, "day")} overdue</span>`
                : ""
            }`
          : dash;

      const limitCell = row.borrowing
        ? `${figure(row.borrowing.limit)}${
            row.borrowing.canBorrow ? "" : `<span class="sub">Not eligible now</span>`
          }`
        : dash;

      const owed = (value: string) =>
        toMoney(value).greaterThan(0) ? `<span class="bad">${figure(value)}</span>` : dash;

      return `
      <tr>
        <td class="muted">${index + 1}</td>
        <td>
          <strong>${escapeHtml(row.fullName)}</strong>
          <span class="sub mono">${escapeHtml(row.memberNumber)}</span>
          ${row.phone ? `<span class="sub">${escapeHtml(row.phone)}</span>` : ""}
        </td>
        <td>${escapeHtml(label(row.status))}</td>
        <td class="num strong">${row.accountNumber ? figure(row.balance) : dash}</td>
        <td class="num">${row.accountNumber ? figure(row.available) : dash}</td>
        <td class="num">${shares ? figure(shares.sharesHeld) : dash}</td>
        <td>${contribution}</td>
        <td class="num">${shares ? owed(shares.behindAmount) : dash}</td>
        <td class="num">${owed(row.finesOwed)}</td>
        <td class="num">${loanCell}</td>
        <td class="num">${limitCell}</td>
        <td class="num">${owed(row.owedToStore)}</td>
      </tr>`;
    })
    .join("");

  const asOf = formatInZone(statement.asOf, association.timezone);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Member account statement — ${escapeHtml(association.name)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; margin: 0; padding: 0 4px; font-size: 11px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1f4a88; padding-bottom: 12px; }
  .org { font-size: 18px; font-weight: 700; color: #0b1b33; margin: 0; }
  .muted { color: #6b7280; }
  .title { text-align: right; }
  .title h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #1f4a88; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0; }
  .panel { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .panel h3 { margin: 0 0 6px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; }
  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 1px 0; }
  .kv dt { color: #6b7280; }
  .kv dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 6px 5px; vertical-align: bottom; }
  td { padding: 5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th.num { white-space: normal; }
  .strong { font-weight: 700; }
  .sub { display: block; font-size: 9px; color: #6b7280; font-weight: 400; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .bad { color: #b91c1c; }
  .totals td { background: #eef3fa; font-weight: 700; border-top: 2px solid #1f4a88; border-bottom: 2px solid #1f4a88; }
  .foot { margin-top: 18px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 9.5px; color: #6b7280; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <p class="org">${escapeHtml(association.name)}</p>
      <p class="muted" style="margin:3px 0 0">${escapeHtml(association.address)}</p>
      <p class="muted" style="margin:2px 0 0">
        ${escapeHtml([association.phone, association.email].filter(Boolean).join(" · "))}
      </p>
    </div>
    <div class="title">
      <h2>Member account statement</h2>
      <p class="muted" style="margin:3px 0 0">As of ${escapeHtml(asOf)}</p>
      <p class="muted" style="margin:2px 0 0">Amounts in ${escapeHtml(statement.currency)}</p>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Members</h3>
      <dl style="margin:0">
        <div class="kv"><dt>On the register</dt><dd>${counts.members}</dd></div>
        <div class="kv"><dt>Active</dt><dd>${counts.active}</dd></div>
        <div class="kv"><dt>Suspended</dt><dd>${counts.suspended}</dd></div>
        <div class="kv"><dt>Inactive or exited</dt><dd>${counts.departed}</dd></div>
      </dl>
    </div>
    <div class="panel">
      <h3>Savings</h3>
      <dl style="margin:0">
        <div class="kv"><dt>Balance held</dt><dd>${money(totals.balance)}</dd></div>
        <div class="kv"><dt>Available</dt><dd>${money(totals.available)}</dd></div>
        <div class="kv"><dt>Locked</dt><dd>${money(totals.locked)}</dd></div>
        <div class="kv"><dt>Shares held</dt><dd>${money(totals.sharesHeld)}</dd></div>
      </dl>
    </div>
    <div class="panel">
      <h3>Daily contributions</h3>
      <dl style="margin:0">
        <div class="kv"><dt>Up to date</dt><dd>${counts.upToDate}</dd></div>
        <div class="kv"><dt>Behind</dt><dd>${counts.behind}</dd></div>
        <div class="kv"><dt>Fine due</dt><dd>${counts.fineDue}</dd></div>
        <div class="kv"><dt>Arrears</dt><dd>${money(totals.arrears)}</dd></div>
      </dl>
    </div>
    <div class="panel">
      <h3>Owed to the association</h3>
      <dl style="margin:0">
        <div class="kv"><dt>Loans outstanding</dt><dd>${money(totals.loanOutstanding)}</dd></div>
        <div class="kv"><dt>Loans overdue</dt><dd>${counts.loansOverdue} of ${counts.withLoan}</dd></div>
        <div class="kv"><dt>Fines</dt><dd>${money(totals.finesOwed)}</dd></div>
        <div class="kv"><dt>Warehouse</dt><dd>${money(totals.owedToStore)}</dd></div>
      </dl>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Member</th><th>Status</th>
        <th class="num">Savings balance</th><th class="num">Available</th>
        <th class="num">Shares held</th><th>Contribution</th>
        <th class="num">Arrears</th><th class="num">Fines owed</th>
        <th class="num">Loan owed</th><th class="num">Loan limit</th>
        <th class="num">Owed to store</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="12" style="text-align:center;padding:24px;color:#6b7280">No members on the register</td></tr>`}
    </tbody>
    ${
      statement.rows.length
        ? `<tfoot>
      <tr class="totals">
        <td></td><td>Total — ${plural(counts.members, "member")}</td><td></td>
        <td class="num">${figure(totals.balance)}</td>
        <td class="num">${figure(totals.available)}</td>
        <td class="num">${figure(totals.sharesHeld)}</td>
        <td></td>
        <td class="num">${figure(totals.arrears)}</td>
        <td class="num">${figure(totals.finesOwed)}</td>
        <td class="num">${figure(totals.loanOutstanding)}</td>
        <td></td>
        <td class="num">${figure(totals.owedToStore)}</td>
      </tr>
    </tfoot>`
        : ""
    }
  </table>

  <div class="foot">
    <p style="margin:0">
      Every figure is worked out from the association's ledger at the moment
      this statement was generated, by the same rules as each member's own
      account status page. Shares held are the days both elapsed and paid for,
      at the daily savings rate; arrears are missed days at the full daily cost.
    </p>
    <p style="margin:4px 0 0">
      Contribution figures are shown only for active and suspended members, who
      carry the daily obligation. A loan limit is shown only for active members.
      Fines owed include both missed-saving and warehouse-credit fines.
    </p>
  </div>

  <p class="noprint" style="margin-top:16px;text-align:center">
    <button onclick="window.print()" style="padding:10px 20px;border:0;border-radius:999px;background:#1f4a88;color:#fff;font-weight:600;cursor:pointer">
      Print or save as PDF
    </button>
  </p>
</body>
</html>`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The generation time on the association's own clock. The server may run in
 * UTC, and an officer in Kigali printing at nine in the evening should not be
 * handed a statement dated tomorrow. Falls back to UTC for a timezone Node
 * cannot resolve, as dayIndexIn does.
 */
function formatInZone(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  try {
    return date.toLocaleString("en-GB", { ...options, timeZone });
  } catch {
    return `${date.toLocaleString("en-GB", { ...options, timeZone: "UTC" })} UTC`;
  }
}
