import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { provinceLabel } from "@/lib/rwanda";
import { getDashboardCopy } from "@/lib/i18n/server";
import type { DistrictReport } from "@/lib/services/district-report";
import { GrowthImageButton } from "@/components/dashboard/GrowthImageButton";
import { GROWTH_REPORT_NODE_ID } from "@/components/dashboard/GrowthReportCard";

const ENDPOINT = "/api/admin/reports/districts";

/**
 * Savings and registered members by district, with the downloads.
 *
 * Plain links rather than fetches, as with the member statement: the browser
 * handles the download, and the route re-checks every permission.
 */
export async function DistrictReportPanel({
  report,
  canDownload,
}: {
  report: DistrictReport;
  canDownload: boolean;
}) {
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.reports;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">{copy.districtTitle}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
            {copy.districtIntro}
          </p>
        </div>
        {canDownload && report.districts.length > 0 && (
          <div className="flex shrink-0 items-start gap-2">
            <Button asChild size="sm">
              <a href={`${ENDPOINT}?format=pdf`} download>
                <FileText className="size-3.5" aria-hidden="true" />
                {copy.districtDownloadPdf}
              </a>
            </Button>
            <GrowthImageButton targetId={GROWTH_REPORT_NODE_ID} />
            <Button asChild size="sm" variant="outline">
              <a href={`${ENDPOINT}?format=csv`} download>
                <FileSpreadsheet className="size-3.5" aria-hidden="true" />
                {copy.districtDownloadCsv}
              </a>
            </Button>
          </div>
        )}
      </div>

      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.districtColDistrict}</TableHead>
              <TableHead>{copy.districtColProvince}</TableHead>
              <TableHead align="right">{copy.districtColMembers}</TableHead>
              <TableHead align="right">{copy.districtColActive}</TableHead>
              <TableHead align="right">{copy.districtColSavings}</TableHead>
              <TableHead align="right">{copy.districtColAverage}</TableHead>
              {canDownload && <TableHead align="right">{""}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.districts.length === 0 ? (
              <TableEmpty colSpan={canDownload ? 7 : 6}>{copy.districtNone}</TableEmpty>
            ) : (
              report.districts.map((row) => (
                <TableRow key={row.district ?? "none"}>
                  <TableCell className="font-medium">
                    {row.district === null ? (
                      <em className="font-normal text-ink-muted">{copy.districtNotRecorded}</em>
                    ) : (
                      <>
                        {row.district}
                        {!row.recognised && (
                          <span className="ml-1.5 text-xs font-normal text-amber-700">
                            {copy.districtUnrecognised}
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {provinceLabel(row.province, locale)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {row.members}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {row.active}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(row.savings)}
                  </TableCell>
                  <TableCell align="right" tabular className="text-ink-muted">
                    {formatMoney(row.averageSavings)}
                  </TableCell>
                  {canDownload && (
                    <TableCell align="right">
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={`${ENDPOINT}?format=pdf&district=${encodeURIComponent(
                            row.district ?? "none"
                          )}`}
                          download
                        >
                          <Download className="size-3.5" aria-hidden="true" />
                          {copy.districtRowPdf}
                        </a>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
            {report.districts.length > 1 && (
              <TableRow className="font-semibold">
                <TableCell>{d.common.total}</TableCell>
                <TableCell />
                <TableCell align="right" tabular>
                  {report.totals.members}
                </TableCell>
                <TableCell align="right" tabular>
                  {report.totals.active}
                </TableCell>
                <TableCell align="right" tabular>
                  {formatMoney(report.totals.savings)}
                </TableCell>
                <TableCell align="right" tabular>
                  {formatMoney(report.totals.averageSavings)}
                </TableCell>
                {canDownload && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrapper>
    </section>
  );
}
