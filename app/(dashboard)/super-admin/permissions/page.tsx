import type { Metadata } from "next";
import { Check, KeyRound, Minus, ShieldAlert, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getPermissionMatrix } from "@/lib/services/admin-queries";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
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
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.permissions.title,
  };
}

export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["MEMBER", "ADMIN", "SUPER_ADMIN"];

export default async function PlatformPermissionsPage() {
  await requireSuperAdmin("/super-admin/permissions");
  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.permissions;

  const roleLabel: Record<UserRole, string> = {
    MEMBER: copy.roleMember,
    ADMIN: copy.roleAdmin,
    SUPER_ADMIN: copy.roleSuperAdmin,
  };

  const { permissions, overrides } = await getPermissionMatrix();

  // The catalogue in code is the intended state; the table is what is being
  // enforced. A permission defined in code but absent from the database is
  // never granted to anyone, which is worth saying out loud.
  const stored = new Set(permissions.map((p) => p.code));
  const missing = ALL_PERMISSIONS.filter((code) => !stored.has(code));

  const byCategory = new Map<string, typeof permissions>();
  for (const permission of permissions) {
    const list = byCategory.get(permission.category) ?? [];
    list.push(permission);
    byCategory.set(permission.category, list);
  }

  const activeOverrides = overrides.filter((o) => !o.expired);
  const revocations = activeOverrides.filter((o) => !o.granted);

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid columns={4}>
        <StatCard
          label={copy.count}
          value={String(permissions.length)}
          hint={pluralize(copy.categories, byCategory.size)}
          icon={KeyRound}
          tone="primary"
        />
        <StatCard
          label={copy.activeOverrides}
          value={String(activeOverrides.length)}
          hint={copy.activeOverridesHint}
          icon={Users}
          tone={activeOverrides.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.revocations}
          value={String(revocations.length)}
          hint={copy.revocationsHint}
          icon={ShieldAlert}
          tone={revocations.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label={copy.notInDatabase}
          value={String(missing.length)}
          hint={missing.length > 0 ? copy.notInDatabaseHint : copy.inSync}
          icon={ShieldAlert}
          tone={missing.length > 0 ? "danger" : "success"}
        />
      </StatGrid>

      {missing.length > 0 && (
        <Alert variant="warning" title={copy.outOfSyncTitle}>
          {pluralize(copy.outOfSyncBody, missing.length, {
            codes: missing.join(", "),
          })}
        </Alert>
      )}

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.roleMatrix}
        </h2>
        <div className="space-y-5">
          {[...byCategory.entries()].map(([category, rows]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {category}
              </h3>
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.permission}</TableHead>
                      {ROLES.map((role) => (
                        <TableHead key={role} align="center">
                          {roleLabel[role]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((permission) => (
                      <TableRow key={permission.id}>
                        <TableCell>
                          <span className="block font-medium text-ink">
                            {permission.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                            {permission.code}
                          </span>
                          {permission.description && (
                            <span className="mt-1 block max-w-lg text-xs text-ink-muted">
                              {permission.description}
                            </span>
                          )}
                        </TableCell>
                        {ROLES.map((role) => (
                          <TableCell key={role} align="center">
                            {permission.roles.includes(role) ? (
                              <span
                                className="inline-flex size-6 items-center justify-center rounded-full bg-success/10 text-success"
                                title={fill(copy.holdsByDefault, {
                                  role: roleLabel[role],
                                })}
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{copy.granted}</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex size-6 items-center justify-center rounded-full bg-ink/[0.05] text-ink-muted"
                                title={fill(copy.doesNotHold, {
                                  role: roleLabel[role],
                                })}
                              >
                                <Minus className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{copy.notGranted}</span>
                              </span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.individualOverrides}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colPerson}</TableHead>
                <TableHead>{copy.permission}</TableHead>
                <TableHead>{copy.colEffect}</TableHead>
                <TableHead>{copy.colExpires}</TableHead>
                <TableHead>{copy.colGranted}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.length === 0 ? (
                <TableEmpty colSpan={5}>{copy.noOverrides}</TableEmpty>
              ) : (
                overrides.map((override) => (
                  <TableRow key={override.id}>
                    <TableCell>
                      <span className="block font-medium text-ink">
                        {override.userName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                        <StatusBadge status={override.userRole} size="sm" />
                        {override.associationName ?? copy.platformWide}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="block text-sm text-ink">
                        {override.permissionName}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                        {override.code}
                      </span>
                    </TableCell>

                    <TableCell>
                      <StatusBadge
                        status={override.granted ? "APPROVED" : "REJECTED"}
                        label={override.granted ? copy.granted : copy.revoked}
                        size="sm"
                      />
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {override.expiresAt
                        ? formatDate(override.expiresAt, locale)
                        : copy.never}
                      {override.expired && (
                        <span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">
                          {copy.expired}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {formatDate(override.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.revocationsWinNote}
      </p>
    </div>
  );
}
