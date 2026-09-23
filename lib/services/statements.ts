import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, formatMoney, subtract, toMoney, toMoneyString } from "@/lib/money";

/**
 * Member statement generation.
 *
 * A statement is a financial document, so it is built from the ledger and
 * nothing else. In particular the opening balance is DERIVED — taken from the
 * `balanceBefore` of the first transaction in the period, or from the
 * `balanceAfter` of the last one before it — rather than recomputed by
 * summation. That guarantees the statement reconciles with the account history
 * exactly, including across reversals and adjustments.
 */

export interface StatementPeriod {
  from: Date;
  to: Date;
}

export interface StatementData {
  association: {
    name: string;
    code: string;
    email: string | null;
    phone: string | null;
    address: string;
  };
  member: {
    fullName: string;
    memberNumber: string;
    paymentReference: string;
    email: string | null;
    phone: string | null;
    joinedAt: Date | null;
  };
  account: { accountNumber: string; currency: string };
  period: StatementPeriod;
  openingBalance: string;
  closingBalance: string;
  totals: {
    deposits: string;
    withdrawals: string;
    interest: string;
    fees: string;
    loanDisbursements: string;
    loanRepayments: string;
  };
  transactions: {
    date: Date;
    reference: string;
    description: string;
    type: string;
    direction: string;
    debit: string;
    credit: string;
    balance: string;
  }[];
  generatedAt: Date;
}

export async function buildMemberStatement(
  memberId: string,
  period: StatementPeriod
): Promise<StatementData | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      memberNumber: true,
      paymentReference: true,
      joinedAt: true,
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      association: {
        select: {
          name: true,
          code: true,
          email: true,
          phone: true,
          addressLine1: true,
          city: true,
          district: true,
          country: true,
        },
      },
      savingsAccounts: {
        where: { isActive: true },
        orderBy: { openedAt: "asc" },
        take: 1,
        select: { id: true, accountNumber: true, currency: true },
      },
    },
  });

  if (!member || member.savingsAccounts.length === 0) return null;

  const account = member.savingsAccounts[0];

  const [inPeriod, priorRow] = await Promise.all([
    prisma.savingsTransaction.findMany({
      where: {
        savingsAccountId: account.id,
        createdAt: { gte: period.from, lte: period.to },
      },
      orderBy: { sequence: "asc" },
      select: {
        createdAt: true,
        valueDate: true,
        reference: true,
        description: true,
        type: true,
        direction: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
      },
    }),
    // The last movement BEFORE the period. Its closing balance is this
    // period's opening balance.
    prisma.savingsTransaction.findFirst({
      where: { savingsAccountId: account.id, createdAt: { lt: period.from } },
      orderBy: { sequence: "desc" },
      select: { balanceAfter: true },
    }),
  ]);

  const openingBalance = inPeriod.length
    ? inPeriod[0].balanceBefore
    : (priorRow?.balanceAfter ?? toMoney(0));

  const closingBalance = inPeriod.length
    ? inPeriod[inPeriod.length - 1].balanceAfter
    : openingBalance;

  const sumOf = (type: string) =>
    toMoneyString(
      inPeriod
        .filter((t) => t.type === type)
        .reduce((total, t) => add(total, t.amount), toMoney(0))
    );

  return {
    association: {
      name: member.association.name,
      code: member.association.code,
      email: member.association.email,
      phone: member.association.phone,
      address: [
        member.association.addressLine1,
        member.association.district,
        member.association.city,
        member.association.country,
      ]
        .filter(Boolean)
        .join(", "),
    },
    member: {
      fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
      memberNumber: member.memberNumber,
      paymentReference: member.paymentReference,
      email: member.user.email,
      phone: member.user.phone,
      joinedAt: member.joinedAt,
    },
    account: {
      accountNumber: account.accountNumber,
      currency: account.currency,
    },
    period,
    openingBalance: toMoneyString(openingBalance),
    closingBalance: toMoneyString(closingBalance),
    totals: {
      deposits: sumOf("DEPOSIT"),
      withdrawals: sumOf("WITHDRAWAL"),
      interest: sumOf("INTEREST"),
      fees: toMoneyString(add(sumOf("FEE"), sumOf("PENALTY"))),
      loanDisbursements: sumOf("LOAN_DISBURSEMENT"),
      loanRepayments: sumOf("LOAN_REPAYMENT"),
    },
    transactions: inPeriod.map((t) => ({
      date: t.valueDate ?? t.createdAt,
      reference: t.reference,
      description: t.description ?? t.type.replace(/_/g, " ").toLowerCase(),
      type: t.type,
      direction: t.direction,
      debit: t.direction === "DEBIT" ? t.amount.toFixed(2) : "",
      credit: t.direction === "CREDIT" ? t.amount.toFixed(2) : "",
      balance: t.balanceAfter.toFixed(2),
    })),
    generatedAt: new Date(),
  };
}

/**
 * One CSV field.
 *
 * Every field is quoted and internal quotes doubled — a member's description
 * can legitimately contain a comma, and an unquoted CSV would silently shift
 * every following column, corrupting the amounts.
 *
 * Values that begin with =, +, - or @ are prefixed with a single quote. Without
 * it, spreadsheet software interprets them as formulas — the CSV injection
 * problem, which on a financial export means a downloaded statement that can
 * execute something when opened.
 */
export function csvCell(value: string | number): string {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CSV rendering. See csvCell for how each field is guarded. */
export function statementToCsv(statement: StatementData): string {
  const esc = csvCell;

  const lines: string[] = [];

  lines.push(esc(`${statement.association.name} — Savings Statement`));
  lines.push("");
  lines.push([esc("Member"), esc(statement.member.fullName)].join(","));
  lines.push([esc("Membership number"), esc(statement.member.memberNumber)].join(","));
  lines.push([esc("Payment reference"), esc(statement.member.paymentReference)].join(","));
  lines.push([esc("Account number"), esc(statement.account.accountNumber)].join(","));
  lines.push(
    [
      esc("Period"),
      esc(
        `${statement.period.from.toISOString().slice(0, 10)} to ${statement.period.to.toISOString().slice(0, 10)}`
      ),
    ].join(",")
  );
  lines.push([esc("Currency"), esc(statement.account.currency)].join(","));
  lines.push(
    [esc("Generated"), esc(statement.generatedAt.toISOString())].join(",")
  );
  lines.push("");

  lines.push(
    [
      esc("Date"),
      esc("Reference"),
      esc("Description"),
      esc("Type"),
      esc("Debit"),
      esc("Credit"),
      esc("Balance"),
    ].join(",")
  );

  lines.push(
    [
      esc(statement.period.from.toISOString().slice(0, 10)),
      esc(""),
      esc("Opening balance"),
      esc(""),
      esc(""),
      esc(""),
      esc(statement.openingBalance),
    ].join(",")
  );

  for (const t of statement.transactions) {
    lines.push(
      [
        esc(t.date.toISOString().slice(0, 10)),
        esc(t.reference),
        esc(t.description),
        esc(t.type.replace(/_/g, " ")),
        esc(t.debit),
        esc(t.credit),
        esc(t.balance),
      ].join(",")
    );
  }

  lines.push(
    [
      esc(statement.period.to.toISOString().slice(0, 10)),
      esc(""),
      esc("Closing balance"),
      esc(""),
      esc(""),
      esc(""),
      esc(statement.closingBalance),
    ].join(",")
  );

  lines.push("");
  lines.push([esc("Total deposits"), esc(statement.totals.deposits)].join(","));
  lines.push([esc("Total withdrawals"), esc(statement.totals.withdrawals)].join(","));
  lines.push([esc("Interest earned"), esc(statement.totals.interest)].join(","));
  lines.push([esc("Fees and penalties"), esc(statement.totals.fees)].join(","));
  lines.push(
    [esc("Loan disbursements"), esc(statement.totals.loanDisbursements)].join(",")
  );
  lines.push([esc("Loan repayments"), esc(statement.totals.loanRepayments)].join(","));

  // BOM so Excel opens UTF-8 correctly — without it, accented names in the
  // member column render as mojibake.
  return `﻿${lines.join("\r\n")}`;
}

/**
 * Print-ready HTML statement.
 *
 * Rendered as HTML rather than generated as a binary PDF: the browser's own
 * print-to-PDF produces a correct, selectable, accessible document, and it
 * avoids shipping a PDF toolchain whose fonts would need bundling for a
 * document that is mostly a table. The stylesheet is print-first.
 */
export function statementToHtml(statement: StatementData): string {
  const date =(d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const rows = statement.transactions
    .map(
      (t) => `
      <tr>
        <td>${date(t.date)}</td>
        <td class="mono">${escapeHtml(t.reference)}</td>
        <td>${escapeHtml(t.description)}</td>
        <td class="num">${t.debit ? formatMoney(t.debit, { showSymbol: false }) : ""}</td>
        <td class="num">${t.credit ? formatMoney(t.credit, { showSymbol: false }) : ""}</td>
        <td class="num strong">${formatMoney(t.balance, { showSymbol: false })}</td>
      </tr>`
    )
    .join("");

  const net = subtract(statement.closingBalance, statement.openingBalance);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Statement — ${escapeHtml(statement.member.memberNumber)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; margin: 0; font-size: 12px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1f4a88; padding-bottom: 14px; }
  .org { font-size: 19px; font-weight: 700; color: #0b1b33; margin: 0; }
  .muted { color: #6b7280; }
  .title { text-align: right; }
  .title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #1f4a88; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 18px 0; }
  .panel { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
  .panel h3 { margin: 0 0 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; }
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .kv dt { color: #6b7280; }
  .kv dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 8px 6px; }
  td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10.5px; color: #6b7280; }
  .balrow td { background: #eef3fa; font-weight: 700; border-bottom: 2px solid #1f4a88; }
  .totals { margin-top: 18px; width: 320px; margin-left: auto; }
  .totals .kv { border-bottom: 1px solid #f1f5f9; padding: 5px 0; }
  .foot { margin-top: 26px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #6b7280; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <p class="org">${escapeHtml(statement.association.name)}</p>
      <p class="muted" style="margin:4px 0 0">${escapeHtml(statement.association.address)}</p>
      <p class="muted" style="margin:2px 0 0">
        ${escapeHtml([statement.association.phone, statement.association.email].filter(Boolean).join(" · "))}
      </p>
    </div>
    <div class="title">
      <h2>Savings statement</h2>
      <p class="muted" style="margin:4px 0 0">
        ${date(statement.period.from)} — ${date(statement.period.to)}
      </p>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Member</h3>
      <dl style="margin:0">
        <div class="kv"><dt>Name</dt><dd>${escapeHtml(statement.member.fullName)}</dd></div>
        <div class="kv"><dt>Membership no.</dt><dd>${escapeHtml(statement.member.memberNumber)}</dd></div>
        <div class="kv"><dt>Payment reference</dt><dd>${escapeHtml(statement.member.paymentReference)}</dd></div>
        ${statement.member.phone ? `<div class="kv"><dt>Phone</dt><dd>${escapeHtml(statement.member.phone)}</dd></div>` : ""}
      </dl>
    </div>
    <div class="panel">
      <h3>Account</h3>
      <dl style="margin:0">
        <div class="kv"><dt>Account no.</dt><dd>${escapeHtml(statement.account.accountNumber)}</dd></div>
        <div class="kv"><dt>Currency</dt><dd>${escapeHtml(statement.account.currency)}</dd></div>
        <div class="kv"><dt>Opening balance</dt><dd>${formatMoney(statement.openingBalance)}</dd></div>
        <div class="kv"><dt>Closing balance</dt><dd>${formatMoney(statement.closingBalance)}</dd></div>
      </dl>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th><th>Reference</th><th>Description</th>
        <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="balrow">
        <td>${date(statement.period.from)}</td><td></td><td>Opening balance</td>
        <td></td><td></td><td class="num">${formatMoney(statement.openingBalance, { showSymbol: false })}</td>
      </tr>
      ${rows || `<tr><td colspan="6" style="text-align:center;padding:24px;color:#6b7280">No transactions in this period</td></tr>`}
      <tr class="balrow">
        <td>${date(statement.period.to)}</td><td></td><td>Closing balance</td>
        <td></td><td></td><td class="num">${formatMoney(statement.closingBalance, { showSymbol: false })}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="kv"><dt>Total deposits</dt><dd>${formatMoney(statement.totals.deposits)}</dd></div>
    <div class="kv"><dt>Total withdrawals</dt><dd>${formatMoney(statement.totals.withdrawals)}</dd></div>
    <div class="kv"><dt>Interest earned</dt><dd>${formatMoney(statement.totals.interest)}</dd></div>
    <div class="kv"><dt>Fees and penalties</dt><dd>${formatMoney(statement.totals.fees)}</dd></div>
    <div class="kv"><dt>Loan disbursements</dt><dd>${formatMoney(statement.totals.loanDisbursements)}</dd></div>
    <div class="kv"><dt>Loan repayments</dt><dd>${formatMoney(statement.totals.loanRepayments)}</dd></div>
    <div class="kv" style="border-bottom:none;border-top:2px solid #1f4a88;margin-top:4px;padding-top:8px">
      <dt class="strong">Net movement</dt>
      <dd class="strong">${formatMoney(net, { signed: true })}</dd>
    </div>
  </div>

  <div class="foot">
    <p style="margin:0">
      Generated on ${statement.generatedAt.toLocaleString("en-GB")}.
      This statement is produced directly from the association's transaction
      ledger. Every entry carries a unique reference and a running balance.
    </p>
    <p style="margin:6px 0 0">
      Queries: quote your payment reference
      <strong>${escapeHtml(statement.member.paymentReference)}</strong>.
    </p>
  </div>

  <p class="noprint" style="margin-top:20px;text-align:center">
    <button onclick="window.print()" style="padding:10px 20px;border:0;border-radius:999px;background:#1f4a88;color:#fff;font-weight:600;cursor:pointer">
      Print or save as PDF
    </button>
  </p>
</body>
</html>`;
}
