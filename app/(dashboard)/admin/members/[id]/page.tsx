import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  HandCoins,
  Pencil,
  PiggyBank,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  assertSameAssociation,
  requirePermission,
  resolveAssociationScope,
} from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getMemberProfile } from "@/lib/services/members";
import { getMemberTransactions } from "@/lib/services/member-queries";
import { add, formatMoney, subtract } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
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

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const member = await getMemberProfile(id);
  return {
    title: member
      ? `${member.user.firstName} ${member.user.lastName} | RTA`
      : "Member | RTA",
  };
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePermission(
    PERMISSIONS.MEMBERS_VIEW,
    `/admin/members/${id}`
  );

  const member = await getMemberProfile(id);
  if (!member) notFound();

  // The id came from the URL, so tenant isolation is asserted after loading
  // rather than assumed: an admin of association A must not be able to read a
  // member of association B by guessing a cuid.
  assertSameAssociation(context, member, "Member");

  // Resolving the scope has no filtering role here — the assertion above did
  // the work — but calling it keeps the cross-tenant audit trail consistent
  // with every other admin screen.
  resolveAssociationScope(context, member.associationId);

  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.file;
  const field = d.forms.field;
  const app = d.forms.application;
  const date = (value: Date | null | undefined) => formatDate(value, locale);

  // Null is "never asked", which must not read as "no".
  const interns =
    member.acceptsInterns === null
      ? "—"
      : member.acceptsInterns
        ? member.internCapacity
          ? `${d.common.yes} (${member.internCapacity})`
          : d.common.yes
        : d.common.no;

  const account = member.savingsAccounts[0] ?? null;
  const recent = await getMemberTransactions(member.id, { pageSize: 15 });

  const outstanding = member.loans.reduce(
    (total, loan) => add(total, subtract(loan.totalPayable, loan.totalPaid)),
    add(0)
  );
  const overdueLoans = member.loans.filter((loan) => loan.daysOverdue > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${member.user.firstName} ${member.user.lastName}`.trim()}
        description={fill(copy.description, {
          number: member.memberNumber,
          reference: member.paymentReference,
        })}
        actions={
          <>
            {context.permissions.has(PERMISSIONS.MEMBERS_UPDATE) && (
              <Button asChild size="sm">
                <Link href={`/admin/members/${member.id}/edit`}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  {copy.editDetails}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/members">{d.admin.members.backToRegister}</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={member.status} />
        <StatusBadge status={member.kycStatus} />
        <StatusBadge status={member.user.status} />
        {member.suspensionReason && (
          <span className="text-sm text-red-600">
            {fill(copy.suspendedReason, { reason: member.suspensionReason })}
          </span>
        )}
      </div>

      <StatGrid columns={4}>
        <StatCard
          label={copy.savingsBalance}
          value={account ? formatMoney(account.balance) : "—"}
          hint={
            account
              ? fill(copy.accountNumber, { number: account.accountNumber })
              : copy.noAccount
          }
          icon={PiggyBank}
          tone="primary"
        />
        <StatCard
          label={copy.available}
          value={
            account
              ? formatMoney(subtract(account.balance, account.lockedBalance))
              : "—"
          }
          hint={
            account
              ? fill(copy.locked, { amount: formatMoney(account.lockedBalance) })
              : copy.nothingToWithdraw
          }
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label={copy.loansOwing}
          value={formatMoney(outstanding)}
          hint={pluralize(copy.loansOnFile, member.loans.length)}
          icon={HandCoins}
        />
        <StatCard
          label={copy.overdueLoans}
          value={String(overdueLoans.length)}
          hint={overdueLoans.length > 0 ? copy.inArrears : copy.upToDate}
          icon={AlertTriangle}
          tone={overdueLoans.length > 0 ? "danger" : "success"}
        />
      </StatGrid>

      {(member.user.avatar || member.successorPhoto) && (
        <div className="flex flex-wrap gap-8 rounded-2xl border border-border bg-surface p-5 shadow-card">
          {/*
            The faces on the file. The successor's is here because the
            warehouse counter has to recognise whoever turns up to collect in
            the member's place, and a name alone does not let them.
          */}
          {member.user.avatar && (
            <FaceOnFile
              label={app.photo}
              src={`/api/admin/members/${member.id}/photo`}
              caption={`${member.user.firstName} ${member.user.lastName}`.trim()}
            />
          )}
          {member.successorPhoto && (
            <FaceOnFile
              label={app.successorPhoto}
              src={`/api/admin/members/${member.id}/photo?of=successor`}
              caption={member.successorName ?? undefined}
            />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={UserRound} title={copy.memberFile}>
          <Row label={copy.memberNumber} value={member.memberNumber} mono />
          <Row label={copy.paymentReference} value={member.paymentReference} mono />
          <Row label={field.nationalId} value={member.nationalId ?? "—"} mono />
          <Row label={field.dateOfBirth} value={date(member.dateOfBirth)} />
          <Row label={field.occupation} value={member.occupation ?? "—"} />
          <Row label={copy.business} value={member.businessName ?? "—"} />
          <Row label={app.shares} value={member.sharesSubscribed ?? "—"} />
          <Row
            label={app.hasCompany}
            value={
              member.hasCompany === null
                ? "—"
                : member.hasCompany
                  ? d.common.yes
                  : d.common.no
            }
          />
          <Row label={app.acceptsInterns} value={interns} />
          <Row
            label={app.certificate}
            value={
              member.hasProfessionalCertificate === null
                ? "—"
                : member.hasProfessionalCertificate
                  ? d.common.yes
                  : d.common.no
            }
          />
          <Row label={field.district} value={member.district ?? "—"} />
          <Row label={field.province} value={member.province ?? "—"} />
          <Row
            label={field.address}
            value={
              [member.addressLine1, member.city].filter(Boolean).join(", ") || "—"
            }
          />
          <Row label={copy.joined} value={date(member.joinedAt ?? member.createdAt)} />
          <Row label={copy.approvedOn} value={date(member.approvedAt)} />
        </Panel>

        <Panel icon={ShieldCheck} title={copy.contactAccess}>
          <Row label={d.common.email} value={member.user.email ?? "—"} />
          <Row
            label={copy.emailVerified}
            value={member.user.emailVerifiedAt ? d.common.yes : d.common.no}
          />
          <Row label={d.common.phone} value={member.user.phone ?? "—"} />
          <Row
            label={copy.phoneVerified}
            value={member.user.phoneVerifiedAt ? d.common.yes : d.common.no}
          />
          <Row label={copy.mobileMoney} value={member.mobileMoneyNumber ?? "—"} mono />
          <Row label={copy.bankAccount} value={member.bankAccountNumber ?? "—"} mono />
          <Row label={copy.lastSignIn} value={date(member.user.lastLoginAt)} />
          <Row label={copy.nextOfKin} value={member.nextOfKinName ?? "—"} />
          <Row label={copy.theirPhone} value={member.nextOfKinPhone ?? "—"} />
          <Row
            label={app.successor}
            value={
              [
                member.successorName,
                member.successorRelation && `(${member.successorRelation})`,
              ]
                .filter(Boolean)
                .join(" ") || "—"
            }
          />
          <Row label={copy.theirPhone} value={member.successorPhone ?? "—"} />
          <Row
            label={app.successorNationalId}
            value={member.successorNationalId ?? "—"}
            mono
          />
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.loans}
        </h2>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead align="right">{copy.colPrincipal}</TableHead>
                <TableHead align="right">{copy.colPayable}</TableHead>
                <TableHead align="right">{copy.colRepaid}</TableHead>
                <TableHead align="right">{copy.colOutstanding}</TableHead>
                <TableHead>{copy.colDisbursed}</TableHead>
                <TableHead>{d.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {member.loans.length === 0 ? (
                <TableEmpty colSpan={7}>{copy.neverBorrowed}</TableEmpty>
              ) : (
                member.loans.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-mono text-xs text-ink">
                      {loan.reference}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(loan.principal, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(loan.totalPayable, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular className="text-emerald-700">
                      {formatMoney(loan.totalPaid, { showSymbol: false })}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(subtract(loan.totalPayable, loan.totalPaid), {
                        showSymbol: false,
                      })}
                      {loan.daysOverdue > 0 && (
                        <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                          {pluralize(copy.daysLate, loan.daysOverdue)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {date(loan.disbursedAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={loan.status} size="sm" />
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
            {copy.recentTransactions}
          </h2>
          <Link
            href={`/admin/savings/transactions?q=${encodeURIComponent(member.memberNumber)}`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {d.common.viewAll}
          </Link>
        </div>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.common.reference}</TableHead>
                <TableHead>{d.common.date}</TableHead>
                <TableHead>{d.common.description}</TableHead>
                <TableHead>{d.common.type}</TableHead>
                <TableHead align="right">{d.common.amount}</TableHead>
                <TableHead align="right">{copy.balanceAfter}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.transactions.length === 0 ? (
                <TableEmpty colSpan={6}>
                  <span className="inline-flex items-center gap-2">
                    <Receipt className="size-4" aria-hidden="true" />
                    {copy.noTransactions}
                  </span>
                </TableEmpty>
              ) : (
                recent.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-ink-muted">
                      {t.reference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                      {date(t.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.type} size="sm" />
                    </TableCell>
                    <TableCell align="right" tabular>
                      <span
                        className={
                          t.direction === "CREDIT" ? "text-emerald-700" : "text-ink"
                        }
                      >
                        {t.direction === "CREDIT" ? "+" : "−"}
                        {formatMoney(t.amount, { showSymbol: false })}
                      </span>
                    </TableCell>
                    <TableCell align="right" tabular className="text-ink-muted">
                      {formatMoney(t.balanceAfter, { showSymbol: false })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableWrapper>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-ink">
          {copy.notes}
        </h2>
        {member.notes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-ink-muted">
            {copy.noNotes}
          </p>
        ) : (
          <ul className="space-y-3">
            {member.notes.map((note) => (
              <li
                key={note.id}
                className="rounded-2xl border border-border bg-surface p-4 shadow-card"
              >
                <p className="text-sm leading-relaxed text-ink">{note.body}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {note.author.firstName} {note.author.lastName} ·{" "}
                  {date(note.createdAt)}
                  {note.isInternal && ` · ${copy.internal}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
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

/**
 * One face on the file.
 *
 * A plain <img>, not next/image: the bytes come from a permission-checked
 * route that the image optimiser cannot fetch on a member of staff's behalf,
 * and the photograph is already 512px.
 */
function FaceOnFile({
  label,
  src,
  caption,
}: {
  label: string;
  src: string;
  caption?: string;
}) {
  return (
    <figure className="flex items-center gap-4">
      <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-primary/30 bg-ink/[0.04]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="size-full object-cover" />
      </span>
      <figcaption>
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        {caption && (
          <span className="mt-0.5 block font-heading text-sm font-semibold text-ink">
            {caption}
          </span>
        )}
      </figcaption>
    </figure>
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
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        className={`text-right text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
