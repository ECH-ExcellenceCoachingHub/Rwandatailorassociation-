import "server-only";
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { equals, gt, isPositive, subtract, toMoney, toMoneyString } from "@/lib/money";
import { normalisePhone } from "@/lib/phone";
import { getEnv } from "@/lib/env";
import { paymentLogger } from "@/lib/logger";
import { extractWithPython, PythonUnavailableError } from "@/lib/services/pdf-extract";

/**
 * BANK STATEMENT PDF IMPORT — PARSING LAYER.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * Parsing a PDF is inherently unreliable. A PDF has no table structure — it is
 * glyphs at coordinates. Column alignment, wrapped descriptions, page headers
 * and footers all vary between banks and even between statement periods from
 * the same bank. A parser that works perfectly on one statement can silently
 * misread the next.
 *
 * That is why this module NEVER writes to the ledger. It only produces a
 * proposal. An administrator reviews every parsed row against the PDF in front
 * of them and confirms before a single franc moves. The human is the
 * verification step, and that is deliberate: with the Jenga API we can
 * re-query the bank to confirm a transaction, but a PDF has no second source —
 * the document *is* the bank's record, and someone has to attest that it is
 * genuine and correctly read.
 *
 * Everything downstream of confirmation reuses the existing pipeline: the same
 * duplicate constraints, the same member-matching rules, the same ledger, the
 * same audit trail.
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface ParsedRow {
  /// Stable identity for duplicate detection across re-uploads. Unique within
  /// a single parse — see `disambiguate` for why that is not automatic.
  fingerprint: string;
  /// Which occurrence this is of an otherwise identical entry, 1-based. Two
  /// genuine same-day, same-amount, same-narration payments on a statement
  /// with no running balance column are indistinguishable by content alone,
  /// and this is what keeps them apart.
  occurrence: number;
  date: Date;
  /// The raw text as it appeared, kept for the admin's review.
  rawLine: string;
  description: string;
  /// Bank's own reference for the entry, when the statement provides one.
  bankReference: string | null;
  /// Who the narration says sent the money, when a name can be read out of it.
  /// Used only as a weak, human-reviewed matching signal — see
  /// lib/services/payment-matching.ts.
  payerName: string | null;
  /// Sender's mobile number in E.164, when the narration carries one. Mobile
  /// money deposits almost always quote it, and it is a far stronger matching
  /// key than the name.
  payerPhone: string | null;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  /// Running balance after the entry, when present.
  balanceAfter: string | null;
  /// How confident the parser is in this row. Low rows are pre-deselected.
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  /// Rows the parser found but could not interpret, shown to the admin so a
  /// silent drop is never mistaken for "the statement had nothing else".
  unparsedLines: string[];
  pageCount: number;
  detectedAccount: string | null;
  detectedPeriod: { from: string | null; to: string | null };
  totals: { credits: string; debits: string; creditCount: number; debitCount: number };
  /// What happened to every line in the document. The counts must add up, so
  /// an administrator can satisfy themselves that nothing was quietly lost
  /// between the PDF and the table they are about to approve.
  coverage: {
    linesRead: number;
    /// Headers, footers, column titles and balance-brought-forward lines.
    structuralLines: number;
    /// Recognised as transactions.
    transactionLines: number;
    /// Looked like transactions but could not be interpreted.
    unparsedCount: number;
    /// Neither a transaction nor recognised structure — address blocks, notes.
    otherLines: number;
  };
}

const MAX_PAGES = 200;

/**
 * Vertical tolerance, in PDF user-space units, for treating two glyphs as
 * being on the same line. Bank statements rarely align a row's baselines
 * perfectly — a superscript currency marker or a taller font in one column
 * shifts the baseline by a point or two — so an exact comparison splits one
 * visual row into several.
 */
const LINE_TOLERANCE = 3;

/**
 * Fraction of the font size above which a horizontal gap is treated as a
 * space. Expressed relative to font size rather than as an absolute distance
 * because a statement mixes 7pt table text with 14pt headings, and one fixed
 * threshold cannot be right for both.
 */
const WORD_GAP_RATIO = 0.18;

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  /// Font size in user-space units, derived from the text matrix.
  size: number;
}

/**
 * Re-joins a number that item boundaries split apart.
 *
 * Separating every text item with a space (see `joinLine`) is what stops two
 * adjacent columns merging, but it also breaks "21,723,811.00" when the writer
 * emits the grouping commas as their own items. Whitespace is therefore
 * removed again around a separator that sits between digits — and only there,
 * so "TOTAL 5,000 . See note" is untouched while "5 ,000 . 00" is repaired.
 */
function repairNumbers(text: string): string {
  return text
    .replace(/(\d)\s+([,.])/g, "$1$2")
    .replace(/([,.])\s+(\d)/g, "$1$2");
}

/**
 * Assembles one line from its items, left to right.
 *
 * TWO COLUMNS MUST NEVER MERGE. A statement's columns are frequently set flush
 * against one another, and when a time column runs into an amount column the
 * parser reads a plausible-looking number that is simply wrong — "09:44:14"
 * followed by "21,723,811" becomes "421,723,811", which is not an amount
 * anybody can spot as false without the PDF beside them. A wrong description
 * is cosmetic; a wrong amount is money.
 *
 * So a boundary between two digits always separates, whatever the geometry
 * says, and the numeric repair above puts back the splits that were internal
 * to one number.
 */
function joinLine(items: PositionedItem[]): string {
  let text = "";
  let previousEnd: number | null = null;

  for (const item of items) {
    if (previousEnd !== null) {
      const gap = item.x - previousEnd;
      const threshold = Math.max(0.4, item.size * WORD_GAP_RATIO);

      const previousChar = text.at(-1) ?? "";
      const nextChar = item.str[0] ?? "";
      // Digit meeting digit across an item boundary is always two values.
      const digitsWouldFuse = /\d/.test(previousChar) && /\d/.test(nextChar);

      if (gap > threshold || digitsWouldFuse) text += " ";
    }

    text += item.str;
    previousEnd = item.x + item.width;
  }

  return repairNumbers(text).replace(/\s+/g, " ").trim();
}

/**
 * Rebuilds the visual lines of one page from glyph positions.
 *
 * A PDF has no rows — only glyphs at coordinates. Reading the text stream in
 * document order gives whatever sequence the generator happened to emit, which
 * for a table is frequently column-by-column rather than row-by-row. Grouping
 * by baseline and then sorting by x reconstructs what a human sees, which is
 * the only thing the row parser below can work with.
 */
async function extractPageLines(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number
): Promise<string[]> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();

  const items: PositionedItem[] = [];
  // Guards against the same glyph run being emitted twice at (almost) the same
  // spot. Generators simulate bold by drawing text a fraction of a unit apart,
  // and some produce a duplicate text layer for accessibility. Both would
  // otherwise read as a second, phantom copy of a real transaction row.
  const drawn = new Set<string>();

  for (const raw of content.items) {
    const item = raw as { str?: string; transform?: number[]; width?: number };
    if (typeof item.str !== "string" || item.str.trim() === "") continue;

    // transform is [a, b, c, d, e, f]; e and f are the x/y translation.
    const transform = item.transform;
    if (!Array.isArray(transform) || transform.length < 6) continue;

    const x = transform[4];
    const y = transform[5];

    // Font size, from the scale part of the text matrix. Also the unit the
    // word-gap threshold is expressed in.
    const size = Math.hypot(transform[0], transform[1]) || 10;

    // A missing or zero width would make every item look like it ends where it
    // starts, so the next item always appears far away and every character
    // gets a space. Estimating from the glyph count is crude but keeps the
    // geometry roughly right; 0.5em is a reasonable mean advance.
    const reported = typeof item.width === "number" ? item.width : 0;
    const width = reported > 0 ? reported : item.str.length * size * 0.5;

    // Rounded to the nearest unit: far finer than the gap between two real
    // columns, coarse enough to catch a half-unit bold offset.
    const stamp = `${item.str}@${Math.round(x)},${Math.round(y)}`;
    if (drawn.has(stamp)) continue;
    drawn.add(stamp);

    items.push({ str: item.str, x, y, width, size });
  }

  // Top-to-bottom, then left-to-right. PDF y grows upwards, hence b.y - a.y.
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const grouped: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  let anchorY: number | null = null;

  for (const item of items) {
    if (anchorY === null || Math.abs(item.y - anchorY) <= LINE_TOLERANCE) {
      if (anchorY === null) anchorY = item.y;
      current.push(item);
    } else {
      grouped.push(current);
      current = [item];
      anchorY = item.y;
    }
  }
  if (current.length > 0) grouped.push(current);

  return grouped
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      return joinLine(line);
    })
    .filter(Boolean);
}

/** True when the extracted text carries enough characters to be a statement. */
function hasUsableText(text: string): boolean {
  return (text.match(/[A-Za-z0-9]/g)?.length ?? 0) >= 20;
}

/** How the text in front of the parser was obtained. Surfaced to the admin. */
export type ExtractionMode = "pdfplumber" | "layout" | "flat";

export interface ExtractionOutcome {
  text: string;
  pageCount: number;
  extractionMode: ExtractionMode;
  /// Pages that produced no text at all — scanned inserts in a digital PDF.
  pagesWithoutText: number[];
}

const NO_TEXT_MESSAGE =
  "No text could be read from this PDF. It is most likely a scan or photograph " +
  "of a statement, which contains images rather than text. Upload the PDF as " +
  "issued by the bank, or enter the payments manually.";

/**
 * Extracts text from the uploaded PDF, preserving row structure.
 *
 * THREE ENGINES, STRONGEST FIRST.
 *
 *   1. `pdfplumber` (Python). Clusters characters into words with real
 *      per-character geometry, so two adjacent columns are always two words.
 *      This is the one that gets tightly-set statements right.
 *   2. `layout` (JavaScript). Groups pdf.js text items by baseline. Workable,
 *      but the item boundaries it depends on are coarser, and on a statement
 *      whose columns touch it can fuse them into a single wrong number.
 *   3. `flat`. No structure at all — a last resort so a document that defeats
 *      both of the above still shows the administrator something rather than
 *      an empty table.
 *
 * `STATEMENT_EXTRACTOR` decides how far down that list this is allowed to go.
 * On `python` a missing interpreter is an error, because silently downgrading
 * to a weaker parser is precisely what should not happen in production.
 */
export async function extractStatementText(
  buffer: ArrayBuffer
): Promise<ExtractionOutcome> {
  const { STATEMENT_EXTRACTOR } = getEnv();

  if (STATEMENT_EXTRACTOR !== "node") {
    try {
      const result = await extractWithPython(buffer);
      const text = result.lines.join("\n");

      if (hasUsableText(text)) {
        return {
          text,
          pageCount: result.pageCount,
          extractionMode: "pdfplumber",
          pagesWithoutText: result.pagesWithoutText,
        };
      }

      // Python read the document and found no text in it. That is a fact about
      // the file, not a reason to retry with a weaker engine.
      throw new Error(NO_TEXT_MESSAGE);
    } catch (error) {
      const unavailable = error instanceof PythonUnavailableError;

      if (STATEMENT_EXTRACTOR === "python" || !unavailable) {
        throw error;
      }

      // auto + Python missing: carry on with the JavaScript path, but say so
      // loudly in the log — running the weaker parser unnoticed for months is
      // how a misread column becomes a discovered-too-late problem.
      paymentLogger.warn(
        { reason: error instanceof Error ? error.message : String(error) },
        "python extractor unavailable — falling back to the javascript parser"
      );
    }
  }

  return extractWithJavaScript(buffer);
}

/** The fallback engine. See `extractStatementText` for when this is used. */
async function extractWithJavaScript(
  buffer: ArrayBuffer
): Promise<ExtractionOutcome> {
  // `slice(0)` copies. pdf.js takes ownership of the buffer it is given and
  // detaches it, which would leave the caller holding an unusable ArrayBuffer
  // — and the caller may still need it, e.g. to hash the file or to retry with
  // another engine.
  const pdf = await getDocumentProxy(new Uint8Array(buffer.slice(0)));

  if (pdf.numPages > MAX_PAGES) {
    throw new Error(
      `This statement has ${pdf.numPages} pages, which exceeds the ${MAX_PAGES}-page limit. Split it into smaller periods.`
    );
  }

  const pages: string[] = [];
  const pagesWithoutText: number[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    try {
      const lines = await extractPageLines(pdf, pageNumber);
      if (lines.length === 0) pagesWithoutText.push(pageNumber);
      pages.push(lines.join("\n"));
    } catch {
      // One unreadable page must not lose the other 39. The gap shows up as
      // missing rows in the preview, which the admin reconciles against the
      // document in front of them.
      pagesWithoutText.push(pageNumber);
      pages.push("");
    }
  }

  const layoutText = pages.join("\n");
  if (hasUsableText(layoutText)) {
    return {
      text: layoutText,
      pageCount: pdf.numPages,
      extractionMode: "layout",
      pagesWithoutText,
    };
  }

  const { text } = await extractText(pdf, { mergePages: true });
  const flatText = Array.isArray(text) ? text.join("\n") : text;

  if (!hasUsableText(flatText)) {
    throw new Error(NO_TEXT_MESSAGE);
  }

  return {
    text: flatText,
    pageCount: pdf.numPages,
    extractionMode: "flat",
    pagesWithoutText,
  };
}

// Date formats seen on Rwandan and regional bank statements.
const DATE_PATTERNS: { regex: RegExp; build: (m: RegExpMatchArray) => Date | null }[] = [
  // 2026-08-14
  {
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    build: (m) => utcDate(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 14/08/2026 or 14-08-2026
  {
    regex: /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,
    build: (m) => utcDate(Number(m[3]), Number(m[2]), Number(m[1])),
  },
  // 14-Aug-2026 / 14 Aug 2026
  {
    regex: /\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})\b/,
    build: (m) => {
      const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
      return month ? utcDate(Number(m[3]), month, Number(m[1])) : null;
    },
  },
  // 14/08/26
  {
    regex: /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/,
    build: (m) => utcDate(2000 + Number(m[3]), Number(m[2]), Number(m[1])),
  },
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** UTC to keep a statement date stable regardless of server timezone. */
function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Money tokens: 1,234.56 / 1234.56 / 1,234 / (1,234.56) for negatives, and
 * bare whole numbers like 300.
 *
 * THE BARE-INTEGER CASE IS NOT OPTIONAL HERE. The franc has no subunit in
 * practice, so a Rwandan statement prints whole amounts with no decimal part,
 * and anything under a thousand carries no separator either — a 300 RWF ATM
 * fee appears as exactly "300". Requiring a separator or a decimal made every
 * such row unreadable, and worse: with the fee token invisible, the parser
 * took the RUNNING BALANCE as the amount and reported a 300 franc charge as
 * 1,235,730.
 *
 * Accepting bare integers costs something — a branch code or a terminal id
 * sitting in the narration now also looks like a number. Two things contain
 * it. Dates are stripped before this ever runs (see `stripDates`), and the
 * row reader only ever takes the LAST two tokens on a line, which on every
 * statement layout seen so far are the amount and the balance. Digits that
 * are part of a longer word — the 0044 in BKAD0044 — are excluded outright by
 * the boundary guards.
 */
const AMOUNT_TOKEN =
  /\(?-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\)?|\(?-?\d+\.\d{2}\)?|(?<![\w,.])\(?-?\d{1,12}\)?(?![\w,.])/g;

/**
 * Money in its unmistakable forms only: comma-grouped, or with a decimal part.
 *
 * Used where a false positive would destroy information rather than merely add
 * noise. Stripping the narration with the pattern above would eat the digits
 * out of a member payment reference — "RTA-000001" became "RTA-" — and that
 * reference is the single strongest signal the matcher has for identifying who
 * a payment belongs to.
 */
const FORMATTED_AMOUNT_TOKEN =
  /\(?-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\)?|\(?-?\d+\.\d{2}\)?/g;

/** Clock times: 09:44, 09:44:14. Never an amount, always digits. */
const TIME_TOKEN = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

/**
 * Blanks out dates and times so they cannot be read as amounts.
 *
 * Needed only because bare integers are now accepted: without it the 2026 of
 * "14/08/2026" is as good a number as any other — and so are the three parts
 * of a timestamp. That second case is not hypothetical. Bank of Kigali prints
 * "Issued on : 2026-08-14 09:44:14" in a header repeated on all 45 pages, and
 * reading 09/44/14 as money turned each of those headers into a phantom
 * transaction.
 */
function stripDates(line: string): string {
  let text = line.replace(TIME_TOKEN, " ");
  for (const pattern of DATE_PATTERNS) {
    text = text.replace(new RegExp(pattern.regex.source, "g"), " ");
  }
  return text;
}

function parseAmountToken(token: string): { value: string; negative: boolean } | null {
  const negative = token.includes("(") || token.trim().startsWith("-");
  const cleaned = token.replace(/[(),\s-]/g, "");
  if (!cleaned) return null;

  try {
    const value = toMoney(cleaned);
    return { value: toMoneyString(value), negative };
  } catch {
    return null;
  }
}

/**
 * Parses statement text into candidate transaction rows.
 *
 * Strategy: any line containing a date AND at least one money token is a
 * transaction candidate. Direction is decided by the running balance where the
 * statement provides one — that is far more reliable than guessing from column
 * position, which breaks the moment a description wraps or a column is blank.
 */
export function parseStatementRows(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];
  const unparsedLines: string[] = [];

  let previousBalance: string | null = null;
  let detectedAccount: string | null = null;
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let structuralLines = 0;
  let otherLines = 0;

  for (const line of lines) {
    // Header metadata, useful for the admin to confirm they uploaded the right
    // statement for the right account.
    if (!detectedAccount) {
      const accountMatch = line.match(
        /(?:account|a\/c|acct)[\s.:#-]*(?:number|no|n[o°])?[\s.:#-]*([0-9]{6,20})/i
      );
      if (accountMatch) detectedAccount = accountMatch[1];
    }

    if (!periodFrom) {
      const periodMatch = line.match(
        /(?:period|statement|from)[\s:]*([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{2,4})\s*(?:to|-|—)\s*([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{2,4})/i
      );
      if (periodMatch) {
        periodFrom = periodMatch[1];
        periodTo = periodMatch[2];
      }
    }

    if (isNoiseLine(line)) {
      structuralLines++;
      continue;
    }

    const date = extractDate(line);
    // Scanned with the dates removed: a statement line begins with one or two
    // of them, and every component would otherwise read as a number.
    const amounts = [...stripDates(line).matchAll(AMOUNT_TOKEN)]
      .map((m) => parseAmountToken(m[0]))
      .filter((a): a is { value: string; negative: boolean } => a !== null);

    if (!date || amounts.length === 0) {
      // Only surface lines that look like they *wanted* to be transactions,
      // so the admin is not shown every header and footer in the document.
      if (date || amounts.length > 0) unparsedLines.push(line);
      else otherLines++;
      continue;
    }

    const parsed = interpretRow(line, date, amounts, previousBalance);

    if (!parsed) {
      unparsedLines.push(line);
      continue;
    }

    rows.push(parsed);
    if (parsed.balanceAfter) previousBalance = parsed.balanceAfter;
  }

  disambiguate(rows);

  const credits = rows.filter((r) => r.direction === "CREDIT");
  const debits = rows.filter((r) => r.direction === "DEBIT");

  return {
    rows,
    // Capped for display only; `coverage.unparsedCount` reports the true
    // figure, so a long tail is never hidden by the cap.
    unparsedLines: unparsedLines.slice(0, 50),
    // Filled in by the caller, which is what opened the document.
    pageCount: 0,
    detectedAccount,
    detectedPeriod: { from: periodFrom, to: periodTo },
    totals: {
      credits: sumAmounts(credits),
      debits: sumAmounts(debits),
      creditCount: credits.length,
      debitCount: debits.length,
    },
    coverage: {
      linesRead: lines.length,
      structuralLines,
      transactionLines: rows.length,
      unparsedCount: unparsedLines.length,
      otherLines,
    },
  };
}

/**
 * Makes every row's identity unique within the statement.
 *
 * THIS IS A CORRECTNESS FIX, NOT A COSMETIC ONE. The fingerprint is three
 * things at once: the React key in the review table, the token the admin's
 * selection is expressed in, and — via `importedTransactionId` — the
 * `externalTransactionId` that the unique constraint deduplicates on.
 *
 * So when two rows collide, three things break together: the table renders
 * with duplicate keys, ticking one row ticks both, and only the FIRST of the
 * two payments is ever written — the second is rejected by the unique
 * constraint and silently counted as "already imported". A member's second
 * payment of the day disappears without anyone being told.
 *
 * Collisions are not exotic. The content hash covers date, amount, direction,
 * narration and running balance; a statement with no balance column and two
 * identical same-day contributions produces two identical hashes. A bank that
 * reuses a reference across entries does the same.
 *
 * The suffix is assigned by position, and the parse order is deterministic, so
 * re-uploading the same statement reproduces exactly the same identities —
 * which is what keeps genuine duplicate detection across uploads working.
 */
function disambiguate(rows: ParsedRow[]): void {
  const seen = new Map<string, number>();

  for (const row of rows) {
    // Keyed on whatever `importedTransactionId` will use, so the disambiguation
    // lands on the value that actually has to be unique.
    const key = row.bankReference
      ? `REF:${row.bankReference}`
      : `FP:${row.fingerprint}`;

    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);

    row.occurrence = occurrence;

    if (occurrence > 1) {
      row.fingerprint = `${row.fingerprint}-${occurrence}`;
      row.warnings = [
        ...row.warnings,
        `This entry is identical to an earlier one in the statement. Check the PDF — ` +
          `if it is a genuine second payment, import both; if the line was read twice, ` +
          `untick one.`,
      ];
    }
  }
}

function sumAmounts(rows: ParsedRow[]): string {
  return toMoneyString(
    rows.reduce((total, row) => total.plus(toMoney(row.amount)), toMoney(0))
  );
}

function extractDate(line: string): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) {
      const date = pattern.build(match);
      // Guard against a misread century producing a date centuries away.
      if (date && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100) {
        return date;
      }
    }
  }
  return null;
}

/** Lines that are structure, not transactions. */
function isNoiseLine(line: string): boolean {
  const lowered = line.toLowerCase();

  const noise = [
    "opening balance",
    "closing balance",
    "balance brought forward",
    "balance carried forward",
    "b/f",
    "c/f",
    "page ",
    "statement of account",
    "total credits",
    "total debits",
    "date description",
    "date narration",
    "value date",
    "printed on",
    "end of statement",
  ];

  if (noise.some((token) => lowered.includes(token))) return true;

  // A pure column header: words, no digits.
  if (/^[a-z\s|/]+$/i.test(line) && line.length < 80) return true;

  return false;
}

/**
 * Turns a candidate line into a row.
 *
 * Direction logic, most reliable first:
 *   1. Running balance moved up → credit, down → debit.
 *   2. Explicit CR/DR marker in the text.
 *   3. Parenthesised or negative amount → debit.
 * When none apply the row is marked low confidence and left for the admin.
 */
function interpretRow(
  line: string,
  date: Date,
  amounts: { value: string; negative: boolean }[],
  previousBalance: string | null
): ParsedRow | null {
  const warnings: string[] = [];

  // The last money token on a statement line is almost always the running
  // balance; the one before it is the transaction amount.
  const hasBalance = amounts.length >= 2;
  const balanceAfter = hasBalance ? amounts[amounts.length - 1].value : null;
  const amountCandidate = hasBalance
    ? amounts[amounts.length - 2]
    : amounts[amounts.length - 1];

  if (!amountCandidate || !isPositive(toMoney(amountCandidate.value))) {
    return null;
  }

  const amount = amountCandidate.value;

  let direction: "CREDIT" | "DEBIT" | null = null;
  let confidence: ParsedRow["confidence"] = "low";

  // 1 — running balance movement.
  if (balanceAfter && previousBalance) {
    const movement = subtract(balanceAfter, previousBalance);

    if (equals(movement, amount)) {
      direction = "CREDIT";
      confidence = "high";
    } else if (equals(movement, `-${amount}`)) {
      direction = "DEBIT";
      confidence = "high";
    } else {
      // The balance did not move by the amount we read. Either the amount is
      // wrong or a row was missed — both worth the admin's attention.
      warnings.push(
        `Running balance moved by ${toMoneyString(movement)} but the amount reads ${amount}`
      );
      direction = gt(movement, 0) ? "CREDIT" : "DEBIT";
      confidence = "low";
    }
  }

  // 2 — explicit CR/DR marker.
  //
  // On a statement read as a table this is not a marker found in prose: it is
  // emitted by the extractor because the amount sat in the bank's Debit or
  // Credit COLUMN, which is the bank stating the direction outright. So where
  // the running balance was inconclusive, the marker is preferred over a guess
  // derived from a balance that did not add up.
  if (!direction || confidence === "low") {
    const marker = line.match(/\b(CR|DR|CREDIT|DEBIT)\b/i)?.[1]?.toUpperCase();
    if (marker) {
      const fromMarker = marker.startsWith("C") ? "CREDIT" : "DEBIT";

      if (direction && direction !== fromMarker) {
        warnings.push(
          `The running balance suggested a ${direction.toLowerCase()} but the ` +
            `statement's ${marker} column says otherwise — the column was used`
        );
      }

      direction = fromMarker;
      confidence = "medium";
    }
  }

  // 3 — sign or parentheses.
  if (!direction) {
    direction = amountCandidate.negative ? "DEBIT" : "CREDIT";
    confidence = amountCandidate.negative ? "medium" : "low";
    if (!amountCandidate.negative) {
      warnings.push(
        "Direction could not be determined from the statement — assumed a credit"
      );
    }
  }

  const description = extractDescription(line);
  const bankReference = extractBankReference(line);
  const payerName = extractPayerName(description);
  // Read from the raw line: extractDescription strips digit groups.
  const payerPhone = extractPayerPhone(line);

  if (!description) {
    warnings.push("No description found on this line");
  }

  return {
    // Deterministic: re-uploading the same statement produces the same
    // fingerprint, so the unique constraint rejects it as a duplicate.
    // Balance is included because two genuine same-day, same-amount payments
    // with identical narration are distinguishable only by running balance.
    fingerprint: createHash("sha256")
      .update(
        [
          date.toISOString().slice(0, 10),
          amount,
          direction,
          bankReference ?? description.toLowerCase().replace(/\s+/g, " "),
          balanceAfter ?? "",
        ].join("|")
      )
      .digest("hex")
      .slice(0, 32),
    // Corrected by `disambiguate` once the whole statement has been read —
    // whether an entry is a repeat is not knowable from the entry alone.
    occurrence: 1,
    date,
    rawLine: line,
    description,
    bankReference,
    payerName,
    payerPhone,
    amount,
    direction,
    balanceAfter,
    confidence,
    warnings,
  };
}

/** Strips dates, amounts and reference tokens, leaving the narration. */
function extractDescription(line: string): string {
  let text = line;

  for (const pattern of DATE_PATTERNS) {
    text = text.replace(new RegExp(pattern.regex.source, "g"), " ");
  }

  // Deliberately the strict pattern: a bare number in a narration is far more
  // likely to be part of a reference than a stray amount.
  text = text.replace(FORMATTED_AMOUNT_TOKEN, " ");
  text = text.replace(/\b(CR|DR)\b/gi, " ");
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, 200);
}

/**
 * Words that appear in bank narrations but are never part of a person's name.
 * Used to trim the noise around a candidate name rather than to reject it, so
 * "MOBILE MONEY DEPOSIT FROM UWIMANA JEAN" yields "UWIMANA JEAN".
 */
const NARRATION_NOISE = new Set([
  "ACC", "ACCOUNT", "AGENT", "AIRTEL", "AMOUNT", "APP", "ATM", "BANK", "BRANCH",
  "CASH", "CHARGE", "CHEQUE", "COMMISSION", "CONTRIBUTION", "CREDIT", "DEBIT",
  "DEP", "DEPOSIT", "EFT", "FEE", "FUNDS", "IMT", "INCOMING", "INTERNAL",
  "LOAN", "MEMBER", "MOBILE", "MOMO", "MONEY", "MTN", "NARRATION", "ONLINE",
  "OUTGOING", "PAY", "PAYMENT", "POS", "REF", "REFERENCE", "RTGS",
  "RWF", "SALARY", "SAVINGS", "SELF", "SERVICE", "SWIFT", "TRANSACTION",
  "TRANSFER", "TRF", "TRX", "TXN", "USSD",
  // Words that INTRODUCE the payer rather than being part of their name.
  // "TRANSFER BY/MUKAMANA ALICE/" must yield "MUKAMANA ALICE", never
  // "BY MUKAMANA ALICE".
  "AND", "BY", "FOR", "FRM", "FROM", "NEW", "OF", "PAYER", "RECEIVED", "SENDER",
  "THE", "TO", "VIA",
]);

/** Tokens that are plausibly part of a personal name. */
function isNameToken(token: string): boolean {
  return (
    token.length >= 2 &&
    token.length <= 20 &&
    /^[A-Z][A-Z'’-]*$/.test(token) &&
    !NARRATION_NOISE.has(token)
  );
}

/**
 * Reads the sender's name out of a statement narration.
 *
 * Banks write the payer in wildly different shapes — "TRF FROM JOHN DOE",
 * "DEPOSIT BY/MUKAMANA ALICE/", "MOMO UWIMANA JEAN 0788…". Rather than trying
 * to enumerate every bank's format, an explicit "from"/"by" marker is honoured
 * first, and otherwise the longest run of name-like words is taken.
 *
 * A single word is never returned: one token is far too weak to point at a
 * person, and the matcher would only have to discard it anyway.
 */
/** The longest run of consecutive name-like words in a fragment. */
function longestNameRun(fragment: string): string | null {
  const upper = fragment
    .toUpperCase()
    .replace(/[^A-Z'’\-\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!upper) return null;

  let best: string[] = [];
  let run: string[] = [];

  for (const token of upper.split(/[\s/]+/).filter(Boolean)) {
    if (isNameToken(token)) {
      run.push(token);
      // Four tokens is already a full name plus a middle name; beyond that
      // the run is almost certainly swallowing narration text.
      if (run.length > 4) run.shift();
    } else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;

  return best.length >= 2 ? best.join(" ") : null;
}

/**
 * The places a bank narration puts the counterparty, strongest first.
 *
 * Statement narrations are not free text — they are assembled from a template,
 * and the other party sits in a predictable slot:
 *
 *   "New App BK-BK Account Transfer : ABDALLAH NZABAND | contribution…"
 *                                     ^ between the colon and the pipe
 *   "Incoming Trsf frm local banks | AFRICA BUSINESS NEWS RWANDA 0000017"
 *                                    ^ after the pipe, when there is no colon
 *
 * Reading the structure beats scanning the whole string for capitalised words:
 * that approach pulled "FTCM ZQNXSPYV NEW" out of a transaction reference and
 * offered it as a person's name.
 */
function counterpartyFragments(description: string): string[] {
  // PDF text extraction often reads the "|" separator as a capital "I". A lone
  // "I" between words is never part of a name, so it is put back.
  const normalised = description.includes("|")
    ? description
    : description.replace(/\s+I\s+/, " | ");

  const [head, ...rest] = normalised.split("|");
  const fragments: string[] = [];

  const colon = head.lastIndexOf(":");
  const afterColon = colon !== -1 ? head.slice(colon + 1) : null;
  const tail = rest.join(" ").trim();

  // "EKASH incoming transfer : RWANDA TAILORS A | Peruth MUNYANA2507…" — on an
  // incoming transfer the slot after the colon is the RECEIVER, which is the
  // association's own account, and the sender follows the pipe.
  if (/incoming\s+transfer/i.test(head)) {
    if (tail) fragments.push(tail);
    if (afterColon) fragments.push(afterColon);
    return fragments;
  }

  if (afterColon) fragments.push(afterColon);
  if (tail) fragments.push(tail);

  return fragments;
}

export function extractPayerName(description: string): string | null {
  if (!description) return null;

  for (const fragment of counterpartyFragments(description)) {
    const name = longestNameRun(fragment);
    if (name) return name;
  }

  // Nothing structured — fall back to scanning the whole narration, which is
  // what an unfamiliar bank's format will land on.
  return longestNameRun(description);
}

/**
 * Reads the sender's mobile number out of a statement line.
 *
 * Mobile money deposits — the most common way a member pays without quoting a
 * reference — nearly always carry the sending number in the narration. It is a
 * much stronger identifier than the sender's name, so it is worth pulling out
 * even though a bank statement has no structured field for it.
 *
 * Matching happens against the RAW line rather than the cleaned description,
 * because `extractDescription` strips digit groups that can include the number.
 * Candidates are validated through `normalisePhone`, so anything that is not a
 * real Rwandan mobile — an account number, a branch code, a date — is rejected
 * rather than guessed at.
 */
export function extractPayerPhone(line: string): string | null {
  // 0788123456 / 250788123456 / +250 788 123 456 / 0788 123 456
  const candidates = line.match(
    /(?:\+?250[\s-]?|0)7[2389](?:[\s-]?\d){7}/g
  );

  if (!candidates) return null;

  for (const candidate of candidates) {
    const normalised = normalisePhone(candidate);
    if (normalised) return normalised;
  }

  return null;
}

/**
 * Bank's own reference for the entry.
 * Preferred over the computed fingerprint when present, because it is the
 * bank's stable identity for the transaction.
 */
function extractBankReference(line: string): string | null {
  const patterns = [
    // Bank of Kigali's own format, which interleaves letters and digits:
    // FT243380LZZ2, FTCM24339HS101CKD, FTCM2652ZQNXSPYV. Listed first because
    // it is the most specific. The leading word boundary keeps it from finding
    // "FTERNOON" inside a narration.
    /\b(FT[A-Z0-9]{6,24})\b/,
    /\b(?:ref|reference|txn|trx|trans(?:action)?)[\s.:#-]*([A-Z0-9]{6,25})\b/i,
    /\b([A-Z]{2,4}\d{8,18})\b/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

/**
 * External transaction id for an imported row.
 *
 * Prefixed so an imported payment is always distinguishable from one the API
 * delivered — which matters when reconciling the two sources later, and when
 * asking "where did this credit come from?".
 */
export function importedTransactionId(row: ParsedRow): string {
  // The bank's own reference is preferred — but only for the first entry
  // carrying it. If a statement repeats a reference across two entries, the
  // later ones fall back to their (already disambiguated) fingerprint, so two
  // distinct payments can never collapse into one record.
  return row.bankReference && row.occurrence === 1
    ? `PDF-REF:${row.bankReference}`
    : `PDF-FP:${row.fingerprint}`;
}
