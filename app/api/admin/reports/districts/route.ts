import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { buildDistrictReport, type DistrictReport } from "@/lib/services/district-report";
import { renderDistrictReportPdf } from "@/lib/reports/district-report-pdf";
import { csvCell } from "@/lib/services/statements";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import { status as statusCopy, statusLabel } from "@/lib/i18n/dashboard/status";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { apiNotFound, apiTooManyRequests, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * GET /api/admin/reports/districts?format=pdf|csv[&district=][&associationId=]
 *
 * Savings and registered members by district, as a PDF to print or file, or a
 * CSV with one row per member. `district` narrows it to one district's member
 * list; pass "none" for members with no district on file.
 *
 * Needs REPORTS_EXPORT because it leaves the platform as a file, and
 * SAVINGS_VIEW_ALL because it names every member's balance. A super
 * administrator without an association gets every association together.
 */

export const dynamic = "force-dynamic";

function toCsv(report: DistrictReport, headings: string[]): string {
  const lines = [headings.map(csvCell).join(",")];
  for (const district of report.districts) {
    for (const member of district.memberRows) {
      lines.push(
        [
          district.district ?? "",
          district.province ?? "",
          member.memberNumber,
          member.fullName,
          member.phone ?? "",
          member.status,
          member.joinedAt?.toISOString().slice(0, 10) ?? "",
          member.balance,
          member.feesDeducted,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }
  // BOM so Excel opens Kinyarwanda names and apostrophes correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission([
    PERMISSIONS.REPORTS_VIEW_ASSOCIATION,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.SAVINGS_VIEW_ALL,
  ]);

  const params = request.nextUrl.searchParams;
  const associationId = resolveAssociationScope(context, params.get("associationId"));

  const ip = await getClientIp();
  const limit = checkRateLimit(`district-report:${context.user.id}:${ip}`, RATE_LIMITS.EXPORT);
  if (!limit.allowed) {
    return apiTooManyRequests("Too many downloads. Please wait.", limit.retryAfter);
  }

  const format = params.get("format") === "csv" ? "csv" : "pdf";
  const only = params.get("district")?.trim().toLowerCase() || null;

  const report = await buildDistrictReport(associationId);
  if (!report) return apiNotFound("Association not found");

  if (only) {
    // Districts are grouped case-insensitively, so at most one matches.
    const row = report.districts.find((entry) =>
      only === "none" ? entry.district === null : entry.district?.toLowerCase() === only
    );
    if (!row) return apiNotFound("No members are registered in that district");
    report.districts = [row];
    report.totals = {
      members: row.members,
      active: row.active,
      savings: row.savings,
      feesDeducted: row.feesDeducted,
      averageSavings: row.averageSavings,
      districts: row.district === null ? 0 : 1,
    };
  }

  await recordAudit(
    {
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: "Association",
      entityId: associationId ?? "ALL",
      associationId,
      metadata: {
        report: "DISTRICT_REPORT",
        format,
        district: only,
        members: report.totals.members,
        asOf: report.asOf.toISOString(),
      },
    },
    context
  );

  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.reports;
  const slug = [
    report.association?.code.replace(/[^A-Za-z0-9_-]/g, "") ?? "all",
    only ? only.replace(/[^a-z0-9_-]/g, "") : null,
    report.asOf.toISOString().slice(0, 10),
  ]
    .filter(Boolean)
    .join("-");

  if (format === "csv") {
    const csv = toCsv(report, [
      copy.districtColDistrict,
      copy.districtColProvince,
      copy.districtColNumber,
      copy.districtColName,
      copy.districtColPhone,
      copy.districtColStatus,
      copy.districtColJoined,
      copy.districtColSavings,
      copy.districtColFees,
    ]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="districts-${slug}.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  }

  const pdf = await renderDistrictReportPdf(report, {
    title: copy.districtTitle,
    allAssociations: copy.districtAllAssociations,
    subtitle: copy.districtSubtitle,
    summaryHeading: copy.districtSummary,
    colDistrict: copy.districtColDistrict,
    colProvince: copy.districtColProvince,
    colMembers: copy.districtColMembers,
    colActive: copy.districtColActive,
    colSavings: copy.districtColSavings,
    colFees: copy.districtColFees,
    colAverage: copy.districtColAverage,
    colNumber: copy.districtColNumber,
    colName: copy.districtColName,
    colPhone: copy.districtColPhone,
    colStatus: copy.districtColStatus,
    colJoined: copy.districtColJoined,
    total: d.common.total,
    notRecorded: copy.districtNotRecorded,
    unrecognised: copy.districtUnrecognised,
    sectionSummary: copy.districtSection,
    page: copy.districtPage,
    statusLabel: (value) => statusLabel(value, statusCopy[locale]),
    formatDate: (date) => formatDate(date, locale),
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="districts-${slug}.pdf"`,
      "Cache-Control": "no-store, private",
    },
  });
});
