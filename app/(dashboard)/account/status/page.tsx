import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  PiggyBank,
  QrCode,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { PERMISSIONS, ROLE_HOME } from "@/lib/auth/permissions";
import {
  getAccountStatusSummary,
  type AccountStatusSummary,
  type AccountTransactionRow,
} from "@/lib/services/account-status";
import type { BorrowingBlocker } from "@/lib/rules/borrowing";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EnrolAsMemberButton } from "@/components/account/EnrolAsMemberButton";
import { GuaranteeResponse } from "@/components/account/GuaranteeResponse";

/**
 * Account status — the first screen after a QR sign-in, and a page in its own
 * right the rest of the time.
 *
 * WHY THIS SCREEN CARRIES EVERYTHING. Someone who has just held a card up to a
 * camera has one question, and it is not "how have my contributions trended".
 * It is "where do I stand". This page answers that completely and in one
 * place, for a member at a pay point, on a cheap phone, over a slow connection.
 *
 * WHY IT READS AS A STATEMENT, NOT A DASHBOARD. Every figure is one row: what it
 * is on the left, the amount on the right, a short line under the name saying
 * what it means. Tiles of numbers make the reader work out which one answers
 * their question; a list read top to bottom answers them in order. The order
 * is the order a member asks in: what do I have, what can I spend, what can I
 * borrow — then shares, fines, the loan and who guarantees it, the loans I
 * guarantee, what I have paid in, the warehouse, my details, and every
 * movement on the account.
 *
 * The one exception to that order is a request to guarantee somebody's loan.
 * It is the only thing here that waits on the reader, so it sits first, right
 * under their name, with its Accept and Decline on the row.
 *
 * The same two columns hold at 360px. Nothing scrolls sideways, because
 * sideways-scrolling money is how people misread a balance.
 *
 * It is written for every role. Staff in a savings association usually save
 * with it as well, so an administrator sees their own position here exactly as
 * a member does; one who has no member record sees an honest panel saying so
 * rather than a column of zeroes.
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
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title={copy.title} description={copy.description} className="mb-0" />

      {params.via === "qr" && (
        <Alert variant="success">{copy.signedInWithQr}</Alert>
      )}

      {/* WHO, AND WHETHER ANYTHING NEEDS DOING. A member in good standing gets
          one quiet line; only a problem earns a coloured box. */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-heading text-xl font-bold text-ink">
              {summary?.fullName ?? context.user.fullName}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {summary && (
                <span className="font-mono tracking-wide">{summary.memberNumber}</span>
              )}
              {summary && context.association && " · "}
              {context.association?.name}
            </p>
          </div>

          {/* An administrator who also saves wears both labels: the role says
              what they may do to other people's records, the membership what
              is happening to their own. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {context.user.role !== "MEMBER" && (
              <StatusBadge status={context.user.role} />
            )}
            {summary && <StatusBadge status={summary.status} />}
          </div>
        </div>

        {suspended ? (
          <Alert variant="error" title={copy.suspendedTitle}>
            {copy.suspendedBody}
          </Alert>
        ) : overdueDays > 0 ? (
          <Alert variant="warning" title={copy.overdueTitle}>
            {fill(copy.overdueBody, { days: overdueDays })}
          </Alert>
        ) : summary ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {copy.goodStandingTitle}
          </p>
        ) : (
          <Alert variant="info" title={copy.staffTitle}>
            {copy.staffBody}
            {canOpenSavings && <EnrolAsMemberButton />}
          </Alert>
        )}
      </section>

      {summary && (
        <>
          {summary.guarantees.requests.length > 0 && (
            <GuaranteeRequestsGroup
              requests={summary.guarantees.requests}
              available={summary.savings?.available ?? "0.00"}
              copy={copy}
              money={money}
            />
          )}

          <MoneyGroup
            savings={summary.savings}
            borrowing={summary.borrowing}
            heldForOthers={summary.guarantees.heldForOthers}
            copy={copy}
            blockersCopy={d.rules.blockers}
            money={money}
          />

          {summary.shareholding && (
            <SharesGroup shareholding={summary.shareholding} copy={copy} money={money} />
          )}

          {/* Straight after the shares, because a fine is a deduction from the
              position the group above just reported. */}
          <FinesGroup
            fines={summary.fines}
            copy={copy}
            finesCopy={d.rules.fines}
            money={money}
            locale={locale}
          />

          <LoanGroup loan={summary.loan} copy={copy} money={money} locale={locale} />

          {summary.guarantees.mine.length > 0 && (
            <MyGuarantorsGroup guarantors={summary.guarantees.mine} copy={copy} money={money} />
          )}

          {summary.guarantees.given.length > 0 && (
            <GuaranteesGivenGroup
              given={summary.guarantees.given}
              heldForOthers={summary.guarantees.heldForOthers}
              copy={copy}
              money={money}
              locale={locale}
            />
          )}

          {summary.savings && (
            <PaidInGroup savings={summary.savings} copy={copy} money={money} />
          )}

          <WarehouseGroup
            warehouse={summary.warehouse}
            copy={copy}
            statusCopy={d.status}
            money={money}
            locale={locale}
          />

          <Group title={copy.yourDetails}>
            <Row label={copy.fullName} value={summary.fullName} />
            <Row label={copy.memberNumber} value={summary.memberNumber} mono />
            {summary.savings && (
              <Row label={copy.accountNumber} value={summary.savings.accountNumber} mono />
            )}
            {/* Coloured because it is the one detail a member reads out at a pay
                point, and this is the screen they reach by scanning a card. */}
            <Row
              label={copy.paymentReference}
              hint={copy.paymentReferenceHint}
              value={summary.paymentReference}
              mono
              tone="primary"
            />
            <Row
              label={copy.telephone}
              value={
                summary.phone ? (
                  <a
                    href={`tel:${summary.phone}`}
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    {summary.phone}
                  </a>
                ) : (
                  copy.notProvided
                )
              }
              tone={summary.phone ? "default" : "muted"}
            />
            <Row
              label={copy.emailAddress}
              value={summary.email ?? copy.notProvided}
              tone={summary.email ? "default" : "muted"}
            />
            <Row
              label={copy.memberSince}
              value={
                summary.joinedAt ? formatDate(summary.joinedAt, locale) : copy.notRecorded
              }
              tone={summary.joinedAt ? "default" : "muted"}
            />
            <Row
              label={copy.identityCheck}
              value={<StatusBadge status={summary.kycStatus} size="sm" />}
            />
            <Row
              label={copy.accountState}
              value={<StatusBadge status={context.user.status} size="sm" />}
            />
          </Group>

          <ActivityGroup
            transactions={summary.transactions}
            total={summary.transactionCount}
            copy={copy}
            statusCopy={d.status}
            money={money}
            locale={locale}
          />
        </>
      )}

      {/* The exits sit at the foot of the page. A reader who has just arrived
          is here to read their position, not to leave. */}
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
// Groups, in the order the page reads
// ---------------------------------------------------------------------------

type Copy = Awaited<ReturnType<typeof getDashboardCopy>>["d"];
type StatusCopy = Copy["account"]["status"];
/// The fines vocabulary is shared with the register and the member's own fines
/// page, so a member reads the same words for the same penalty wherever they
/// meet it. See lib/i18n/dashboard/rules.ts.
type FinesCopy = Copy["rules"]["fines"];
type MoneyFormatter = (value: string | null | undefined) => string;

/// How many fines are listed before the reader is sent to the fines page.
const FINES_SHOWN = 5;

/**
 * Balance, available balance, and what that lets them borrow — the three
 * figures a member most often came for, in that order.
 *
 * The loan limit is the rulebook's own-savings share of the AVAILABLE balance
 * (see AccountBorrowingLimit). When a rule stops them borrowing today the
 * figure is still shown, with the reason under it: "you could have 80,000
 * once your two missed days are paid" is something to act on, and a bare zero
 * is not.
 */
function MoneyGroup({
  savings,
  borrowing,
  heldForOthers,
  copy,
  blockersCopy,
  money,
}: {
  savings: AccountStatusSummary["savings"];
  borrowing: AccountStatusSummary["borrowing"];
  heldForOthers: string;
  copy: StatusCopy;
  blockersCopy: Copy["rules"]["blockers"];
  money: MoneyFormatter;
}) {
  if (!savings) {
    return (
      <Group title={copy.moneyTitle}>
        <Row
          label={copy.balance}
          hint={copy.noSavingsAccount}
          value={copy.none}
          tone="muted"
        />
      </Group>
    );
  }

  return (
    <Group title={copy.moneyTitle}>
      <Row
        label={copy.balance}
        hint={copy.balanceHint}
        value={money(savings.balance)}
        size="lg"
      />
      <Row
        label={copy.availableBalance}
        hint={copy.availableBalanceHint}
        value={money(savings.available)}
        size="lg"
      />
      {Number(savings.locked) > 0 && (
        <Row
          label={copy.lockedFunds}
          hint={copy.lockedFundsHint}
          value={money(savings.locked)}
          tone="muted"
          sub={
            Number(heldForOthers) > 0
              ? `${copy.guaranteeHeldTotal}: ${money(heldForOthers)}`
              : undefined
          }
        />
      )}
      <Row
        highlight
        label={copy.loanLimit}
        hint={
          <>
            {fill(copy.loanLimitHint, {
              percent: borrowing.percent,
              basis: money(borrowing.basis),
            })}
            {!borrowing.canBorrow && (
              <span className="mt-2 block font-medium text-amber-800">
                {copy.loanLimitBlocked}:
                {borrowing.blockers.map((blocker) => (
                  <span key={blocker.rule} className="mt-0.5 block font-normal">
                    {blockerSentence(blocker, blockersCopy, money)}
                  </span>
                ))}
              </span>
            )}
          </>
        }
        value={money(borrowing.limit)}
        tone="primary"
        size="lg"
        sub={
          borrowing.canBorrow ? (
            <FooterLink href="/dashboard/loans/apply">{copy.applyForLoan}</FooterLink>
          ) : undefined
        }
      />
    </Group>
  );
}

/**
 * IMIGABANE. The shareholding, and the arithmetic behind it.
 *
 * The working is shown in the line under each figure, because "why is my share
 * 28,000 when I paid 30,000?" is the question this group exists to pre-empt.
 * The daily cost is the FULL cost — savings plus service fee — because a member
 * shown only the savings half pays exactly that and falls behind by the fee.
 */
function SharesGroup({
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

  // THE WARNING, WHILE IT IS STILL ACTIONABLE. A member told only that they
  // are "behind" has no reason to pay today rather than next week — which is
  // exactly how the fine arrives. The countdown and the amount that stops it
  // are shown together, so there is one thing to do.
  const fineWarning =
    isBehind &&
    (shareholding.status === "AT_RISK" || shareholding.status === "FINABLE") ? (
      <Alert
        variant={shareholding.daysUntilFine === 0 ? "error" : "warning"}
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
    ) : null;

  return (
    <Group
      title={copy.shareholdingTitle}
      description={copy.shareholdingHint}
      note={fineWarning}
    >
      <Row
        label={copy.sharesHeld}
        hint={fill(copy.sharesDaysHint, {
          days: shareholding.daysCredited,
          rate: money(shareholding.dailyRate),
        })}
        value={money(shareholding.sharesHeld)}
        size="lg"
      />
      <Row
        label={copy.dailyCost}
        hint={fill(copy.dailyCostHint, {
          savings: money(shareholding.dailyRate),
          fee: money(shareholding.dailyFee),
        })}
        value={money(shareholding.dailyTotal)}
      />
      <Row
        label={copy.contributionStatus}
        value={<StatusBadge status={shareholding.status} size="sm" />}
      />
      {isAhead && (
        <Row
          label={copy.paidAhead}
          hint={fill(copy.paidAheadHint, { days: shareholding.advanceDays })}
          value={money(shareholding.advanceAmount)}
          tone="success"
        />
      )}
      {isBehind && (
        <Row
          label={copy.behindBy}
          hint={fill(copy.behindByHint, { days: shareholding.behindDays })}
          value={money(shareholding.behindAmount)}
          tone="danger"
        />
      )}
    </Group>
  );
}

/**
 * WHAT DISCIPLINE HAS COST THEM.
 *
 * The total owed first, then each fine with what it was raised for and the sum
 * that produced it — a penalty nobody can check is one the association will
 * eventually be accused of inventing. Settled and waived fines stay listed: a
 * member needs to be able to show that a fine was forgiven, and why.
 */
function FinesGroup({
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
  const hasOutstanding = fines.outstandingCount > 0;

  return (
    <Group
      title={copy.finesTitle}
      footer={
        fines.rows.length > 0 ? (
          <FooterLink href="/dashboard/fines">{copy.finesSeeAll}</FooterLink>
        ) : undefined
      }
    >
      <Row
        label={copy.finesOwed}
        hint={hasOutstanding ? undefined : copy.finesCleared}
        value={money(fines.outstandingAmount)}
        tone={hasOutstanding ? "danger" : "default"}
        size="lg"
      />
      {Number(fines.settledAmount) > 0 && (
        <Row label={copy.finesPaid} value={money(fines.settledAmount)} />
      )}

      {fines.rows.slice(0, FINES_SHOWN).map((fine) => {
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
          <Row
            key={`${fine.kind}-${fine.id}`}
            item
            label={why}
            hint={
              <>
                {/* The arithmetic, so the member can check it rather than take
                    the figure on trust. */}
                {fill(finesCopy.sum, {
                  rate: fine.rate,
                  arrears: money(fine.arrearsAmount),
                })}
                <span className="block">
                  {formatDate(fine.assessedAt, locale)} ·{" "}
                  <span className="font-mono">{fine.reference}</span>
                </span>
                {fine.waiverReason && (
                  <span className="block italic">
                    {fill(finesCopy.waivedBecause, { reason: fine.waiverReason })}
                  </span>
                )}
              </>
            }
            value={money(fine.amount)}
            tone={outstanding ? "danger" : "default"}
            sub={finesCopy.state[fine.status]}
          />
        );
      })}
    </Group>
  );
}

/**
 * The current loan first — what is still owed and when the next payment falls —
 * then lifetime totals, because a member on their fourth loan means all four
 * when they ask what they have borrowed.
 */
function LoanGroup({
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
  if (!loan) {
    return (
      <Group title={copy.borrowingTitle}>
        <Row
          label={copy.currentLoan}
          hint={copy.neverBorrowed}
          value={copy.none}
          tone="muted"
        />
      </Group>
    );
  }

  return (
    <Group title={copy.borrowingTitle}>
      <Row
        label={copy.currentLoan}
        value={loan.reference ?? copy.none}
        mono={Boolean(loan.reference)}
        tone={loan.reference ? "default" : "muted"}
        sub={loan.status ? <StatusBadge status={loan.status} size="sm" /> : undefined}
      />
      <Row
        label={copy.amountRemaining}
        value={money(loan.outstanding)}
        tone={loan.daysOverdue > 0 ? "danger" : "default"}
        size="lg"
      />
      {loan.reference && (
        <Row
          label={copy.nextRepayment}
          value={
            loan.nextInstalment
              ? money(loan.nextInstalment.amount)
              : copy.noRepaymentScheduled
          }
          sub={
            loan.nextInstalment
              ? formatDate(loan.nextInstalment.dueDate, locale)
              : undefined
          }
          tone={loan.nextInstalment ? "default" : "muted"}
        />
      )}
      <Row
        label={copy.amountBorrowed}
        hint={pluralize(copy.loanCount, loan.loanCount)}
        value={money(loan.lifetimeBorrowed)}
      />
      <Row
        label={copy.amountRepaid}
        hint={copy.acrossAllLoans}
        value={money(loan.lifetimeRepaid)}
        tone="success"
      />
    </Group>
  );
}

/**
 * REQUESTS TO GUARANTEE A LOAN, waiting on the reader.
 *
 * Each row says who is asking, for how much of what loan and what it is for,
 * and the reader's own available balance beside it — the figure they need to
 * decide, which they would otherwise have to scroll down to find. The answer
 * is given on the row itself.
 */
function GuaranteeRequestsGroup({
  requests,
  available,
  copy,
  money,
}: {
  requests: AccountStatusSummary["guarantees"]["requests"];
  available: string;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  return (
    <Group
      title={copy.guaranteeRequestsTitle}
      description={copy.guaranteeRequestsHint}
    >
      {requests.map((request) => (
        <Row
          key={request.id}
          highlight
          label={`${request.borrowerName} · ${request.borrowerMemberNumber}`}
          hint={
            <>
              {fill(copy.guaranteeRequestLine, {
                loan: money(request.loanAmount),
                months: request.termMonths,
                reference: request.reference,
              })}
              <span className="block">
                {fill(copy.guaranteePurpose, { purpose: request.purpose })}
              </span>
              <span className="mt-1 block font-medium text-ink">
                {fill(copy.guaranteeYourAvailable, { available: money(available) })}
              </span>
            </>
          }
          value={money(request.amount)}
          tone="primary"
          size="lg"
          sub={
            <GuaranteeResponse
              guaranteeId={request.id}
              borrowerName={request.borrowerName}
              amount={money(request.amount)}
            />
          }
        />
      ))}
    </Group>
  );
}

/**
 * The members standing behind the reader's own loan, and where each stands.
 * Shown while the application is open and while the loan is being repaid —
 * the reader should know whose money is held on their account.
 */
function MyGuarantorsGroup({
  guarantors,
  copy,
  money,
}: {
  guarantors: AccountStatusSummary["guarantees"]["mine"];
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  return (
    <Group title={copy.myGuarantorsTitle} description={copy.myGuarantorsHint}>
      {guarantors.map((g) => (
        <Row
          key={g.id}
          item
          label={g.memberNumber ? `${g.guarantorName} · ${g.memberNumber}` : g.guarantorName}
          hint={
            g.status === "PENDING"
              ? copy.myGuarantorWaiting
              : g.status === "ACCEPTED"
                ? copy.myGuarantorHolding
                : g.status === "DECLINED"
                  ? g.declineReason
                    ? `${copy.myGuarantorDeclined}: ${g.declineReason}`
                    : copy.myGuarantorDeclined
                  : undefined
          }
          value={money(g.amount)}
          tone={g.status === "DECLINED" ? "muted" : "default"}
          sub={<StatusBadge status={g.status} size="sm" />}
        />
      ))}
    </Group>
  );
}

/**
 * The reader's savings held for other members' loans. What is held now comes
 * first, with what is still owed on each loan — how close the money is to
 * coming back; finished guarantees follow, so a released one can be pointed at.
 */
function GuaranteesGivenGroup({
  given,
  heldForOthers,
  copy,
  money,
  locale,
}: {
  given: AccountStatusSummary["guarantees"]["given"];
  heldForOthers: string;
  copy: StatusCopy;
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <Group title={copy.guaranteesGivenTitle} description={copy.guaranteesGivenHint}>
      <Row
        label={copy.guaranteeHeldTotal}
        hint={Number(heldForOthers) > 0 ? copy.guaranteeHeldTotalHint : undefined}
        value={money(heldForOthers)}
        size="lg"
      />
      {given.map((g) => (
        <Row
          key={g.id}
          item
          label={fill(copy.guaranteeForLoan, { name: g.borrowerName })}
          hint={
            g.status === "RELEASED"
              ? fill(copy.guaranteeReleasedOn, {
                  reference: g.reference,
                  date: g.releasedAt ? formatDate(g.releasedAt, locale) : "",
                })
              : g.status === "DECLINED"
                ? fill(copy.guaranteeYouDeclined, { reference: g.reference })
                : g.loanOutstanding !== null
                  ? fill(copy.guaranteeStillOwed, {
                      reference: g.reference,
                      outstanding: money(g.loanOutstanding),
                    })
                  : fill(copy.guaranteeAwaitingDecision, { reference: g.reference })
          }
          value={money(g.amount)}
          tone={g.status === "ACCEPTED" ? "default" : "muted"}
          sub={<StatusBadge status={g.status} size="sm" />}
        />
      ))}
    </Group>
  );
}

/** What has been paid in, and what has come back out. */
function PaidInGroup({
  savings,
  copy,
  money,
}: {
  savings: NonNullable<AccountStatusSummary["savings"]>;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  return (
    <Group title={copy.contributionsTitle}>
      <Row
        label={copy.totalContributed}
        hint={copy.totalContributedHint}
        value={money(savings.totalDeposits)}
        size="lg"
      />
      <Row label={copy.totalWithdrawn} value={money(savings.totalWithdrawals)} />
      <Row label={copy.interestEarned} value={money(savings.totalInterest)} />
      <Row label={copy.feesCharged} value={money(savings.totalFees)} />
    </Group>
  );
}

/**
 * IBIKORESHO MURI WAREHOUSE. What the member took out of the store.
 *
 * `totalDueToStore`, not `totalOwed`, leads: the latter counts only outright
 * purchases, so a member whose whole warehouse debt sits on a credit
 * arrangement would be shown zero owed. Each issue is then one row naming what
 * was in it — "a machine and four rolls of fabric" is the answer, not "five
 * items".
 */
function WarehouseGroup({
  warehouse,
  copy,
  statusCopy,
  money,
  locale,
}: {
  warehouse: AccountStatusSummary["warehouse"];
  copy: StatusCopy;
  statusCopy: Copy["status"];
  money: MoneyFormatter;
  locale: Locale;
}) {
  if (!warehouse || warehouse.issuances.length === 0) {
    return (
      <Group title={copy.warehouseTitle}>
        <Row
          label={copy.goodsOwed}
          hint={copy.warehouseEmpty}
          value={copy.none}
          tone="muted"
        />
      </Group>
    );
  }

  const owed = Number(warehouse.totalDueToStore) > 0;

  return (
    <Group title={copy.warehouseTitle} description={copy.warehouseHint}>
      <Row
        label={copy.goodsOwed}
        hint={
          warehouse.openCount > 0
            ? pluralize(copy.openIssues, warehouse.openCount)
            : undefined
        }
        value={money(warehouse.totalDueToStore)}
        tone={
          warehouse.overdueCreditCount > 0 ? "danger" : owed ? "warning" : "default"
        }
        size="lg"
      />
      <Row label={copy.goodsTaken} value={money(warehouse.totalIssuedValue)} />
      <Row label={copy.goodsPaid} value={money(warehouse.totalSettled)} tone="success" />
      {Number(warehouse.outstandingValue) > 0 && (
        <Row label={copy.goodsStillHeld} value={money(warehouse.outstandingValue)} />
      )}

      {warehouse.issuances.map((issuance) => (
        <Row
          key={issuance.id}
          item
          label={issuance.lines
            .map((line) => `${line.itemName} × ${formatQuantity(line.quantity, line.unit)}`)
            .join(", ")}
          hint={
            <>
              {copy.issuedOn} {formatDate(issuance.issuedAt, locale)} ·{" "}
              {statusLabel(issuance.terms, statusCopy)} ·{" "}
              <span className="font-mono">{issuance.reference}</span>
              {issuance.loanReference && (
                <span className="block">
                  {fill(copy.againstLoan, { reference: issuance.loanReference })}
                </span>
              )}
              {issuance.isOverdueBack ? (
                <span className="block font-medium text-red-700">
                  {copy.returnOverdue}
                </span>
              ) : (
                issuance.dueBackAt && (
                  <span className="block">
                    {copy.dueBack} {formatDate(issuance.dueBackAt, locale)}
                  </span>
                )
              )}
            </>
          }
          value={money(issuance.totalValue)}
          sub={
            Number(issuance.amountOwed) > 0 ? (
              <span className="font-semibold text-red-700">
                {copy.goodsOwed}: {money(issuance.amountOwed)}
              </span>
            ) : (
              <StatusBadge status={issuance.status} size="sm" />
            )
          }
        />
      ))}
    </Group>
  );
}

/**
 * Every movement on the account, newest first. The amount carries its own sign
 * and arrow so that direction survives both a colour-blind reader and a printed
 * page; the balance it left sits under it, as on a bank statement.
 */
function ActivityGroup({
  transactions,
  total,
  copy,
  statusCopy,
  money,
  locale,
}: {
  transactions: AccountTransactionRow[];
  total: number;
  copy: StatusCopy;
  statusCopy: Copy["status"];
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <Group
      title={copy.transactionsTitle}
      note={
        transactions.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.transactionsEmpty}</p>
        ) : undefined
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FooterLink href="/dashboard/statements">{copy.viewFullStatement}</FooterLink>
          {total > transactions.length && (
            <span className="text-xs text-ink-muted">
              {fill(copy.showingRecent, { shown: transactions.length, total })}
            </span>
          )}
        </div>
      }
    >
      {transactions.map((transaction) => (
        <Row
          key={transaction.id}
          item
          label={statusLabel(transaction.type, statusCopy)}
          hint={
            <>
              {transaction.description && (
                <span className="block">{transaction.description}</span>
              )}
              {formatDate(transaction.createdAt, locale)} ·{" "}
              <span className="font-mono">{transaction.reference}</span>
            </>
          }
          value={<SignedAmount transaction={transaction} money={money} />}
          sub={`${copy.balanceColumn}: ${money(transaction.balanceAfter)}`}
        />
      ))}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/**
 * A titled list of rows. The title sits above the box rather than inside it,
 * so the box holds nothing but figures and the eye goes straight to them.
 */
function Group({
  title,
  description,
  note,
  footer,
  children,
}: {
  title: string;
  description?: string;
  /// Shown under the rows, inside the box — a warning about them.
  note?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section>
      <h2 className="px-1 font-heading text-sm font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      {description && (
        <p className="mt-1 px-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      <div className="mt-2.5 overflow-hidden rounded-xl border border-border bg-surface">
        <dl className="divide-y divide-border">{children}</dl>
        {note && <div className="border-t border-border px-4 py-3 sm:px-5">{note}</div>}
        {footer && (
          <div className="border-t border-border bg-background px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </section>
  );
}

const VALUE_TONES = {
  default: "text-ink",
  primary: "text-primary-hover",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-red-700",
  muted: "font-medium text-ink-muted",
} as const;

/**
 * One line of the statement: what it is on the left, the figure on the right.
 *
 * `hint` is the plain-words line under the name — what the figure means, or
 * how it was worked out. `sub` sits under the figure for a second fact about
 * it (a date, a status). `item` rows are entries in a list — one fine, one
 * transaction — and are set a size smaller than the totals above them.
 */
function Row({
  label,
  hint,
  value,
  sub,
  tone = "default",
  size = "md",
  mono,
  item,
  highlight,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof VALUE_TONES;
  size?: "md" | "lg";
  mono?: boolean;
  item?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5",
        highlight && "bg-primary-50"
      )}
    >
      <dt className="min-w-0 flex-1">
        <span
          className={cn(
            "block break-words text-ink",
            item ? "text-sm font-medium" : "text-[15px]",
            highlight && "font-semibold"
          )}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            {hint}
          </span>
        )}
      </dt>
      <dd className="max-w-[60%] text-right">
        <span
          className={cn(
            "block break-words tabular-nums",
            size === "lg"
              ? "font-heading text-lg font-bold"
              : item
                ? "text-sm font-semibold"
                : "text-[15px] font-semibold",
            mono && "font-mono tracking-wide",
            VALUE_TONES[tone]
          )}
        >
          {value}
        </span>
        {sub && <span className="mt-1 block text-xs text-ink-muted">{sub}</span>}
      </dd>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-primary-hover underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * A borrowing rule, in the reader's language. The unpaid-fines rule carries a
 * raw money string, so it is formatted here the way every other amount on the
 * page is.
 */
function blockerSentence(
  blocker: BorrowingBlocker,
  blockersCopy: Copy["rules"]["blockers"],
  money: MoneyFormatter
): string {
  const params =
    blocker.rule === "FINE_OUTSTANDING"
      ? { ...blocker.params, amount: money(String(blocker.params.amount)) }
      : blocker.params;
  return fill(blockersCopy[blocker.rule], params);
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
      className={cn(
        "inline-flex items-center justify-end gap-1 whitespace-nowrap",
        isCredit ? "text-emerald-700" : "text-ink"
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {isCredit ? "+" : "−"}
      {money(transaction.amount)}
    </span>
  );
}
