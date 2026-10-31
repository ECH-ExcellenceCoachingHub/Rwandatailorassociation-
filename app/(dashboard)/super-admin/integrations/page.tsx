import type { Metadata } from "next";
import Link from "@/components/SiteLink";
import {
  CreditCard,
  Link2,
  Mail,
  MessageSquare,
  ShieldAlert,
  Webhook,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getIntegrationHealth } from "@/lib/services/admin-queries";
import { getEnv } from "@/lib/env";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDateTime } from "@/lib/i18n/dates";
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

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.platform.integrations.title,
  };
}

export const dynamic = "force-dynamic";

export default async function PlatformIntegrationsPage() {
  await requireSuperAdmin("/super-admin/integrations");
  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.integrations;

  const when = (value: Date | null) =>
    value ? formatDateTime(value, locale) : copy.never;

  const [health, env] = await Promise.all([
    getIntegrationHealth(),
    Promise.resolve(getEnv()),
  ]);

  // Only ever whether a credential is present — never the value itself.
  const jengaCredentials = [
    { label: copy.credentialApiKey, set: Boolean(env.JENGA_API_KEY) },
    { label: copy.credentialMerchantCode, set: Boolean(env.JENGA_MERCHANT_CODE) },
    {
      label: copy.credentialConsumerSecret,
      set: Boolean(env.JENGA_CONSUMER_SECRET),
    },
    { label: copy.credentialAccount, set: Boolean(env.JENGA_ACCOUNT_NUMBER) },
    {
      label: copy.credentialSigningKey,
      set: Boolean(env.JENGA_PRIVATE_KEY_PATH || env.JENGA_PRIVATE_KEY_BASE64),
    },
    { label: copy.credentialWebhookSecret, set: Boolean(env.JENGA_WEBHOOK_SECRET) },
  ];

  const missingCredentials = jengaCredentials.filter((c) => !c.set);
  const sandbox = env.JENGA_MODE === "sandbox";

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {sandbox && (
        <Alert variant="warning" title={copy.sandboxTitle}>
          {copy.sandboxBody}
        </Alert>
      )}

      {!sandbox && missingCredentials.length > 0 && (
        <Alert variant="error" title={copy.missingCredentialsTitle}>
          {fill(copy.missingCredentialsBody, {
            items: missingCredentials.map((c) => c.label).join(", "),
          })}
        </Alert>
      )}

      {health.unverifiedPayments > 0 && (
        <Alert variant="warning" title={copy.unverifiedTitle}>
          {pluralize(copy.unverifiedBody, health.unverifiedPayments)}
        </Alert>
      )}

      <StatGrid columns={4}>
        <StatCard
          label={copy.paymentsCaptured}
          value={String(
            Object.values(health.paymentStatus).reduce((sum, n) => sum + n, 0)
          )}
          hint={fill(copy.lastPayment, { when: when(health.lastPaymentAt) })}
          icon={CreditCard}
          tone="primary"
        />
        <StatCard
          label={copy.awaitingAttribution}
          value={String(health.paymentStatus.UNMATCHED ?? 0)}
          hint={copy.awaitingHint}
          icon={Link2}
          tone={(health.paymentStatus.UNMATCHED ?? 0) > 0 ? "warning" : "success"}
          href="/super-admin/payments?status=UNMATCHED"
        />
        <StatCard
          label={copy.flaggedPayments}
          value={String(health.suspiciousPayments)}
          hint={copy.flaggedHint}
          icon={ShieldAlert}
          tone={health.suspiciousPayments > 0 ? "danger" : "success"}
        />
        <StatCard
          label={copy.failedMessages}
          value={String(health.failedDeliveries24h)}
          hint={
            health.failedDeliveries24h > 0
              ? copy.membersNotReached
              : copy.allDelivered
          }
          icon={MessageSquare}
          tone={health.failedDeliveries24h > 0 ? "danger" : "success"}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={CreditCard}
          title="Jenga / Equity"
          badge={
            <StatusBadge
              status={sandbox ? "PENDING" : "ACTIVE"}
              label={sandbox ? copy.sandbox : copy.live}
              tone={sandbox ? "warning" : "success"}
              size="sm"
            />
          }
        >
          <Row label={copy.mode} value={env.JENGA_MODE} />
          <Row label={copy.baseUrl} value={env.JENGA_API_BASE_URL} mono />
          <Row label={copy.country} value={env.JENGA_COUNTRY_CODE} />
          <Row label={copy.lastPaymentLabel} value={when(health.lastPaymentAt)} />
          <Row
            label={copy.provider}
            value={health.lastPaymentProvider ?? copy.noPayments}
          />
        </Panel>

        <Panel icon={Webhook} title={copy.credentials}>
          {jengaCredentials.map((credential) => (
            <Row
              key={credential.label}
              label={credential.label}
              value={
                <StatusBadge
                  status={credential.set ? "VERIFIED" : "UNVERIFIED"}
                  label={credential.set ? copy.configured : copy.notSet}
                  size="sm"
                />
              }
            />
          ))}
        </Panel>

        <Panel icon={Webhook} title={copy.howPaymentsArrive}>
          <Row
            label={copy.viaWebhook}
            value={String(health.ingestSource.WEBHOOK ?? 0)}
          />
          <Row label={copy.viaPolling} value={String(health.ingestSource.POLL ?? 0)} />
          <Row
            label={copy.enteredManually}
            value={String(health.ingestSource.MANUAL ?? 0)}
          />
          <Row
            label={copy.lastWebhook}
            value={when(health.lastWebhookAt)}
            hint={copy.webhookHint}
          />
        </Panel>

        <Panel icon={Mail} title={copy.messaging}>
          <Row label={copy.emailProvider} value={env.EMAIL_PROVIDER} />
          <Row label={copy.emailFrom} value={env.EMAIL_FROM} />
          <Row
            label={copy.smtpHost}
            value={
              env.SMTP_HOST ??
              (env.EMAIL_PROVIDER === "log" ? copy.loggingOnly : copy.notSet)
            }
            mono
          />
          <Row label={copy.smsProvider} value={env.SMS_PROVIDER} />
          <Row label={copy.smsSenderId} value={env.SMS_SENDER_ID} />
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.deliveryByChannel}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colChannel}</TableHead>
                <TableHead align="right">{copy.colDelivered}</TableHead>
                <TableHead align="right">{copy.colPending}</TableHead>
                <TableHead align="right">{copy.colFailed}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.channels.length === 0 ? (
                <TableEmpty colSpan={4}>{copy.noMessages}</TableEmpty>
              ) : (
                health.channels.map((channel) => (
                  <TableRow key={channel.channel}>
                    <TableCell className="font-medium text-ink">
                      {channel.channel}
                    </TableCell>
                    <TableCell align="right" tabular className="text-emerald-700">
                      {channel.sent}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {channel.pending}
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span className={channel.failed > 0 ? "text-red-600" : ""}>
                        {channel.failed}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {copy.recentReconciliation}
          </h2>
          <Link
            href="/super-admin/jobs"
            className="text-sm font-semibold text-primary hover:underline"
          >
            {copy.allJobs}
          </Link>
        </div>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colJob}</TableHead>
                <TableHead>{copy.colStarted}</TableHead>
                <TableHead align="right">{copy.colProcessed}</TableHead>
                <TableHead align="right">{copy.colFailed}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.reconciliationRuns.length === 0 ? (
                <TableEmpty colSpan={5}>{copy.neverReconciled}</TableEmpty>
              ) : (
                health.reconciliationRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium text-ink">
                      {run.jobName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {when(run.startedAt)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {run.itemsProcessed}
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span className={run.itemsFailed > 0 ? "text-red-600" : ""}>
                        {run.itemsFailed}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} size="sm" />
                      {run.errorMessage && (
                        <span className="mt-1 block max-w-[240px] truncate text-[11px] text-red-600">
                          {run.errorMessage}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: typeof CreditCard;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {title}
        {badge && <span className="ml-auto">{badge}</span>}
      </h2>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">
        {label}
        {hint && (
          <span className="mt-0.5 block text-[11px] text-ink-muted/80">{hint}</span>
        )}
      </dt>
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
