import type { Metadata } from "next";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Gavel,
  Landmark,
  Phone,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getAccountStatusSummary,
  type AccountStatusSummary,
} from "@/lib/services/account-status";
import { formatMoney } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import type { Locale } from "@/types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { EnrolAsMemberButton } from "@/components/account/EnrolAsMemberButton";
import { GuaranteeResponse } from "@/components/account/GuaranteeResponse";
import { CountUp } from "@/components/account/CountUp";
import { StatusBackdrop } from "@/components/account/StatusBackdrop";

/**
 * Account status — the first screen after a QR sign-in, and a page in its own
 * right the rest of the time. The dashboard shell leaves it bare (no sidebar,
 * no top bar), so the page paints its own full-screen background.
 *
 * It shows exactly what the by-laws (Art. 9, "Ibaruramari ry'amafaranga
 * y'abanyamuryango") say a member's record must carry, as three plain lists:
 *
 *   1. Who you are — names, member ID, telephone, shares held, total paid in.
 *   2. The approved loan and its guarantor — the amount taken, what has been
 *      repaid, what is left.
 *   3. Penalties.
 *
 * Every line is always shown, with a zero or "none" where there is nothing,
 * so a member never wonders whether a figure is missing or simply empty. The
 * only extras are the ones that ask the reader to act: a suspension or overdue
 * notice, and guarantee requests, which are answered on this page and nowhere
 * else.
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

export default async function AccountStatusPage() {
  const context = await requireAuth("/account/status");
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
  // route handler re-checks every part of this.
  const canOpenSavings =
    !summary &&
    Boolean(context.user.associationId) &&
    context.permissions.has(PERMISSIONS.MEMBERS_CREATE);

  // Each list enters a beat after the one above it.
  const shared = summary ? { summary, copy, money, currency } : null;
  const offset = summary && summary.guarantees.requests.length > 0 ? STAGGER : 0;

  return (
    <div className="motion-safe-status relative min-h-screen overflow-hidden bg-linear-to-br from-primary via-primary-hover to-footer px-4 py-8 text-white sm:px-6 sm:py-12">
      <StatusBackdrop />

      <div className="relative mx-auto max-w-2xl space-y-7">
        <h1 className="sr-only">{copy.title}</h1>

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

        {shared && summary && (
          <>
            {summary.guarantees.requests.length > 0 && (
              <GuaranteeRequests {...shared} delay={0} />
            )}

            <DetailsList {...shared} delay={offset} />
            <DailyList {...shared} delay={offset + STAGGER} locale={locale} />
            <PayButton copy={copy} delay={offset + STAGGER} />
            <LoanList {...shared} delay={offset + STAGGER * 2} />
            <PenaltiesList {...shared} delay={offset + STAGGER * 3} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The three lists
// ---------------------------------------------------------------------------

type Copy = Awaited<ReturnType<typeof getDashboardCopy>>["d"];
type StatusCopy = Copy["account"]["status"];
type MoneyFormatter = (value: string | null | undefined) => string;

type ListProps = {
  summary: AccountStatusSummary;
  copy: StatusCopy;
  money: MoneyFormatter;
  currency: string;
  /// When this list starts its entrance, in milliseconds.
  delay: number;
};

/// The gap between one list's entrance and the next.
const STAGGER = 160;

/// A headline amount counts up once its row has risen into place.
function amount(value: string | null | undefined, { currency, delay }: ListProps) {
  return <CountUp value={value ?? "0"} currency={currency} delay={delay + 450} />;
}

/** Amazina, MemberID, telephone, imigabane afite, amafaranga yose yatanze. */
function DetailsList(props: ListProps) {
  const { summary, copy } = props;
  return (
    <List icon={UserRound} title={copy.yourDetails} delay={props.delay}>
      <Item label={copy.fullName} value={summary.fullName} wrap />
      <Item label={copy.memberNumber} value={summary.memberNumber} />
      <Item
        label={copy.telephone}
        value={summary.phone ?? copy.notProvided}
        tone={summary.phone ? "default" : "muted"}
      />
      <Item label={copy.sharesCount} value={String(summary.shares)} />
      <Item
        label={copy.totalContributed}
        value={amount(summary.savings?.totalDeposits, props)}
        tone={Number(summary.savings?.totalDeposits ?? 0) > 0 ? "success" : "default"}
        strong
      />
    </List>
  );
}

/**
 * What the member has paid in, set against one day's contribution for their
 * shares: how much was due up to today, and what is left over — paid ahead and
 * covering the days to come — or still to pay. Ends with the date the money
 * runs out, which is the question behind all of it.
 */
function DailyList(props: ListProps & { locale: Locale }) {
  const { summary, copy, money, locale } = props;
  const c = summary.contribution;
  if (!c) return null;

  const ahead = Number(c.paidAheadAmount) > 0;
  const behind = Number(c.behindAmount) > 0;

  return (
    <List
      icon={CalendarCheck}
      title={copy.dailyTitle}
      description={copy.dailyHint}
      delay={props.delay}
    >
      <Item
        label={copy.dailyContribution}
        hint={pluralize(copy.dailyContributionHint, c.shares, {
          shares: c.shares,
          perShare: money(c.perShareDaily),
        })}
        value={amount(c.dailyTotal, props)}
        strong
      />
      <Item label={copy.totalDeposited} value={money(c.totalDeposited)} />
      <Item
        label={copy.dueSoFar}
        hint={pluralize(copy.dueSoFarHint, c.daysDue, {
          days: c.daysDue,
          daily: money(c.dailyTotal),
        })}
        value={money(c.dueSoFar)}
      />
      {behind ? (
        <Item
          label={copy.behindAmount}
          hint={pluralize(copy.behindAmountHint, c.behindDays, { days: c.behindDays })}
          value={amount(c.behindAmount, props)}
          tone="danger"
          strong
        />
      ) : (
        <Item
          label={copy.extraDeposited}
          hint={ahead ? fill(copy.extraDepositedHint, { days: c.paidAheadDays }) : undefined}
          value={amount(c.paidAheadAmount, props)}
          tone={ahead ? "success" : "muted"}
          strong
        />
      )}
      {Number(c.leftover) > 0 && (
        <Item label={copy.leftover} hint={copy.leftoverHint} value={money(c.leftover)} />
      )}
      <Item
        label={copy.paidThrough}
        value={c.paidThrough ? formatDate(c.paidThrough, locale) : copy.paidThroughNone}
        wrap
        tone={c.paidThrough ? (behind ? "danger" : "success") : "muted"}
      />
    </List>
  );
}

/// eKash pay code for the association's account. `#` must be sent as `%23`
/// in a tel: URI, or the dialer drops everything from it onward.
const PAY_USSD = "*182*1*2*100278755511#";
const PAY_HREF = `tel:${PAY_USSD.replace(/#/g, "%23")}`;

/**
 * Opens the phone's dialer with the eKash pay code filled in. Browsers never
 * place a call on their own — the member still presses call — but there is
 * nothing to type.
 */
function PayButton({ copy, delay }: { copy: StatusCopy; delay: number }) {
  return (
    <div
      className="animate-status-rise space-y-2 [animation-delay:var(--status-delay)]"
      style={{ "--status-delay": `${delay + 300}ms` } as CSSProperties}
    >
      <a
        href={PAY_HREF}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-amber-400 px-5 py-4 font-heading text-lg font-bold text-[#0f2a52] shadow-xl shadow-black/25 transition hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
      >
        <Phone className="size-5" aria-hidden="true" />
        {copy.payNow}
      </a>
      <p className="px-1 text-center text-[13px] leading-snug text-primary-100/80">
        {copy.payNowHint}{" "}
        <span className="whitespace-nowrap font-semibold tabular-nums text-white">{PAY_USSD}</span>
      </p>
    </div>
  );
}

/**
 * Inguzanyo yemerewe + umwishingizi. While a loan is being repaid, its own
 * figures; otherwise the totals across past loans with nothing left owing —
 * and zeroes for somebody who has never borrowed. All four lines always show.
 */
function LoanList(props: ListProps) {
  const { summary, copy, money } = props;
  const loan = summary.loan;
  const running = Boolean(loan?.reference);

  const borrowed = running ? loan!.principal : loan?.lifetimeBorrowed;
  const repaid = running ? loan!.totalPaid : loan?.lifetimeRepaid;
  const remaining = running ? loan!.outstanding : "0";
  const owing = Number(remaining) > 0;

  const guarantors = running
    ? summary.guarantees.mine
        .filter((g) => g.status !== "DECLINED")
        .map((g) => g.guarantorName)
    : [];

  return (
    <List icon={Landmark} title={copy.loanSectionTitle} delay={props.delay}>
      <Item label={copy.amountBorrowed} value={amount(borrowed, props)} strong />
      <Item
        label={guarantors.length > 1 ? copy.myGuarantorsTitle : copy.guarantor}
        value={guarantors.length > 0 ? guarantors.join(", ") : copy.noGuarantor}
        wrap
        tone={guarantors.length > 0 ? "default" : "muted"}
      />
      <Item label={copy.amountRepaid} value={money(repaid)} tone="success" />
      <Item
        label={copy.amountRemaining}
        value={amount(remaining, props)}
        tone={owing ? "danger" : "success"}
        strong
      />
    </List>
  );
}

/** Ibihano. */
function PenaltiesList(props: ListProps) {
  const { summary, copy, money } = props;
  const { fines } = summary;
  const owing = fines.outstandingCount > 0;

  return (
    <List
      icon={Gavel}
      title={copy.penaltiesTitle}
      delay={props.delay}
      footer={
        owing && (
          <Link
            href="/dashboard/fines"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-light underline-offset-4 hover:text-white hover:underline"
          >
            {copy.finesSeeAll}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )
      }
    >
      <Item
        label={copy.penaltiesUnpaid}
        value={amount(fines.outstandingAmount, props)}
        tone={owing ? "danger" : "success"}
        strong
      />
      <Item label={copy.finesPaid} value={money(fines.settledAmount)} />
    </List>
  );
}

/**
 * Requests to guarantee somebody's loan. Kept because this page is the only
 * place they can be answered. Set on white so the answer buttons read the way
 * they do everywhere else.
 */
function GuaranteeRequests({ summary, copy, money, delay }: ListProps) {
  return (
    <List icon={TriangleAlert} title={copy.guaranteeRequestsTitle} delay={delay} light>
      {summary.guarantees.requests.map((request) => (
        <li key={request.id} className="space-y-2 px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words text-[15px] font-semibold text-ink">
                {request.borrowerName} · {request.borrowerMemberNumber}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                {fill(copy.guaranteeRequestLine, {
                  loan: money(request.loanAmount),
                  months: request.termMonths,
                  reference: request.reference,
                })}
              </p>
            </div>
            <p className="shrink-0 text-[15px] font-bold tabular-nums text-primary-hover">
              {money(request.amount)}
            </p>
          </div>
          <GuaranteeResponse
            guaranteeId={request.id}
            borrowerName={request.borrowerName}
            amount={money(request.amount)}
          />
        </li>
      ))}
    </List>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/**
 * A titled list: heading above, one line per fact below, on a frosted panel
 * over the blue. `light` sets it on white instead, for rows holding controls.
 *
 * The heading colour is set explicitly: the global stylesheet paints every
 * h1–h6 in ink, which is unreadable on this background.
 */
function List({
  icon: Icon,
  title,
  description,
  delay,
  footer,
  light,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  description?: string;
  delay: number;
  footer?: ReactNode;
  light?: boolean;
  children: ReactNode;
}) {
  return (
    <section style={{ "--status-delay": `${delay}ms` } as CSSProperties}>
      <h2 className="flex animate-status-rise items-center gap-3 px-1 font-heading text-[17px] font-semibold leading-snug tracking-tight text-white [animation-delay:var(--status-delay)] sm:text-lg">
        <span className="grid size-9 shrink-0 animate-status-pop place-items-center rounded-xl bg-white text-primary shadow-md shadow-black/20 [animation-delay:calc(var(--status-delay)_+_80ms)]">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        {title}
      </h2>
      {description && (
        <p className="mt-2 animate-status-rise px-1 text-sm [animation-delay:calc(var(--status-delay)_+_60ms)] leading-relaxed text-primary-100/90">{description}</p>
      )}
      <ul
        className={cn(
          "status-rows mt-3 overflow-hidden rounded-2xl",
          light
            ? "divide-y divide-border bg-surface text-ink shadow-lift"
            : "divide-y divide-white/[0.08] bg-[#0f2a52]/90 shadow-xl shadow-black/25 ring-1 ring-white/10 backdrop-blur-xl"
        )}
      >
        {children}
      </ul>
      {footer && (
        <div className="mt-2.5 animate-status-rise px-1 [animation-delay:calc(var(--status-delay)_+_500ms)]">
          {footer}
        </div>
      )}
    </section>
  );
}

/// Plain figures: coloured text only.
const VALUE_TONES = {
  default: "text-white",
  success: "text-emerald-300",
  danger: "text-rose-300",
  muted: "text-[15px] font-medium text-white/60",
} as const;

/// Headline figures: the same colours, set on a soft pill so the eye finds
/// them first in each list.
const STRONG_TONES = {
  default: "text-white",
  success: "rounded-lg bg-emerald-400/15 px-3 py-1 text-emerald-300 ring-1 ring-emerald-400/40",
  danger: "rounded-lg bg-rose-500/15 px-3 py-1 text-rose-300 ring-1 ring-rose-400/40",
  muted: "text-white/60",
} as const;

/**
 * One line of a list: what it is on the left, the figure on the right.
 * Figures never wrap — "RWF" on one line and the amount on the next is how a
 * balance gets misread — unless `wrap` is set for free text such as a name.
 */
function Item({
  label,
  hint,
  value,
  tone = "default",
  strong,
  wrap,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  tone?: keyof typeof VALUE_TONES;
  strong?: boolean;
  wrap?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-300 hover:bg-white/[0.04] sm:px-5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-white/90">{label}</span>
        {hint && (
          <span className="mt-1 block text-[13px] leading-snug text-primary-100/70">{hint}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 text-right tabular-nums",
          wrap ? "max-w-[55%] shrink break-words" : "whitespace-nowrap",
          strong
            ? cn(
                "font-heading text-lg font-bold tracking-tight",
                STRONG_TONES[tone],
                (tone === "success" || tone === "danger") && "status-sheen"
              )
            : cn("text-base font-semibold", VALUE_TONES[tone])
        )}
      >
        {value}
      </span>
    </li>
  );
}
