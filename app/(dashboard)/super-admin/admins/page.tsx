import type { Metadata } from "next";
import { KeyRound, Lock, ShieldCheck, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listAdminUsers } from "@/lib/services/admin-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchFilterForm } from "@/components/dashboard/SearchFilterForm";
import { PaginationLinks } from "@/components/dashboard/PaginationLinks";
import { parsePage, parseUserRole, parseUserStatus } from "@/lib/validation/filters";
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
    title: d.platform.admins.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; role?: string; status?: string }>;
}) {
  await requireSuperAdmin("/super-admin/admins");
  const params = await searchParams;

  const search = params.q?.trim() || undefined;
  const role = parseUserRole(params.role);
  const status = parseUserStatus(params.status);

  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.admins;

  // Values are the enums the database stores; only the labels are translated.
  const roleOptions = [
    { value: "ALL", label: copy.allRoles },
    { value: "ADMIN", label: copy.associationAdmin },
    { value: "SUPER_ADMIN", label: copy.superAdmin },
  ];

  const statusOptions = [
    { value: "ALL", label: copy.allStatuses },
    { value: "ACTIVE", label: copy.statusActive },
    { value: "SUSPENDED", label: copy.statusSuspended },
    { value: "LOCKED", label: copy.statusLocked },
    { value: "DISABLED", label: copy.statusDisabled },
    { value: "PENDING_VERIFICATION", label: copy.statusPending },
  ];

  // null scope = every association, plus super admins who belong to none.
  const data = await listAdminUsers(null, {
    page: parsePage(params.page),
    search,
    role,
    status,
  });

  const active = data.admins.filter((a) => a.status === "ACTIVE").length;
  const locked = data.admins.filter((a) => a.locked).length;
  const withOverrides = data.admins.filter((a) => a.overrideCount > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.count}
          value={String(data.total)}
          hint={copy.matchingFilter}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label={copy.activeOnPage}
          value={String(active)}
          hint={copy.activeHint}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label={copy.lockedOut}
          value={String(locked)}
          hint={locked > 0 ? copy.lockoutInForce : copy.noLockouts}
          icon={Lock}
          tone={locked > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.withOverrides}
          value={String(withOverrides)}
          hint={copy.overridesHint}
          icon={KeyRound}
          href="/super-admin/permissions"
        />
      </StatGrid>

      <SearchFilterForm
        action="/super-admin/admins"
        placeholder={copy.searchPlaceholder}
        search={search}
        selects={[
          { name: "role", label: copy.role, value: role, options: roleOptions },
          {
            name: "status",
            label: d.common.status,
            value: status,
            options: statusOptions,
          },
        ]}
      />

      {data.admins.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colAdministrator}</TableHead>
                <TableHead>{copy.colAssociation}</TableHead>
                <TableHead>{copy.role}</TableHead>
                <TableHead>{d.common.status}</TableHead>
                <TableHead>{copy.colSecurity}</TableHead>
                <TableHead>{copy.colLastSignIn}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>
                    <span className="block font-medium text-ink">
                      {admin.fullName}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {admin.email ?? admin.phone ?? copy.noContact}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm">
                    {admin.associationName ? (
                      <>
                        <span className="block text-ink">{admin.associationName}</span>
                        <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                          {admin.associationCode}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">{copy.platformWide}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={admin.role} size="sm" />
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={admin.status} size="sm" />
                    {admin.locked && (
                      <span className="mt-1 block text-[11px] font-semibold text-amber-700">
                        {copy.lockedLabel}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-ink-muted">
                    <span className="block">
                      {admin.twoFactorEnabled ? copy.twoFactorOn : copy.twoFactorOff}
                    </span>
                    {admin.mustChangePassword && (
                      <span className="mt-0.5 block font-semibold text-amber-700">
                        {copy.mustChangePassword}
                      </span>
                    )}
                    {admin.overrideCount > 0 && (
                      <span className="mt-0.5 block">
                        {pluralize(copy.overrideCount, admin.overrideCount)}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {admin.lastLoginAt
                      ? formatDate(admin.lastLoginAt, locale)
                      : copy.never}
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
