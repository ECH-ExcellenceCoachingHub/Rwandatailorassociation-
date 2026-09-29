import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, EyeOff, Mail, MessageSquare, Smartphone } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getSentNotification } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDateTime } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.notifications.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

/** See the list page: event names stay in English to match the audit log. */
function humanise(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * One notification as the member experienced it: the in-app message and
 * whether they opened it, then the exact email and SMS text with what the
 * provider said about each.
 */
export default async function AdminNotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePermission(
    PERMISSIONS.NOTIFICATIONS_SEND,
    `/admin/notifications/${id}`
  );
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.notifications;

  // Scoped by association inside the query, so another association's id
  // is simply not found.
  const notification = await getSentNotification(associationId, id);
  if (!notification) notFound();

  const when = (value: Date | null) => formatDateTime(value, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={notification.title}
        description={`${notification.recipient}${
          notification.memberNumber ? ` · ${notification.memberNumber}` : ""
        } · ${humanise(notification.eventType)} · ${when(notification.createdAt)}`}
        actions={
          <>
            {notification.memberId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/members/${notification.memberId}`}>
                  {copy.memberProfile}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/notifications">{copy.back}</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4" aria-hidden="true" />
            {copy.inApp}
          </CardTitle>
          <CardDescription>{copy.inAppHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={notification.severity} size="sm" />
            <span
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                notification.readAt ? "text-emerald-700" : "text-ink-muted"
              }`}
            >
              {notification.readAt ? (
                <Eye className="size-4" aria-hidden="true" />
              ) : (
                <EyeOff className="size-4" aria-hidden="true" />
              )}
              {notification.readAt
                ? fill(copy.openedAt, { date: when(notification.readAt) })
                : copy.notOpened}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="font-medium text-ink">{notification.title}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">
              {notification.body}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden="true" />
            {copy.externalTitle}
          </CardTitle>
          <CardDescription>{copy.externalHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notification.deliveries.length === 0 ? (
            <p className="text-sm text-ink-muted">{copy.noExternal}</p>
          ) : (
            notification.deliveries.map((delivery) => {
              const Icon = delivery.channel === "EMAIL" ? Mail : MessageSquare;
              const channelLabel =
                delivery.channel === "EMAIL"
                  ? copy.channelEMAIL
                  : delivery.channel === "SMS"
                    ? copy.channelSMS
                    : delivery.channel;

              const facts: [string, string][] = [
                [copy.to, delivery.destination ?? "—"],
                [copy.provider, delivery.provider ?? "—"],
                [copy.attempts, String(delivery.attempts)],
                [copy.queuedAt, when(delivery.createdAt)],
                [copy.sentAt, when(delivery.sentAt)],
              ];
              if (delivery.deliveredAt) {
                facts.push([copy.deliveredAt, when(delivery.deliveredAt)]);
              }
              if (delivery.nextRetryAt) {
                facts.push([copy.nextRetry, when(delivery.nextRetryAt)]);
              }
              if (delivery.providerMessageId) {
                facts.push([copy.providerId, delivery.providerMessageId]);
              }

              return (
                <section
                  key={delivery.id}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="size-4 text-ink-muted" aria-hidden="true" />
                    <span className="font-semibold text-ink">{channelLabel}</span>
                    <StatusBadge status={delivery.status} size="sm" />
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {facts.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-ink-muted">{label}</dt>
                        <dd className="break-words text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {delivery.errorMessage && (
                    <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      <span className="font-semibold">{copy.error}: </span>
                      {delivery.errorMessage}
                    </p>
                  )}

                  {/* A skipped delivery sent nothing, so there is no text
                      to show — the reason is in the error above. */}
                  {delivery.status !== "SKIPPED" && (
                  <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4">
                    {delivery.subject && (
                      <p className="mb-2 text-sm">
                        <span className="text-ink-muted">{copy.subject}: </span>
                        <span className="font-medium text-ink">{delivery.subject}</span>
                      </p>
                    )}
                    {delivery.content ? (
                      <p className="whitespace-pre-line break-words text-sm text-ink">
                        {delivery.content}
                      </p>
                    ) : (
                      <p className="text-sm text-ink-muted">{copy.noContent}</p>
                    )}
                  </div>
                  )}

                  {delivery.status !== "SKIPPED" &&
                    delivery.reconstructed &&
                    delivery.content && (
                    <p className="mt-2 text-xs text-amber-700">{copy.reconstructed}</p>
                  )}
                </section>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
