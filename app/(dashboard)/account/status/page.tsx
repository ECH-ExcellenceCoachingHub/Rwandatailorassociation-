import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Gavel,
  HandCoins,
  Layers,
  Package,
  PiggyBank,
  QrCode,
  Receipt,
  ScrollText,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { PERMISSIONS, ROLE_HOME } from "@/lib/auth/permissions";
import {
  getAccountStatusSummary,
  type AccountStatusSummary,
  type AccountTransactionRow,
} from "@/lib/services/account-status";
import type { MemberWarehouseSummary } from "@/lib/services/warehouse";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import type { Locale } from "@/types";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EnrolAsMemberButton } from "@/components/account/EnrolAsMemberButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";

/**
 * Account status — the first screen after a QR sign-in, and a page in its own
 * right the rest of the time.
 *
 * WHY THIS SCREEN CARRIES EVERYTHING. Someone who has just held a card up to a
 * camera has one question, and it is not "how have my contributions trended".
 * It is "where do I stand". This page answers that completely and in one
 * place: who the association has on file, what their shareholding has reached,
 * what they have paid in, what they borrowed and what is left of it, what they
 * are holding from the warehouse, and every movement on their account. The
 * dashboard answers parts of it eventually, underneath four charts; a member
 * at a pay point, on a cheap phone, over a slow connection, needs all of it
 * before they put the phone away.
 *
 * HOW IT STAYS READABLE AT THAT LENGTH. The first screenful is the verdict —
 * name, standing, and four figures. Everything below is the working behind
 * those figures, in the order a member asks for it, each section able to be
 * skipped. Nothing below the fold is needed to answer "am I all right?".
 *
 * ON MOBILE, THE TABLES BECOME LISTS. The warehouse and transaction sections
 * render as stacked cards below `md` and as tables above it. A financial table
 * squeezed onto a 360px screen is either unreadable or scrolls sideways, and
 * sideways-scrolling money is how people misread a balance.
 *
 * It is written for every role. Staff in a savings association usually save
 * with it as well, so an administrator sees their own position here exactly as
 * a member does; one who has no member record sees an honest panel saying so
 * rather than a row of zeroes.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.account.status.title} | RTA Savings & Loans`,
    robots: { index: false, follow: false },
  };
}

// Balances must never come from a cache — this page exists to be trusted.
export const dynamic = "force-dynamic";

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>;
}) {
  const context = await requireAuth("/account/status");
  const params = await searchParams;
  const { d, locale } = await getDashboardCopy();
  const copy = d.account.status;

  const summary = context.member
    ? await getAccountStatusSummary(context.member.id)
    : null;

  const currency = summary?.currency ?? context.association?.currency ?? "RWF";
  const money = (value: string | null | undefined) =>
    formatMoney(value ?? "0", { currency });

  const overdueDays = summary?.loan?.daysOverdue ?? 0;
  const suspended =
    summary?.status === "SUSPENDED" || context.user.status === "SUSPENDED";

  // Staff who have no savings account yet, and the standing to open one. The
  // association is what makes it possible at all: a platform-level super admin
  // belongs to none, so there is no register to join and no ledger to join it
  // in. The route handler re-checks every part of this.
  const canOpenSavings =
    !summary &&
    Boolean(context.user.associationId) &&
    context.permissions.has(PERMISSIONS.MEMBERS_CREATE);

  return (
    <div className="space-y-6">
      {/* No actions in the header. Both of these — the QR code and the way on
          to a dashboard — sit in the block at the foot of the page, which is
          also where a staff member gets the third destination they need. A
          reader who has just arrived is here to read their position, not to
          leave, so the exits belong at the end rather than above the answer. */}
      <PageHeader title={copy.title} description={copy.description} />

      {params.via === "qr" && (
        <Alert variant="success">{copy.signedInWithQr}</Alert>
      )}

      {/* THE VERDICT. Whatever else is on this page, the reader must be able to
          answer "am I all right?" from the first card. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {summary ? copy.membership : copy.role}
            </p>
            <h2 className="mt-1.5 break-words font-heading text-xl font-bold text-ink sm:text-2xl">
              {summary?.fullName ?? context.user.fullName}
            </h2>
            {context.association && (
              <p className="mt-1 text-sm text-ink-muted">
                {copy.association}: {context.association.name}
              </p>
            )}
            {summary && (
              <p className="mt-1 font-mono text-sm tracking-wide text-ink-muted">
                {summary.memberNumber}
              </p>
            )}
          </div>

          {/* An administrator who also saves with the association wears both
              labels, and needs to: the role explains what they may do to other
              people's records, the membership status explains what is
              happening to their own. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {context.user.role !== "MEMBER" && (
              <StatusBadge status={context.user.role} />
            )}
            {summary && <StatusBadge status={summary.status} />}
            {summary?.shareholding && (
              <StatusBadge status={summary.shareholding.status} />
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          {suspended ? (
            <Alert variant="error" title={copy.suspendedTitle}>
              {copy.suspendedBody}
            </Alert>
          ) : overdueDays > 0 ? (
            <Alert variant="warning" title={copy.overdueTitle}>
              {fill(copy.overdueBody, { days: overdueDays })}
            </Alert>
          ) : summary ? (
            <Alert variant="success" title={copy.goodStandingTitle}>
              {copy.goodStandingBody}
            </Alert>
          ) : (
            <Alert variant="info" title={copy.staffTitle}>
              {copy.staffBody}
              {canOpenSavings && <EnrolAsMemberButton />}
            </Alert>
          )}
        </div>
      </section>

      {summary && (
        <>
          {/* The four figures the whole page exists to deliver. Shares first:
              it is the number a member is most often asking for, and the one
              nothing else on the platform showed them. */}
          <StatGrid columns={4}>
            <StatCard
              label={copy.sharesHeld}
              value={money(summary.shareholding?.sharesHeld)}
              hint={
                summary.shareholding
                  ? fill(copy.sharesDaysHint, {
                      days: summary.shareholding.daysCredited,
                      rate: money(summary.shareholding.dailyRate),
                    })
                  : undefined
              }
              icon={Layers}
              tone="primary"
            />
            <StatCard
              label={copy.totalContributed}
              value={money(summary.savings?.totalDeposits)}
              hint={copy.totalContributedHint}
              icon={PiggyBank}
              href="/dashboard/savings"
            />
            <StatCard
              label={copy.amountRemaining}
              value={money(summary.loan?.outstanding)}
              hint={summary.loan?.reference ?? copy.nothingOwed}
              icon={HandCoins}
              tone={overdueDays > 0 ? "danger" : "default"}
              href="/dashboard/loans"
            />
            {/* `totalDueToStore`, not `totalOwed`: the latter counts only
                outright purchases, so a member whose whole warehouse debt sits
                on a credit arrangement would be shown zero owed on the one
                page that exists to tell them where they stand. */}
            <StatCard
              label={copy.goodsOwed}
              value={money(summary.warehouse?.totalDueToStore)}
              hint={
                summary.warehouse && summary.warehouse.openCount > 0
                  ? pluralize(copy.openIssues, summary.warehouse.openCount)
                  : copy.warehouseEmpty
              }
              icon={Package}
              href="/dashboard/warehouse"
              tone={
                summary.warehouse && summary.warehouse.overdueCreditCount > 0
                  ? "danger"
                  : summary.warehouse &&
                      Number(summary.warehouse.totalDueToStore) > 0
                    ? "warning"
                    : "default"
              }
            />
          </StatGrid>

          {/* WHO THE ASSOCIATION HAS ON FILE. Beside the payment reference,
              because both are things a member reads out at a pay point. */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
              <SectionHeading icon={UserRound} title={copy.yourDetails} />

              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label={copy.fullName} value={summary.fullName} />
                <Detail label={copy.memberNumber} value={summary.memberNumber} mono />
                <Detail
                  label={copy.telephone}
                  value={summary.phone ?? copy.notProvided}
                  muted={!summary.phone}
                  href={summary.phone ? `tel:${summary.phone}` : undefined}
                />
                <Detail
                  label={copy.emailAddress}
                  value={summary.email ?? copy.notProvided}
                  muted={!summary.email}
                />
                <Detail
                  label={copy.memberSince}
                  value={
                    summary.joinedAt
                      ? formatDate(summary.joinedAt, locale)
                      : copy.notRecorded
                  }
                />
                {summary.savings && (
                  <Detail
                    label={copy.accountNumber}
                    value={summary.savings.accountNumber}
                    mono
                  />
                )}
                <BadgeDetail
                  label={copy.identityCheck}
                  status={summary.kycStatus}
                />
                <BadgeDetail
                  label={copy.accountState}
                  status={context.user.status}
                />
              </dl>
            </div>

            {/* The payment reference travels with the member, so it belongs on
                the screen they reach by scanning a card at a pay point. */}
            <div className="rounded-2xl border border-primary/25 bg-primary-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-hover">
                {copy.paymentReference}
              </p>
              <p className="mt-2 break-all font-heading text-xl font-bold tracking-tight text-primary-hover sm:text-2xl">
                {summary.paymentReference}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-primary-hover/80">
                {copy.paymentReferenceHint}
              </p>
            </div>
          </section>

          {summary.shareholding && (
            <ShareholdingPanel
              shareholding={summary.shareholding}
              copy={copy}
              money={money}
            />
          )}

          {/* Directly under the shareholding, because a fine is a deduction
              from the position the panel above just reported. A member with a
              clean record sees nothing here rather than an empty heading. */}
          {summary.fines.rows.length > 0 && (
            <FinesPanel
              fines={summary.fines}
              copy={copy}
              finesCopy={d.rules.fines}
              money={money}
              locale={locale}
            />
          )}

          {summary.savings ? (
            <ContributionsPanel savings={summary.savings} copy={copy} money={money} />
          ) : (
            <Alert variant="info">{copy.noSavingsAccount}</Alert>
          )}

          <BorrowingPanel
            loan={summary.loan}
            copy={copy}
            money={money}
            locale={locale}
          />

          <WarehousePanel
            warehouse={summary.warehouse}
            copy={copy}
            money={money}
            locale={locale}
          />

          <TransactionsPanel
            transactions={summary.transactions}
            total={summary.transactionCount}
            copy={copy}
            money={money}
            locale={locale}
          />
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild>
          <Link href={ROLE_HOME[context.user.role]}>
            {copy.continueToDashboard}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>

        {/* Staff who also save need both destinations named, because for them
            "my dashboard" is ambiguous: one is the association's, the other is
            their own money. */}
        {summary && context.user.role !== "MEMBER" && (
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <PiggyBank className="size-4" aria-hidden="true" />
              {d.nav.myDashboard}
            </Link>
          </Button>
        )}

        <Button asChild variant="outline">
          <Link href="/account/qr">
            <QrCode className="size-4" aria-hidden="true" />
            {copy.myQrCode}
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

type StatusCopy = Awaited<ReturnType<typeof getDashboardCopy>>["d"]["account"]["status"];
/// The fines vocabulary is shared with the register and the member's own fines
/// page, so a member reads the same words for the same penalty wherever they
/// meet it. See lib/i18n/dashboard/rules.ts.
type FinesCopy = Awaited<ReturnType<typeof getDashboardCopy>>["d"]["rules"]["fines"];
type MoneyFormatter = (value: string | null | undefined) => string;

/**
 * IMIGABANE. The shareholding, and the arithmetic behind it.
 *
 * The working is shown rather than just the total, because "why is my share
 * 28,000 when I paid 30,000?" is the question this panel exists to pre-empt —
 * and a member who cannot see the answer concludes the association has taken
 * the difference.
 */
function ShareholdingPanel({
  shareholding,
  copy,
  money,
}: {
  shareholding: NonNullable<AccountStatusSummary["shareholding"]>;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  const isAhead = shareholding.advanceDays > 0;
  const isBehind = shareholding.behindDays > 0;
  const hasFines = Number(shareholding.outstandingFines) > 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <SectionHeading
        icon={Layers}
        title={copy.shareholdingTitle}
        description={copy.shareholdingHint}
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={copy.sharesHeld}
          value={money(shareholding.sharesHeld)}
          hint={fill(copy.sharesDaysHint, {
            days: shareholding.daysCredited,
            rate: money(shareholding.dailyRate),
          })}
          emphasis
        />
        {/* THE FULL DAILY COST, not the savings half of it. A member shown
            "1,000 per day" pays 1,000 a day, and is then found to be behind by
            the service fee they were never told about — which is how somebody
            who believes they are up to date collects a fine. The total leads,
            and the hint names both parts of it. */}
        <Figure
          label={copy.dailyCost}
          value={money(shareholding.dailyTotal)}
          hint={fill(copy.dailyCostHint, {
            savings: money(shareholding.dailyRate),
            fee: money(shareholding.dailyFee),
          })}
        />
        <Figure
          label={copy.paidAhead}
          value={money(shareholding.advanceAmount)}
          hint={
            isAhead
              ? fill(copy.paidAheadHint, { days: shareholding.advanceDays })
              : undefined
          }
          tone={isAhead ? "success" : "default"}
        />
        <Figure
          label={copy.behindBy}
          value={money(shareholding.behindAmount)}
          hint={
            isBehind
              ? fill(copy.behindByHint, { days: shareholding.behindDays })
              : undefined
          }
          tone={isBehind ? "danger" : "default"}
        />
      </div>

      {/* Said in words underneath the figures, because the split is the thing
          members get wrong and a hint under one tile is easy to miss. */}
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        {fill(copy.dailyCostNote, {
          total: money(shareholding.dailyTotal),
          savings: money(shareholding.dailyRate),
          fee: money(shareholding.dailyFee),
        })}
      </p>

      {/* THE WARNING, WHILE IT IS STILL ACTIONABLE. A member told only that
          they are "behind" has no reason to pay today rather than next week —
          which is exactly how the fine arrives. The countdown and the amount
          that stops it are shown together, so there is one thing to do. */}
      {isBehind && (shareholding.status === "AT_RISK" || shareholding.status === "FINABLE") && (
        <Alert
          variant={shareholding.daysUntilFine === 0 ? "error" : "warning"}
          className="mt-4"
          title={
            shareholding.daysUntilFine === 0
              ? copy.fineTonightTitle
              : pluralize(copy.fineRiskTitle, shareholding.daysUntilFine, {
                  days: shareholding.daysUntilFine,
                })
          }
        >
          {fill(
            shareholding.daysUntilFine === 0 ? copy.fineTonightBody : copy.fineRiskBody,
            {
              behind: shareholding.behindDays,
              amount: money(shareholding.behindAmount),
            }
          )}
        </Alert>
      )}

      {hasFines && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {copy.finesOwed}: {money(shareholding.outstandingFines)}
        </p>
      )}
    </section>
  );
}

/**
 * WHAT DISCIPLINE HAS COST THEM.
 *
 * A member could previously see a single "fines owed" total and nothing about
 * where it came from. A penalty nobody can check is one the association will
 * eventually be accused of inventing, so every fine here carries what it was
 * raised for and the sum that produced it — the rate that was in force, and the
 * arrears it was applied to.
 *
 * Both kinds appear: missed daily saving, and a warehouse instalment paid late.
 * They are one member's discipline record whatever raised them.
 *
 * Settled and waived fines stay visible. The panel is a record, not a bill — a
 * member needs to be able to show that a fine was forgiven, and on what
 * reason, long after it stopped being owed.
 */
function FinesPanel({
  fines,
  copy,
  finesCopy,
  money,
  locale,
}: {
  fines: AccountStatusSummary["fines"];
  copy: StatusCopy;
  finesCopy: FinesCopy;
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <SectionHeading
        icon={Gavel}
        title={copy.finesTitle}
        description={copy.finesHint}
      />

      <ul className="mt-5 space-y-3">
        {fines.rows.map((fine) => {
          const outstanding = fine.status === "OUTSTANDING";

          const why =
            fine.kind === "CONTRIBUTION"
              ? pluralize(finesCopy.whyContribution, fine.missedDays ?? 0, {
                  days: fine.missedDays ?? 0,
                })
              : pluralize(finesCopy.whyWarehouse, fine.daysLate ?? 0, {
                  number: fine.installmentNumber ?? 0,
                  days: fine.daysLate ?? 0,
                });

          return (
            <li
              key={`${fine.kind}-${fine.id}`}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${
                outstanding
                  ? "border-red-200 bg-red-50/50"
                  : "border-border bg-canvas"
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{why}</p>
                {/* The arithmetic, so the member can check it rather than take
                    the figure on trust. */}
                <p className="mt-0.5 text-sm text-ink-muted">
                  {fill(finesCopy.sum, {
                    rate: fine.rate,
                    arrears: money(fine.arrearsAmount),
                  })}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatDate(fine.assessedAt, locale)} ·{" "}
                  <span className="font-mono">{fine.reference}</span>
                </p>
                {fine.waiverReason && (
                  <p className="mt-1 text-xs italic text-ink-muted">
                    {fill(finesCopy.waivedBecause, { reason: fine.waiverReason })}
                  </p>
                )}
              </div>

              <div className="text-right">
                <p
                  className={`font-bold tabular-nums ${
                    outstanding ? "text-red-600" : "text-ink"
                  }`}
                >
                  {money(fine.amount)}
                </p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    outstanding
                      ? "border-red-300 bg-red-50 text-red-700"
                      : fine.status === "SETTLED"
                        ? "border-success/30 bg-success/10 text-emerald-700"
                        : "border-ink/12 bg-ink/[0.04] text-ink-muted"
                  }`}
                >
                  {finesCopy.state[fine.status]}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          {fines.outstandingCount > 0
            ? `${copy.finesOwed}: ${money(fines.outstandingAmount)}`
            : copy.finesCleared}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/fines">
            {copy.finesSeeAll}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** What has been paid in, and what has come back out. */
function ContributionsPanel({
  savings,
  copy,
  money,
}: {
  savings: NonNullable<AccountStatusSummary["savings"]>;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <SectionHeading icon={Wallet} title={copy.contributionsTitle} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Figure
          label={copy.totalContributed}
          value={money(savings.totalDeposits)}
          hint={copy.totalContributedHint}
          emphasis
        />
        <Figure label={copy.savingsBalance} value={money(savings.balance)} />
        <Figure
          label={copy.availableToWithdraw}
          value={money(savings.available)}
          tone="success"
        />
        <Figure label={copy.totalWithdrawn} value={money(savings.totalWithdrawals)} />
        <Figure label={copy.interestEarned} value={money(savings.totalInterest)} />
        <Figure label={copy.feesCharged} value={money(savings.totalFees)} />
      </div>

      {Number(savings.locked) > 0 && (
        <p className="mt-4 text-sm text-ink-muted">
          {copy.lockedFunds}: <strong>{money(savings.locked)}</strong>
        </p>
      )}
    </section>
  );
}

/**
 * Borrowing. Three figures side by side — taken, repaid, still owed — because
 * that is the shape of the question, and lifetime totals beneath, because a
 * member on their fourth loan means all four when they ask what they borrowed.
 */
function BorrowingPanel({
  loan,
  copy,
  money,
  locale,
}: {
  loan: AccountStatusSummary["loan"];
  copy: StatusCopy;
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <SectionHeading icon={HandCoins} title={copy.borrowingTitle} />

      {!loan ? (
        <p className="mt-4 text-sm text-ink-muted">{copy.neverBorrowed}</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Figure
              label={copy.amountBorrowed}
              value={money(loan.lifetimeBorrowed)}
              hint={
                loan.loanCount > 0
                  ? pluralize(copy.loanCount, loan.loanCount)
                  : undefined
              }
              emphasis
            />
            <Figure
              label={copy.amountRepaid}
              value={money(loan.lifetimeRepaid)}
              hint={copy.acrossAllLoans}
              tone="success"
            />
            <Figure
              label={copy.amountRemaining}
              value={money(loan.outstanding)}
              hint={loan.reference ?? copy.nothingOwed}
              tone={loan.daysOverdue > 0 ? "danger" : "default"}
            />
          </div>

          {loan.reference && (
            <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
              <Detail label={copy.currentLoan} value={loan.reference} mono />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {copy.accountState}
                </dt>
                <dd className="mt-1.5">
                  {loan.status && <StatusBadge status={loan.status} size="sm" />}
                </dd>
              </div>
              <Detail
                label={copy.nextRepayment}
                value={
                  loan.nextInstalment
                    ? `${money(loan.nextInstalment.amount)} — ${formatDate(
                        loan.nextInstalment.dueDate,
                        locale
                      )}`
                    : copy.noRepaymentScheduled
                }
                muted={!loan.nextInstalment}
              />
            </dl>
          )}
        </>
      )}
    </section>
  );
}

/**
 * IBIKORESHO MURI WAREHOUSE. What the member took out of the store.
 *
 * Rendered as cards below `md` and as a table above it — see the note at the
 * top of this file. Each issue lists its own lines, because "a machine and
 * four rolls of fabric" is the answer, not "five items".
 */
function WarehousePanel({
  warehouse,
  copy,
  money,
  locale,
}: {
  warehouse: MemberWarehouseSummary | null;
  copy: StatusCopy;
  money: MoneyFormatter;
  locale: Locale;
}) {
  const hasIssues = Boolean(warehouse && warehouse.issuances.length > 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <SectionHeading
        icon={Package}
        title={copy.warehouseTitle}
        description={copy.warehouseHint}
      />

      {!hasIssues || !warehouse ? (
        <p className="mt-4 text-sm text-ink-muted">{copy.warehouseEmpty}</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={copy.goodsTaken}
              value={money(warehouse.totalIssuedValue)}
              emphasis
            />
            <Figure
              label={copy.goodsStillHeld}
              value={money(warehouse.outstandingValue)}
            />
            <Figure
              label={copy.goodsPaid}
              value={money(warehouse.totalSettled)}
              tone="success"
            />
            <Figure
              label={copy.goodsOwed}
              value={money(warehouse.totalDueToStore)}
              tone={Number(warehouse.totalDueToStore) > 0 ? "danger" : "default"}
            />
          </div>

          <div className="mt-6 space-y-4">
            {warehouse.issuances.map((issuance) => (
              <article
                key={issuance.id}
                className="rounded-xl border border-border bg-background/40 p-4"
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tracking-wide text-ink">
                      {issuance.reference}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {copy.issuedOn} {formatDate(issuance.issuedAt, locale)}
                      {issuance.loanReference &&
                        ` · ${fill(copy.againstLoan, {
                          reference: issuance.loanReference,
                        })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge status={issuance.terms} size="sm" />
                    <StatusBadge status={issuance.status} size="sm" />
                    {issuance.isOverdueBack && (
                      <StatusBadge
                        status="OVERDUE"
                        label={copy.returnOverdue}
                        size="sm"
                      />
                    )}
                  </div>
                </header>

                {/* Stacked on a phone, tabular from md up. */}
                <ul className="mt-4 space-y-3 md:hidden">
                  {issuance.lines.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {line.itemName}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {formatQuantity(line.quantity, line.unit)} ×{" "}
                          {money(line.unitValue)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {money(line.lineValue)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 hidden md:block">
                  <TableWrapper className="shadow-none">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{copy.itemColumn}</TableHead>
                          <TableHead align="right">{copy.quantityColumn}</TableHead>
                          <TableHead align="right">{copy.unitValueColumn}</TableHead>
                          <TableHead align="right">{copy.valueColumn}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issuance.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium">
                              {line.itemName}
                            </TableCell>
                            <TableCell align="right" tabular>
                              {formatQuantity(line.quantity, line.unit)}
                            </TableCell>
                            <TableCell align="right" tabular>
                              {money(line.unitValue)}
                            </TableCell>
                            <TableCell align="right" tabular>
                              {money(line.lineValue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrapper>
                </div>

                <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                  <span className="text-ink-muted">
                    {copy.valueColumn}:{" "}
                    <strong className="text-ink">{money(issuance.totalValue)}</strong>
                  </span>
                  {Number(issuance.amountOwed) > 0 && (
                    <span className="font-semibold text-red-700">
                      {copy.goodsOwed}: {money(issuance.amountOwed)}
                    </span>
                  )}
                  {issuance.dueBackAt && (
                    <span className="text-ink-muted">
                      {copy.dueBack} {formatDate(issuance.dueBackAt, locale)}
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Every movement on the account, newest first.
 *
 * Cards below `md`, table above. The amount carries its own sign and arrow so
 * that direction survives both a colour-blind reader and a printed page.
 */
function TransactionsPanel({
  transactions,
  total,
  copy,
  money,
  locale,
}: {
  transactions: AccountTransactionRow[];
  total: number;
  copy: StatusCopy;
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          icon={ScrollText}
          title={copy.transactionsTitle}
          description={copy.transactionsHint}
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/statements">
            <Receipt className="size-3.5" aria-hidden="true" />
            {copy.viewFullStatement}
          </Link>
        </Button>
      </div>

      {transactions.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{copy.transactionsEmpty}</p>
      ) : (
        <>
          <ul className="mt-5 space-y-3 md:hidden">
            {transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="rounded-xl border border-border bg-background/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge status={transaction.type} size="sm" />
                    <p className="mt-2 font-mono text-xs tracking-wide text-ink-muted">
                      {transaction.reference}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {formatDate(transaction.createdAt, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <SignedAmount transaction={transaction} money={money} />
                    <p className="mt-1 text-xs text-ink-muted tabular-nums">
                      {money(transaction.balanceAfter)}
                    </p>
                  </div>
                </div>
                {transaction.description && (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-ink-muted">
                    {transaction.description}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden md:block">
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.dateColumn}</TableHead>
                    <TableHead>{copy.referenceColumn}</TableHead>
                    <TableHead>{copy.detailColumn}</TableHead>
                    <TableHead align="right">{copy.amountColumn}</TableHead>
                    <TableHead align="right">{copy.balanceColumn}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="whitespace-nowrap text-ink-muted">
                        {formatDate(transaction.createdAt, locale)}
                      </TableCell>
                      <TableCell className="font-mono text-xs tracking-wide">
                        {transaction.reference}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={transaction.type} size="sm" />
                          {transaction.description && (
                            <span className="text-ink-muted">
                              {transaction.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <SignedAmount transaction={transaction} money={money} />
                      </TableCell>
                      <TableCell align="right" tabular>
                        {money(transaction.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </div>

          {total > transactions.length && (
            <p className="mt-4 text-xs text-ink-muted">
              {fill(copy.showingRecent, {
                shown: transactions.length,
                total,
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {description && (
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * One figure in a panel. Lighter than StatCard — these sit inside a section
 * that already has its own border, and nesting a card in a card gives the page
 * a second frame the eye has to parse before it reaches the number.
 */
function Figure({
  label,
  value,
  hint,
  tone = "default",
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "danger";
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      <p
        className={[
          "mt-1.5 break-words font-heading font-bold tabular-nums",
          emphasis ? "text-xl sm:text-2xl" : "text-lg",
          tone === "success"
            ? "text-emerald-700"
            : tone === "danger"
              ? "text-red-700"
              : "text-ink",
        ].join(" ")}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  muted,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  href?: string;
}) {
  const className = [
    "mt-1.5 break-words text-[15px] font-semibold",
    mono ? "font-mono tracking-wide" : "",
    muted ? "text-ink-muted" : "text-ink",
  ].join(" ");

  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className={className}>
        {href ? (
          <a href={href} className="underline underline-offset-4 hover:text-primary">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function BadgeDetail({ label, status }: { label: string; status: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1.5">
        <StatusBadge status={status} size="sm" />
      </dd>
    </div>
  );
}

/**
 * An amount with its direction shown three ways at once — arrow, sign and
 * colour. Colour alone fails a colour-blind reader and fails again on a
 * printed statement, and on a ledger row the direction is the whole meaning.
 */
function SignedAmount({
  transaction,
  money,
}: {
  transaction: AccountTransactionRow;
  money: MoneyFormatter;
}) {
  const isCredit = transaction.direction === "CREDIT";
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      className={[
        "inline-flex items-center justify-end gap-1 whitespace-nowrap text-sm font-semibold tabular-nums",
        isCredit ? "text-emerald-700" : "text-ink",
      ].join(" ")}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {isCredit ? "+" : "−"}
      {money(transaction.amount)}
    </span>
  );
}
