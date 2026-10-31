import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import { Database, Server, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getSettings } from "@/lib/services/admin-queries";
import { listAssociations } from "@/lib/services/associations";
import { getEnv } from "@/lib/env";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { SettingsTable } from "@/components/dashboard/SettingsTable";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.settings.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  await requireSuperAdmin("/super-admin/settings");
  const { d } = await getDashboardCopy();
  const copy = d.platform.settings;

  /** Hides everything but the host of a connection string. */
  function describeDatabase(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
    } catch {
      return copy.databaseConfigured;
    }
  }

  const [settings, directory] = await Promise.all([
    getSettings("PLATFORM", null),
    listAssociations(),
  ]);

  const env = getEnv();
  const sandbox = env.JENGA_MODE === "sandbox";
  const production = env.NODE_ENV === "production";

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {production && sandbox && (
        <Alert variant="error" title={copy.sandboxInProductionTitle}>
          {copy.sandboxInProductionBody}
        </Alert>
      )}

      <StatGrid columns={4}>
        <StatCard
          label={copy.environment}
          value={env.NODE_ENV}
          hint={env.APP_URL}
          icon={Server}
          tone={production ? "primary" : "default"}
        />
        <StatCard
          label={copy.paymentMode}
          value={sandbox ? copy.sandbox : copy.live}
          hint={sandbox ? copy.simulated : copy.realMoney}
          icon={ShieldCheck}
          tone={sandbox ? "warning" : "success"}
          href="/super-admin/integrations"
        />
        <StatCard
          label={copy.associations}
          value={String(directory.totals.associations)}
          hint={pluralize(copy.membersPlatformWide, directory.totals.members)}
          icon={Database}
          href="/super-admin/associations"
        />
        <StatCard
          label={copy.storedSettings}
          value={String(settings.length)}
          hint={copy.storedSettingsHint}
          icon={SlidersHorizontal}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={Server} title={copy.runtime}>
          <Row label={copy.nodeEnvironment} value={env.NODE_ENV} />
          <Row label={copy.applicationUrl} value={env.APP_URL} mono />
          <Row label={copy.database} value={describeDatabase(env.DATABASE_URL)} mono />
          <Row
            label={copy.paymentProvider}
            value={
              <StatusBadge
                status={sandbox ? "PENDING" : "ACTIVE"}
                label={sandbox ? copy.sandbox : copy.live}
                tone={sandbox ? "warning" : "success"}
                size="sm"
              />
            }
          />
          <Row label={copy.emailProvider} value={env.EMAIL_PROVIDER} />
          <Row label={copy.smsProvider} value={env.SMS_PROVIDER} />
        </Panel>

        <Panel icon={ShieldCheck} title={copy.whereConfigLives}>
          <p className="py-2 text-sm leading-relaxed text-ink-muted">
            {copy.secretsNote}
          </p>
          <p className="py-2 text-sm leading-relaxed text-ink-muted">
            {copy.runtimeRowsNote}{" "}
            <Link
              href="/super-admin/associations"
              className="font-semibold text-primary hover:underline"
            >
              {copy.tenantDirectory}
            </Link>
            .
          </p>
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.platformConfiguration}
        </h2>
        <SettingsTable settings={settings} emptyMessage={copy.noStoredSettings} />
      </section>

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.readOnlyNote}{" "}
        <Link
          href="/super-admin/audit"
          className="font-semibold text-primary hover:underline"
        >
          {copy.auditLog}
        </Link>
        .
      </p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Server;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {title}
      </h2>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        className={`max-w-[55%] break-words text-right text-sm font-medium text-ink ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
