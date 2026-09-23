import type { Metadata } from "next";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  CircleCheck,
  Coins,
  Landmark,
  Package,
  PiggyBank,
  ScanLine,
  TriangleAlert,
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
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EnrolAsMemberButton } from "@/components/account/EnrolAsMemberButton";
import { GuaranteeResponse } from "@/components/account/GuaranteeResponse";

/**
 * Account status — the first screen after a QR sign-in, and a page in its own
 * right the rest of the time.
 *
 * WHY IT IS A SUMMARY. Someone who has just held a card up to a camera has one
 * question: "where do I stand". The page answers it in the order it is asked
 * and stops there — the full ledger, every fine and every warehouse issue have
 * their own pages, linked from here.
 *
 *   1. The hero card: who you are, whether all is well, what you can spend,
 *      what you hold, what you can borrow, and the reference to pay with.
 *   2. Anything waiting on you — a guarantee request, a fine about to land.
 *   3. One tile each for the loan and the shares; fines and warehouse debt
 *      get a tile only when something is actually owed.
 *   4. Guarantees, when there are any.
 *   5. The last few movements on the account.
 *
 * Every figure keeps its label next to it, and nothing scrolls sideways at
 * 360px, because sideways-scrolling money is how people misread a balance.
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

/// How many movements the summary shows before sending the reader to the
/// full statement.
const RECENT_SHOWN = 5;

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

  const standing: Standing = suspended
    ? "suspended"
    : overdueDays > 0
      ? "overdue"
      : summary
        ? "good"
        : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Hero
        name={summary?.fullName ?? context.user.fullName}
        memberNumber={summary?.memberNumber ?? null}
        association={context.association?.name ?? null}
        role={context.user.role}
        memberStatus={summary?.status ?? null}
        standing={standing}
        viaQr={params.via === "qr"}
        summary={summary}
        copy={copy}
        money={money}
      />

      {/* THE ONLY BOXES WITH COLOUR are the ones asking for something. A
          member in good standing gets the green line in the hero and no more. */}
      {suspended ? (
        <Alert variant="error" title={copy.suspendedTitle}>
          {copy.suspendedBody}
        </Alert>
      ) : overdueDays > 0 ? (
        <Alert variant="warning" title={copy.overdueTitle}>
          {fill(copy.overdueBody, { days: overdueDays })}
        </Alert>
      ) : (
        !summary && (
          <Alert variant="info" title={copy.staffTitle}>
            {copy.staffBody}
            {canOpenSavings && <EnrolAsMemberButton />}
          </Alert>
        )
      )}

      {summary && (
        <>
          {summary.shareholding && (
            <FineWarning shareholding={summary.shareholding} copy={copy} money={money} />
          )}

          {summary.guarantees.requests.length > 0 && (
            <GuaranteeRequestsGroup
              requests={summary.guarantees.requests}
              available={summary.savings?.available ?? "0.00"}
              copy={copy}
              money={money}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <LoanTile
              loan={summary.loan}
              borrowing={summary.borrowing}
              copy={copy}
              blockersCopy={d.rules.blockers}
              money={money}
              locale={locale}
            />
            <SharesTile shareholding={summary.shareholding} copy={copy} money={money} />
            {summary.fines.outstandingCount > 0 && (
              <Tile
                icon={TriangleAlert}
                accent="danger"
                title={copy.finesOwed}
                value={money(summary.fines.outstandingAmount)}
                valueTone="danger"
                link={{ href: "/dashboard/fines", label: copy.finesSeeAll }}
              />
            )}
            {summary.warehouse && Number(summary.warehouse.totalDueToStore) > 0 && (
              <Tile
                icon={Package}
                accent={summary.warehouse.overdueCreditCount > 0 ? "danger" : "warning"}
                title={copy.warehouseTitle}
                value={money(summary.warehouse.totalDueToStore)}
                valueTone={summary.warehouse.overdueCreditCount > 0 ? "danger" : "warning"}
              >
                {copy.goodsOwed}
                {summary.warehouse.openCount > 0 &&
                  ` · ${pluralize(copy.openIssues, summary.warehouse.openCount)}`}
              </Tile>
            )}
          </div>

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

          <RecentActivity
            transactions={summary.transactions.slice(0, RECENT_SHOWN)}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The summary, in the order the page reads
// ---------------------------------------------------------------------------

type Copy = Awaited<ReturnType<typeof getDashboardCopy>>["d"];
type StatusCopy = Copy["account"]["status"];
type MoneyFormatter = (value: string | null | undefined) => string;
type Standing = "good" | "overdue" | "suspended" | null;

const STANDING = {
  good: { icon: CircleCheck, className: "bg-emerald-400/15 text-emerald-100 ring-emerald-300/40" },
  overdue: { icon: TriangleAlert, className: "bg-amber-400/20 text-amber-100 ring-amber-300/50" },
  suspended: { icon: Ban, className: "bg-red-500/25 text-red-100 ring-red-300/50" },
} as const;

/**
 * WHO, WHETHER ALL IS WELL, AND THE FIGURES THEY CAME FOR — in one card.
 *
 * The available balance is the headline because it is what a member can
 * actually use; the full balance and the loan limit sit under it at half the
 * size. The payment reference closes the card because it is the one detail a
 * member reads out at a pay point, and this is the screen they reach by
 * scanning a card.
 */
function Hero({
  name,
  memberNumber,
  association,
  role,
  memberStatus,
  standing,
  viaQr,
  summary,
  copy,
  money,
}: {
  name: string;
  memberNumber: string | null;
  association: string | null;
  role: string;
  memberStatus: string | null;
  standing: Standing;
  viaQr: boolean;
  summary: AccountStatusSummary | null;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const standingLabel =
    standing === "good"
      ? copy.goodStandingTitle
      : standing === "overdue"
        ? copy.overdueTitle
        : standing === "suspended"
          ? copy.suspendedTitle
          : null;
  const StandingIcon = standing ? STANDING[standing].icon : null;

  const savings = summary?.savings ?? null;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary via-primary-hover to-footer p-5 text-white shadow-lift sm:p-7">
      {/* Two soft discs for depth; purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary-light/20 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-white/5 blur-2xl"
      />

      <div className="relative">
        <h1 className="sr-only">{copy.title}</h1>

        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 font-heading text-xl font-bold ring-1 ring-white/25 sm:size-16 sm:text-2xl">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words font-heading text-xl font-bold leading-tight sm:text-2xl">
              {name}
            </p>
            <p className="mt-1 text-sm text-white/75">
              {memberNumber && (
                <span className="font-mono tracking-wide text-white">{memberNumber}</span>
              )}
              {memberNumber && association && " · "}
              {association}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {standingLabel && StandingIcon && standing && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1",
                STANDING[standing].className
              )}
            >
              <StandingIcon className="size-4" aria-hidden="true" />
              {standingLabel}
            </span>
          )}
          {/* An administrator who also saves wears their role as well: it says
              what they may do to other people's records. The membership state
              is shown only when it is something other than active, since
              "active" is what the standing line already says. */}
          {role !== "MEMBER" && <StatusBadge status={role} />}
          {memberStatus && memberStatus !== "ACTIVE" && memberStatus !== "SUSPENDED" && (
            <StatusBadge status={memberStatus} />
          )}
          {viaQr && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/90 ring-1 ring-white/20">
              <ScanLine className="size-4" aria-hidden="true" />
              {copy.signedInWithQr}
            </span>
          )}
        </div>

        {summary && (
          <>
            <div className="mt-7">
              <p className="text-sm font-medium text-white/75">{copy.availableBalance}</p>
              <p className="mt-1 break-words font-heading text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                {savings ? money(savings.available) : copy.none}
              </p>
              {savings && Number(savings.locked) > 0 && (
                <p className="mt-1.5 text-sm text-white/75">
                  {copy.lockedFunds}:{" "}
                  <span className="font-semibold tabular-nums text-white">
                    {money(savings.locked)}
                  </span>
                </p>
              )}
              {!savings && (
                <p className="mt-1.5 text-sm text-white/75">{copy.noSavingsAccount}</p>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              <HeroFigure
                label={copy.balance}
                value={savings ? money(savings.balance) : copy.none}
              />
              <HeroFigure
                label={copy.loanLimit}
                value={money(summary.borrowing.limit)}
                highlight={summary.borrowing.canBorrow}
              />
            </dl>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{copy.paymentReference}</p>
                <p className="text-xs text-white/70">{copy.paymentReferenceHint}</p>
              </div>
              <p className="break-all font-mono text-lg font-bold tracking-wider text-primary-light">
                {summary.paymentReference}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function HeroFigure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
      <dt className="text-xs font-medium text-white/75 sm:text-sm">{label}</dt>
      <dd
        className={cn(
          "mt-1 break-words font-heading text-lg font-bold tabular-nums sm:text-xl",
          highlight && "text-emerald-200"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * THE FINE, WHILE IT IS STILL AVOIDABLE. A member told only that they are
 * "behind" has no reason to pay today rather than next week — which is exactly
 * how the fine arrives. The countdown and the amount that stops it are shown
 * together, so there is one thing to do.
 */
function FineWarning({
  shareholding,
  copy,
  money,
}: {
  shareholding: NonNullable<AccountStatusSummary["shareholding"]>;
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  if (
    shareholding.behindDays <= 0 ||
    (shareholding.status !== "AT_RISK" && shareholding.status !== "FINABLE")
  ) {
    return null;
  }

  const tonight = shareholding.daysUntilFine === 0;
  return (
    <Alert
      variant={tonight ? "error" : "warning"}
      title={
        tonight
          ? copy.fineTonightTitle
          : pluralize(copy.fineRiskTitle, shareholding.daysUntilFine, {
              days: shareholding.daysUntilFine,
            })
      }
    >
      {fill(tonight ? copy.fineTonightBody : copy.fineRiskBody, {
        behind: shareholding.behindDays,
        amount: money(shareholding.behindAmount),
      })}
    </Alert>
  );
}

/**
 * The current loan: what is still owed and when the next payment falls. With
 * no loan running, the tile turns into the way to get one — or, when a rule
 * stops them, the reason, because "you could borrow once your missed days are
 * paid" is something to act on and a bare zero is not.
 */
function LoanTile({
  loan,
  borrowing,
  copy,
  blockersCopy,
  money,
  locale,
}: {
  loan: AccountStatusSummary["loan"];
  borrowing: AccountStatusSummary["borrowing"];
  copy: StatusCopy;
  blockersCopy: Copy["rules"]["blockers"];
  money: MoneyFormatter;
  locale: Locale;
}) {
  const running = Boolean(loan?.reference);
  const overdue = (loan?.daysOverdue ?? 0) > 0;

  const blocked = !borrowing.canBorrow && borrowing.blockers.length > 0 && (
    <p className="font-medium text-amber-800">
      {copy.loanLimitBlocked}:{" "}
      <span className="font-normal">
        {blockerSentence(borrowing.blockers[0], blockersCopy, money)}
      </span>
    </p>
  );

  if (!running) {
    return (
      <Tile
        icon={Landmark}
        title={copy.borrowingTitle}
        value={copy.none}
        valueTone="muted"
        link={
          borrowing.canBorrow
            ? { href: "/dashboard/loans/apply", label: copy.applyForLoan }
            : undefined
        }
      >
        <p>{loan && loan.loanCount > 0 ? copy.nothingOwed : copy.neverBorrowed}</p>
        {blocked}
      </Tile>
    );
  }

  return (
    <Tile
      icon={Landmark}
      accent={overdue ? "danger" : "primary"}
      title={copy.amountRemaining}
      value={money(loan!.outstanding)}
      valueTone={overdue ? "danger" : "default"}
      badge={loan!.status ? <StatusBadge status={loan!.status} size="sm" /> : undefined}
    >
      <p>
        {copy.nextRepayment}:{" "}
        {loan!.nextInstalment ? (
          <span className="font-semibold text-ink">
            {money(loan!.nextInstalment.amount)} ·{" "}
            {formatDate(loan!.nextInstalment.dueDate, locale)}
          </span>
        ) : (
          copy.noRepaymentScheduled
        )}
      </p>
      <p className="font-mono text-xs">{loan!.reference}</p>
    </Tile>
  );
}

/**
 * IMIGABANE. The shares held, and whether contributions are up to date — ahead
 * or behind, in days and money, since "behind" alone does not say what to pay.
 */
function SharesTile({
  shareholding,
  copy,
  money,
}: {
  shareholding: AccountStatusSummary["shareholding"];
  copy: StatusCopy;
  money: MoneyFormatter;
}) {
  if (!shareholding) {
    return (
      <Tile icon={Coins} accent="success" title={copy.sharesHeld} value={copy.none} valueTone="muted" />
    );
  }

  return (
    <Tile
      icon={Coins}
      accent="success"
      title={copy.sharesHeld}
      value={money(shareholding.sharesHeld)}
      badge={<StatusBadge status={shareholding.status} size="sm" />}
    >
      <p>
        {copy.dailyCost}:{" "}
        <span className="font-semibold text-ink">{money(shareholding.dailyTotal)}</span>
      </p>
      {shareholding.behindDays > 0 ? (
        <p className="font-semibold text-red-700">
          {copy.behindBy} {money(shareholding.behindAmount)} ·{" "}
          {fill(copy.behindByHint, { days: shareholding.behindDays })}
        </p>
      ) : shareholding.advanceDays > 0 ? (
        <p className="font-semibold text-emerald-700">
          {copy.paidAhead} {money(shareholding.advanceAmount)} ·{" "}
          {fill(copy.paidAheadHint, { days: shareholding.advanceDays })}
        </p>
      ) : null}
    </Tile>
  );
}

const TILE_ACCENTS = {
  primary: "bg-primary-50 text-primary",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
} as const;

const TILE_VALUE_TONES = {
  default: "text-ink",
  warning: "text-amber-700",
  danger: "text-red-700",
  muted: "text-ink-muted",
} as const;

/**
 * One headline figure with its name and an icon, and at most a couple of
 * short lines under it. A tile never holds a list; lists live on their own
 * pages, linked from the tile.
 */
function Tile({
  icon: Icon,
  accent = "primary",
  title,
  value,
  valueTone = "default",
  badge,
  link,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  accent?: keyof typeof TILE_ACCENTS;
  title: string;
  value: string;
  valueTone?: keyof typeof TILE_VALUE_TONES;
  badge?: ReactNode;
  link?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              TILE_ACCENTS[accent]
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        </div>
        {badge}
      </div>
      <p
        className={cn(
          "mt-4 break-words font-heading text-2xl font-bold tabular-nums",
          TILE_VALUE_TONES[valueTone]
        )}
      >
        {value}
      </p>
      {children && (
        <div className="mt-2 space-y-1 text-sm leading-relaxed text-ink-muted">{children}</div>
      )}
      {link && (
        <div className="mt-auto pt-4">
          <FooterLink href={link.href}>{link.label}</FooterLink>
        </div>
      )}
    </section>
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
 * The last few movements, newest first. The amount carries its own sign and
 * arrow so that direction survives both a colour-blind reader and a printed
 * page; everything older is one tap away on the full statement.
 */
function RecentActivity({
  transactions,
  copy,
  statusCopy,
  money,
  locale,
}: {
  transactions: AccountTransactionRow[];
  copy: StatusCopy;
  statusCopy: Copy["status"];
  money: MoneyFormatter;
  locale: Locale;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="font-heading text-base font-semibold text-ink">
          {copy.recentActivity}
        </h2>
        {transactions.length > 0 && (
          <FooterLink href="/dashboard/statements">{copy.viewFullStatement}</FooterLink>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-sm text-ink-muted">{copy.transactionsEmpty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {transactions.map((transaction) => {
            const isCredit = transaction.direction === "CREDIT";
            const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
            return (
              <li key={transaction.id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    isCredit ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {statusLabel(transaction.type, statusCopy)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatDate(transaction.createdAt, locale)}
                    {transaction.description && ` · ${transaction.description}`}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "whitespace-nowrap text-[15px] font-bold tabular-nums",
                      isCredit ? "text-emerald-700" : "text-ink"
                    )}
                  >
                    {isCredit ? "+" : "−"}
                    {money(transaction.amount)}
                  </p>
                  <p className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
                    {copy.balanceColumn}: {money(transaction.balanceAfter)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
