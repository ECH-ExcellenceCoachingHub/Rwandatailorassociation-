import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck, Send, TriangleAlert } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listSentNotifications } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import { parsePage } from "@/lib/validation/filters";
import { NotificationStatus } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.notifications.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

/**
 * Turns "PAYMENT_RECEIVED" into "Payment received".
 *
 * Left in English in both languages: these are the event names the ledger and
 * the audit log use, and an administrator matching a notification to an audit
 * entry needs the two to read the same.
 */
function humanise(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    eventType?: string;
    q?: string;
    delivery?: string;
    read?: string;
    member?: string;
  }>;
}) {
  const context = await requirePermission(
    PERMISSIONS.NOTIFICATIONS_SEND,
    "/admin/notifications"
  );
  const associationId = resolveAssociationScope(context);
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.notifications;

  const deliveryStatus = Object.values(NotificationStatus).find(
    (status) => status === params.delivery
  );

  const data = await listSentNotifications(associationId, {
    page: parsePage(params.page),
    eventType: params.eventType && params.eventType !== "ALL" ? params.eventType : undefined,
    search: params.q,
    memberId: params.member || undefined,
    deliveryStatus,
    read: params.read === "READ" ? true : params.read === "UNREAD" ? false : undefined,
  });

  const failed = data.deliveryStatus.FAILED ?? 0;
  const sent = data.deliveryStatus.SENT ?? 0;
  const delivered = data.deliveryStatus.DELIVERED ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.sent}
          value={String(data.total)}
          hint={fill(copy.notYetRead, { count: data.unread })}
          icon={Bell}
          tone="primary"
        />
        <StatCard
          label={copy.delivered}
          value={String(delivered)}
          hint={copy.deliveredHint}
          icon={CheckCheck}
          tone="success"
        />
        <StatCard
          label={copy.handedOver}
          value={String(sent)}
          hint={copy.handedOverHint}
          icon={Send}
        />
        <StatCard
          label={copy.failed}
          value={String(failed)}
          hint={failed > 0 ? copy.failedHint : copy.noFailures}
          icon={TriangleAlert}
          tone={failed > 0 ? "danger" : "success"}
        />
      </StatGrid>

      {params.member && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-ink">
          <span>{copy.forMember}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/notifications">{copy.clearMember}</Link>
          </Button>
        </div>
      )}

      <SearchFilterForm
        action="/admin/notifications"
        search={params.q ?? ""}
        searchLabel={copy.searchLabel}
        placeholder={copy.searchPlaceholder}
        hidden={{ member: params.member }}
        selects={[
          {
            name: "eventType",
            label: copy.event,
            value: params.eventType,
            options: [
              { value: "ALL", label: copy.allEvents },
              ...data.eventTypes.map((e) => ({
                value: e.eventType,
                label: `${humanise(e.eventType)} (${e.count})`,
              })),
            ],
            width: "lg:w-72",
          },
          {
            name: "delivery",
            label: copy.deliveryFilter,
            value: deliveryStatus,
            options: [
              { value: "ALL", label: copy.allDeliveries },
              ...(["SENT", "DELIVERED", "FAILED", "PENDING", "SKIPPED"] as const).map(
                (status) => ({ value: status, label: d.status[status] })
              ),
            ],
          },
          {
            name: "read",
            label: copy.readFilter,
            value: params.read,
            options: [
              { value: "ALL", label: copy.anyRead },
              { value: "READ", label: copy.read },
              { value: "UNREAD", label: copy.unread },
            ],
            width: "lg:w-44",
          },
        ]}
      />

      {data.notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colRecipient}</TableHead>
                <TableHead>{copy.colMessage}</TableHead>
                <TableHead>{copy.event}</TableHead>
                <TableHead>{copy.colDelivery}</TableHead>
                <TableHead>{copy.colSent}</TableHead>
                <TableHead>{copy.colRead}</TableHead>
                <TableHead>
                  <span className="sr-only">{copy.view}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.notifications.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell>
                    <span className="block font-medium text-ink">
                      {notification.recipient}
                    </span>
                    {notification.memberNumber && (
                      <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                        {notification.memberNumber}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="max-w-md">
                    <span className="block font-medium text-ink">
                      {notification.title}
                    </span>
                    <details className="group mt-1">
                      <summary className="cursor-pointer list-none text-xs text-ink-muted">
                        <span className="block truncate group-open:hidden">
                          {notification.body}
                        </span>
                        <span className="mt-0.5 block font-semibold text-primary hover:underline">
                          {copy.showFull}
                        </span>
                      </summary>

                      <div className="mt-2 space-y-3 text-xs">
                        <div>
                          <p className="font-semibold uppercase text-ink-muted">
                            {copy.inApp}
                          </p>
                          <p className="mt-1 whitespace-pre-line break-words text-ink">
                            {notification.body}
                          </p>
                        </div>

                        {notification.deliveries
                          .filter((delivery) => delivery.content)
                          .map((delivery, index) => (
                            <div key={`${notification.id}-copy-${index}`}>
                              <p className="font-semibold uppercase text-ink-muted">
                                {delivery.channel === "EMAIL"
                                  ? copy.channelEMAIL
                                  : copy.channelSMS}
                              </p>
                              {delivery.subject && (
                                <p className="mt-1 font-medium text-ink">
                                  {copy.subject}: {delivery.subject}
                                </p>
                              )}
                              <p className="mt-1 whitespace-pre-line break-words rounded-lg bg-surface-muted p-2 text-ink">
                                {delivery.content}
                              </p>
                              {delivery.reconstructed && (
                                <p className="mt-1 text-amber-700">{copy.reconstructed}</p>
                              )}
                            </div>
                          ))}
                      </div>
                    </details>
                  </TableCell>

                  <TableCell>
                    <span className="block text-xs text-ink-muted">
                      {humanise(notification.eventType)}
                    </span>
                    <StatusBadge
                      status={notification.severity}
                      size="sm"
                      className="mt-1"
                    />
                  </TableCell>

                  <TableCell>
                    {notification.deliveries.length === 0 ? (
                      <span className="text-xs text-ink-muted">{copy.inAppOnly}</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {notification.deliveries.map((delivery, index) => (
                          <span
                            key={`${notification.id}-${delivery.channel}-${index}`}
                            className="flex items-center gap-1.5 text-[11px]"
                          >
                            <span className="font-semibold uppercase text-ink-muted">
                              {delivery.channel}
                            </span>
                            <StatusBadge status={delivery.status} size="sm" />
                          </span>
                        ))}
                        {notification.deliveries
                          .filter((d) => d.errorMessage)
                          .map((d, index) => (
                            <span
                              key={`${notification.id}-err-${index}`}
                              className="max-w-[200px] truncate text-[11px] text-red-600"
                            >
                              {d.errorMessage}
                            </span>
                          ))}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(notification.createdAt, locale)}
                  </TableCell>

                  <TableCell>
                    <span
                      className={`text-xs font-semibold ${
                        notification.read ? "text-emerald-700" : "text-ink-muted"
                      }`}
                    >
                      {notification.read ? copy.read : copy.unread}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/admin/notifications/${notification.id}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {copy.view}
                    </Link>
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
    </div>
  );
}
