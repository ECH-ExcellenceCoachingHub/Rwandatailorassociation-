import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { getMemberNotifications } from "@/lib/services/member-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
import { formatDayMonth } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllReadButton } from "@/components/dashboard/MarkAllReadButton";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import type { MemberCopy } from "@/lib/i18n/dashboard/member";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.member.notifications.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<string, string> = {
  INFO: "border-l-primary",
  SUCCESS: "border-l-success",
  WARNING: "border-l-gold",
  CRITICAL: "border-l-red-500",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requireAuth("/dashboard/notifications");
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.notifications;

  const data = await getMemberNotifications(
    context.user.id,
    Math.max(1, Number(params.page) || 1)
  );

  return (
    <div>
      <PageHeader
        title={copy.title}
        description={
          data.unread > 0
            ? fill(copy.unread, { count: data.unread })
            : copy.upToDate
        }
        actions={data.unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      {data.notifications.length === 0 ? (
        <EmptyState icon={Bell} title={copy.noneTitle} description={copy.noneBody} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <ul className="divide-y divide-border">
            {data.notifications.map((notification) => {
              const body = (
                <div
                  className={cn(
                    "border-l-4 px-5 py-4 transition-colors",
                    SEVERITY_STYLES[notification.severity] ?? "border-l-border",
                    notification.readAt ? "bg-surface" : "bg-primary-50/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-heading text-sm",
                          notification.readAt
                            ? "font-medium text-ink"
                            : "font-bold text-ink"
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                        {notification.body}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!notification.readAt && (
                        <span
                          className="size-2 rounded-full bg-primary"
                          aria-label={copy.unreadLabel}
                        />
                      )}
                      <time
                        className="whitespace-nowrap text-xs text-ink-muted"
                        dateTime={notification.createdAt.toISOString()}
                      >
                        {relativeTime(notification.createdAt, copy, locale)}
                      </time>
                    </div>
                  </div>
                </div>
              );

              return (
                <li key={notification.id}>
                  {notification.actionUrl ? (
                    <Link href={notification.actionUrl} className="block hover:bg-ink/[0.02]">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>

          <PaginationLinks
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A notification's age. Translated rather than formatted with Intl.RelativeTime,
 * which has no Kinyarwanda data — and because Kinyarwanda puts the elapsed
 * period after the verb ("hashize iminota 5"), which a fragment cannot express.
 */
function relativeTime(
  date: Date,
  copy: MemberCopy["notifications"],
  locale: Locale
): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return copy.justNow;
  if (seconds < 3600) {
    return fill(copy.minutesAgo, { count: Math.floor(seconds / 60) });
  }
  if (seconds < 86400) {
    return fill(copy.hoursAgo, { count: Math.floor(seconds / 3600) });
  }
  if (seconds < 604800) {
    return fill(copy.daysAgo, { count: Math.floor(seconds / 86400) });
  }

  return formatDayMonth(date, locale);
}
