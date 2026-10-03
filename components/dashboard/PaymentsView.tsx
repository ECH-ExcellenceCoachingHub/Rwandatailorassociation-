import Link from "next/link";
import { AlertTriangle, CreditCard, Link2, ShieldAlert } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { listPayments } from "@/lib/services/admin-queries";

/**
 * Inbound provider payments.
 *
 * Read-only by design. Reconciling an unmatched payment is a money-moving
 * action with its own screen and its own permission
 * (`payments.match_manual`) — this one answers "what has arrived, and did it
 * land?" without offering a way to change the answer.
 */
export async function PaymentsView({
  data,
  basePath,
  search,
  status,
  suspiciousOnly,
  unmatchedPath,
  memberPaymentsPath,
}: {
  data: Awaited<ReturnType<typeof listPayments>>;
  basePath: string;
  search?: string;
  status?: string;
  suspiciousOnly?: boolean;
  /// Where the unmatched queue lives, if this role has one.
  unmatchedPath?: string;
  /// Where one member's payment history lives. Clicking a member's name opens
  /// it; without it the name opens their member file.
  memberPaymentsPath?: string;
}) {
  const { d, locale } = await getDashboardCopy();
  const copy = d.views.payments;

  // Values are the PaymentStatus enum; only the labels are translated.
  const statusOptions = [
    { value: "ALL", label: copy.allStatuses },
    { value: "PROCESSED", label: copy.statusProcessed },
    { value: "MATCHED", label: copy.statusMatched },
    { value: "VERIFIED", label: copy.statusVerified },
    { value: "RECEIVED", label: copy.statusReceived },
    { value: "PENDING", label: copy.statusPending },
    { value: "UNMATCHED", label: copy.statusUnmatched },
    { value: "FAILED", label: copy.statusFailed },
    { value: "DUPLICATE", label: copy.statusDuplicate },
    { value: "REJECTED", label: copy.statusRejected },
  ];

  const flagOptions = [
    { value: "ALL", label: copy.allPayments },
    { value: "1", label: copy.suspiciousOnly },
  ];

  const counts = data.statusCounts;
  const unmatched = counts.UNMATCHED ?? 0;
  const failed = counts.FAILED ?? 0;

  return (
    <>
      <StatGrid columns={4}>
        <StatCard
          label={copy.matching}
          value={String(data.total)}
          hint={formatMoney(data.totalAmount)}
          icon={CreditCard}
          tone="primary"
        />
        <StatCard
          label={copy.processed}
          value={String(counts.PROCESSED ?? 0)}
          hint={copy.creditedToMember}
          icon={CreditCard}
          tone="success"
        />
        <StatCard
          label={copy.unmatched}
          value={String(unmatched)}
          hint={unmatched > 0 ? copy.needsAttribution : copy.nothingWaiting}
          icon={Link2}
          tone={unmatched > 0 ? "warning" : "success"}
          href={unmatched > 0 ? unmatchedPath : undefined}
        />
        <StatCard
          label={copy.failed}
          value={String(failed)}
          hint={copy.rejectedAtVerification}
          icon={AlertTriangle}
          tone={failed > 0 ? "danger" : "success"}
        />
      </StatGrid>

      <SearchFilterForm
        action={basePath}
        placeholder={copy.searchPlaceholder}
        search={search}
        selects={[
          {
            name: "status",
            label: d.common.status,
            value: status,
            options: statusOptions,
          },
          {
            name: "flagged",
            label: copy.flagged,
            value: suspiciousOnly ? "1" : "ALL",
            options: flagOptions,
            width: "lg:w-44",
          },
        ]}
      />

      {data.payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colPayment}</TableHead>
                <TableHead>{copy.colPayer}</TableHead>
                <TableHead>{copy.colCreditedTo}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead>{copy.colReceived}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <span className="block font-mono text-xs text-ink">
                      {payment.externalTransactionId.slice(0, 26)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">
                      {payment.provider} ·{" "}
                      {payment.channel.replace(/_/g, " ").toLowerCase()}
                    </span>
                    {payment.isSuspicious && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
                        <ShieldAlert className="size-3" aria-hidden="true" />
                        {payment.suspicionReason ?? copy.flaggedSuspicious}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="max-w-[220px] text-sm">
                    <span className="block truncate text-ink">
                      {payment.payerName ?? "—"}
                    </span>
                    {payment.payerPhone && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {payment.payerPhone}
                      </span>
                    )}
                    {payment.narration && (
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted/80">
                        {payment.narration}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm">
                    {payment.memberId ? (
                      <>
                        <Link
                          href={
                            memberPaymentsPath
                              ? `${memberPaymentsPath}/${payment.memberId}`
                              : `/admin/members/${payment.memberId}`
                          }
                          className="block font-medium text-ink hover:text-primary"
                        >
                          {payment.memberName}
                        </Link>
                        <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                          {payment.memberNumber}
                          {payment.matchStrategy !== "NONE" && (
                            <> · {payment.matchConfidence}%</>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">{copy.notAttributed}</span>
                    )}
                  </TableCell>

                  <TableCell align="right" tabular>
                    {formatMoney(payment.amount, {
                      currency: payment.currency,
                      showSymbol: false,
                    })}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(payment.transactionDate, locale)}
                    {!payment.verified && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-amber-700">
                        {copy.unverified}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={payment.status} size="sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationLinks
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </TableWrapper>
      )}
    </>
  );
}
