import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  buildMemberAccountStatement,
  memberAccountStatementToCsv,
  memberAccountStatementToHtml,
} from "@/lib/services/member-account-statement";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  apiBadRequest,
  apiNotFound,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

/**
 * GET /api/admin/members/statement?format=html|csv[&associationId=]
 *
 * Every member's account status on one statement — balances, shareholding,
 * arrears, fines, loans and warehouse debt, one row per member.
 *
 * Needs both SAVINGS_VIEW_ALL, because it is every member's balance at once,
 * and REPORTS_EXPORT, because it leaves the platform as a file. Scoped to the
 * administrator's own association; a super administrator names one, since a
 * statement mixing two associations' members would add up two ledgers.
 *
 * Audited once per download rather than per member, unlike the card batch:
 * this is a summary of positions, not a member's transaction history or a
 * working sign-in code, and the entry records how many members it covered.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission([
    PERMISSIONS.SAVINGS_VIEW_ALL,
    PERMISSIONS.REPORTS_EXPORT,
  ]);

  const params = request.nextUrl.searchParams;
  const associationId = resolveAssociationScope(context, params.get("associationId"));
  if (!associationId) {
    return apiBadRequest("Choose an association to produce its member statement");
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(
    `member-statement:${context.user.id}:${ip}`,
    RATE_LIMITS.EXPORT
  );
  if (!limit.allowed) {
    return apiTooManyRequests("Too many downloads. Please wait.", limit.retryAfter);
  }

  const format = params.get("format") === "csv" ? "csv" : "html";

  const statement = await buildMemberAccountStatement(associationId);
  if (!statement) return apiNotFound("Association not found");

  await recordAudit(
    {
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: "Association",
      entityId: associationId,
      associationId,
      metadata: {
        report: "MEMBER_ACCOUNT_STATEMENT",
        format,
        members: statement.counts.members,
        asOf: statement.asOf.toISOString(),
      },
    },
    context
  );

  const slug = `${statement.association.code.replace(/[^A-Za-z0-9_-]/g, "")}-${statement.asOf
    .toISOString()
    .slice(0, 10)}`;

  if (format === "csv") {
    return new Response(memberAccountStatementToCsv(statement), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="member-accounts-${slug}.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  }

  return new Response(memberAccountStatementToHtml(statement), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Inline so the browser renders it and the officer can print to PDF.
      "Content-Disposition": `inline; filename="member-accounts-${slug}.html"`,
      "Cache-Control": "no-store, private",
    },
  });
});
