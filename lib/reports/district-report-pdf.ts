import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney } from "@/lib/money";
import { fill, pluralize } from "@/lib/i18n/fill";
import type { DistrictReport, DistrictRow } from "@/lib/services/district-report";

/**
 * The district report as a PDF: a summary table of every district, then each
 * district's members on their own section, highest balance first.
 *
 * Drawn with pdf-lib and the standard Helvetica faces, as the membership cards
 * are, so it needs no browser and no font files on the server. Those faces
 * only carry the Windows-1252 character set, which is why every string passes
 * through `safe` on its way to the page.
 */

export interface DistrictReportLabels {
  title: string;
  allAssociations: string;
  /// {date}, {members}, {districts}
  subtitle: string;
  summaryHeading: string;
  colDistrict: string;
  colProvince: string;
  colMembers: string;
  colActive: string;
  colSavings: string;
  colFees: string;
  colAverage: string;
  colNumber: string;
  colName: string;
  colPhone: string;
  colStatus: string;
  colJoined: string;
  total: string;
  notRecorded: string;
  unrecognised: string;
  /// "{count} member|{count} members"; {savings} is the district's total.
  sectionSummary: string;
  /// {page}, {pages}
  page: string;
  statusLabel: (status: string) => string;
  formatDate: (date: Date | null) => string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_WIDTH = A4.width - MARGIN * 2;
const ROW_HEIGHT = 16;
const FOOTER_SPACE = 30;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.44, 0.48);
const BRAND = rgb(0.11, 0.3, 0.55);
const HEAD_FILL = rgb(0.92, 0.94, 0.97);
const ZEBRA = rgb(0.975, 0.98, 0.985);
const RULE = rgb(0.82, 0.84, 0.88);

/** Keeps a string inside Windows-1252, which is all Helvetica can encode. */
function safe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7e\xa1-\xff]/g, "");
}

interface Column {
  label: string;
  /// Fraction of the content width.
  width: number;
  align?: "left" | "right";
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Shortens text with an ellipsis until it fits the width. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  let value = safe(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  /** Starts a new page unless `height` still fits above the footer. */
  ensure(height: number): boolean {
    if (this.y - height < MARGIN + FOOTER_SPACE) {
      this.newPage();
      return true;
    }
    return false;
  }

  text(
    value: string,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) {
    const size = options.size ?? 10;
    this.ensure(size + 4);
    this.y -= size;
    this.page.drawText(fit(value, options.bold ? this.fonts.bold : this.fonts.regular, size, CONTENT_WIDTH), {
      x: MARGIN,
      y: this.y,
      size,
      font: options.bold ? this.fonts.bold : this.fonts.regular,
      color: options.color ?? INK,
    });
    this.y -= options.gap ?? 4;
  }

  private row(
    columns: Column[],
    cells: string[],
    options: { bold?: boolean; fill?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb> }
  ) {
    const size = 8.5;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    if (options.fill) {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - ROW_HEIGHT,
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        color: options.fill,
      });
    }

    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = column.width * CONTENT_WIDTH;
      const text = fit(cells[index] ?? "", font, size, width - 8);
      const textWidth = font.widthOfTextAtSize(text, size);
      this.page.drawText(text, {
        x: column.align === "right" ? x + width - 4 - textWidth : x + 4,
        y: this.y - ROW_HEIGHT + 5,
        size,
        font,
        color: options.color ?? INK,
      });
      x += width;
    });
    this.y -= ROW_HEIGHT;
  }

  /** A table whose header row is repeated on every page it runs onto. */
  table(columns: Column[], rows: string[][], totals?: string[]) {
    const header = () =>
      this.row(
        columns,
        columns.map((c) => c.label),
        { bold: true, fill: HEAD_FILL }
      );

    this.ensure(ROW_HEIGHT * 2);
    header();
    rows.forEach((cells, index) => {
      if (this.ensure(ROW_HEIGHT)) header();
      this.row(columns, cells, { fill: index % 2 === 1 ? ZEBRA : undefined });
    });

    if (totals) {
      if (this.ensure(ROW_HEIGHT)) header();
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
        thickness: 0.8,
        color: RULE,
      });
      this.row(columns, totals, { bold: true });
    }
    this.y -= 6;
  }
}

function districtName(row: DistrictRow, labels: DistrictReportLabels): string {
  if (row.district === null) return labels.notRecorded;
  return row.recognised ? row.district : `${row.district} ${labels.unrecognised}`;
}

export async function renderDistrictReportPdf(
  report: DistrictReport,
  labels: DistrictReportLabels
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(labels.title));
  doc.setCreationDate(report.asOf);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const out = new Writer(doc, fonts);
  const money = (value: string) => formatMoney(value);

  out.text(report.association?.name ?? labels.allAssociations, {
    size: 16,
    bold: true,
    color: BRAND,
    gap: 6,
  });
  out.text(labels.title, { size: 13, bold: true, gap: 5 });
  out.text(
    fill(labels.subtitle, {
      date: labels.formatDate(report.asOf),
      members: report.totals.members,
      districts: report.totals.districts,
    }),
    { size: 9, color: MUTED, gap: 14 }
  );

  // The summary only says something when there is more than one district.
  if (report.districts.length > 1) {
    out.text(labels.summaryHeading, { size: 11, bold: true, gap: 6 });
    out.table(
      [
        { label: labels.colDistrict, width: 0.19 },
        { label: labels.colProvince, width: 0.16 },
        { label: labels.colMembers, width: 0.09, align: "right" },
        { label: labels.colActive, width: 0.08, align: "right" },
        { label: labels.colSavings, width: 0.17, align: "right" },
        { label: labels.colFees, width: 0.16, align: "right" },
        { label: labels.colAverage, width: 0.15, align: "right" },
      ],
      report.districts.map((row) => [
        districtName(row, labels),
        row.province ?? "",
        String(row.members),
        String(row.active),
        money(row.savings),
        money(row.feesDeducted),
        money(row.averageSavings),
      ]),
      [
        labels.total,
        "",
        String(report.totals.members),
        String(report.totals.active),
        money(report.totals.savings),
        money(report.totals.feesDeducted),
        money(report.totals.averageSavings),
      ]
    );
    out.y -= 10;
  }

  for (const row of report.districts) {
    out.ensure(ROW_HEIGHT * 4);
    out.text(
      row.province ? `${districtName(row, labels)} - ${row.province}` : districtName(row, labels),
      { size: 11, bold: true, color: BRAND, gap: 3 }
    );
    out.text(pluralize(labels.sectionSummary, row.members, { savings: money(row.savings) }), {
      size: 8.5,
      color: MUTED,
      gap: 5,
    });
    out.table(
      [
        { label: labels.colNumber, width: 0.11 },
        { label: labels.colName, width: 0.21 },
        { label: labels.colPhone, width: 0.14 },
        { label: labels.colStatus, width: 0.1 },
        { label: labels.colJoined, width: 0.12 },
        { label: labels.colSavings, width: 0.16, align: "right" },
        { label: labels.colFees, width: 0.16, align: "right" },
      ],
      row.memberRows.map((member) => [
        member.memberNumber,
        member.fullName,
        member.phone ?? "",
        labels.statusLabel(member.status),
        labels.formatDate(member.joinedAt),
        money(member.balance),
        money(member.feesDeducted),
      ]),
      [labels.total, "", "", "", "", money(row.savings), money(row.feesDeducted)]
    );
    out.y -= 8;
  }

  // Page numbers last, once the page count is known.
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const footer = safe(
      `${fill(labels.page, { page: index + 1, pages: pages.length })}  |  ${labels.formatDate(report.asOf)}`
    );
    page.drawText(footer, {
      x: MARGIN,
      y: MARGIN - 14,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
  });

  return doc.save();
}
