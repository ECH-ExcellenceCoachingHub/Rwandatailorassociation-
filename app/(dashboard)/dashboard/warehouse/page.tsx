import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  CalendarClock,
  Coins,
  Package,
  Scale,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { listItems, getMemberWarehouseSummary } from "@/lib/services/warehouse";
import { getMemberCreditSummary } from "@/lib/services/warehouse-credit";
import { getPolicy } from "@/lib/services/rulebook";
import { formatMoney, isPositive, toMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * THE STORE, FROM THE MEMBER'S SIDE.
 *
 * Three tabs, because a member arrives with one of three questions and the
 * answers have nothing to do with each other: what can I get and what would it
 * cost, what have I already taken, and what do I still owe and by when.
 *
 * WHY THE STOCK LIST IS NOT GATED. A member is looking at goods their own
 * savings paid for. Hiding the shelf behind a permission would mean the only
 * way to find out whether the association has thread in stock is to walk to
 * the store — which is the situation this page exists to end. Prices are shown
 * at the SELLING price, which is what this reader would actually be charged;
 * the cost price and the stock valuation are the committee's business and stay
 * on the admin screen.
 *
 * WHY THE CREDIT TAB RESTATES THE RULES. A member reading this page is looking
 * at a fine, or about to earn one. Making them navigate to the rulebook to
 * find out why 4,760 was added is how a rule becomes a grievance. The figures
 * come from the same policy the fine was calculated from, so the explanation
 * and the charge cannot drift apart.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.member.warehouse.title} | RTA` };
}

export const dynamic = "force-dynamic";

export default async function MemberWarehousePage() {
  const context = await requireMember("/dashboard/warehouse");
  const { d, locale } = await getDashboardCopy();
  const copy = d.member.warehouse;

  const memberId = context.member!.id;

  // NULLABLE, and not asserted away. `requireMember` guarantees a member
  // record, not a tenant — a super admin holding one carries no association of
  // their own. Passing null into `listItems` would drop the association filter
  // and put every tenant's stock on one member's screen, so the catalogue is
  // simply empty in that case. The member's own issues and credits are scoped
  // by memberId and are safe either way.
  const associationId = context.user.associationId;

  const [items, mine, credit, policy] = await Promise.all([
    associationId ? listItems(associationId) : Promise.resolve([]),
    getMemberWarehouseSummary(memberId),
    getMemberCreditSummary(memberId),
    getPolicy(associationId),
  ]);

  const currency = mine?.currency ?? credit?.currency ?? "RWF";
  const date = (value: Date | string) => formatDate(value, locale);
  const money = (value: string) => formatMoney(value, { currency });

  const issuances = mine?.issuances ?? [];
  const credits = credit?.credits ?? [];

  const nextDue = credit?.nextDue ?? null;

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      <StatGrid>
        <StatCard
          label={copy.takenTotal}
          value={money(mine?.totalIssuedValue ?? "0")}
          hint={copy.takenTotalHint}
          icon={ShoppingBag}
        />
        <StatCard
          label={copy.owedOutright}
          value={money(mine?.totalOwed ?? "0")}
          hint={copy.owedOutrightHint}
          icon={Wallet}
          tone={isPositive(mine?.totalOwed ?? "0") ? "warning" : "default"}
        />
        <StatCard
          label={copy.owedOnCredit}
          value={money(credit?.totalOutstanding ?? "0")}
          hint={copy.owedOnCreditHint}
          icon={Coins}
          tone={
            credit && credit.overdueCount > 0
              ? "danger"
              : isPositive(credit?.totalOutstanding ?? "0")
                ? "warning"
                : "default"
          }
        />
        <StatCard
          label={copy.nextPayment}
          value={nextDue ? money(nextDue.amount) : copy.nothingDue}
          hint={nextDue ? date(nextDue.dueDate) : copy.nextPaymentHint}
          icon={CalendarClock}
          tone={nextDue?.isOverdue ? "danger" : "default"}
        />
      </StatGrid>

      {credit && credit.overdueCount > 0 && (
        <Alert variant="error" title={copy.fineTitle}>
          {fill(copy.rulesFine, { rate: trimRate(policy.warehouseCreditFineRate) })}
        </Alert>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{copy.tabStock}</TabsTrigger>
          <TabsTrigger value="mine">{copy.tabMine}</TabsTrigger>
          <TabsTrigger value="credit">{copy.tabCredit}</TabsTrigger>
        </TabsList>

        {/* --- What is on the shelf ---------------------------------------- */}
        <TabsContent value="stock" className="space-y-4">
          <SectionIntro title={copy.stockTitle} body={copy.stockHint} />

          {items.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={copy.stockEmptyTitle}
              description={copy.stockEmptyBody}
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.itemColumn}</TableHead>
                      <TableHead>{copy.categoryColumn}</TableHead>
                      <TableHead className="text-right">{copy.priceColumn}</TableHead>
                      <TableHead className="text-right">
                        {copy.availableColumn}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const available = toMoney(item.quantityOnHand);
                      const out = !available.greaterThan(0);

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="font-medium text-ink">
                              {locale === "rw" && item.nameRw ? item.nameRw : item.name}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {item.sku}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={item.category} size="sm" />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(item.unitPrice)}
                            <span className="block text-xs text-ink-muted">
                              / {item.unit}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                out
                                  ? "text-sm font-medium text-danger"
                                  : item.needsReorder
                                    ? "text-sm font-medium text-warning"
                                    : "text-sm font-medium text-ink"
                              }
                            >
                              {out
                                ? copy.outOfStock
                                : `${formatQuantity(item.quantityOnHand)} ${item.unit}`}
                            </span>
                            {!out && item.needsReorder && (
                              <span className="block text-xs text-ink-muted">
                                {copy.lowStock}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableWrapper>

              <p className="text-sm text-ink-muted">{copy.askOfficer}</p>
            </>
          )}
        </TabsContent>

        {/* --- What I took ------------------------------------------------- */}
        <TabsContent value="mine" className="space-y-4">
          <SectionIntro title={copy.mineTitle} body={copy.mineHint} />

          {issuances.length === 0 ? (
            <EmptyState
              icon={Package}
              title={copy.mineEmptyTitle}
              description={copy.mineEmptyBody}
            />
          ) : (
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.referenceColumn}</TableHead>
                    <TableHead>{copy.dateColumn}</TableHead>
                    <TableHead>{copy.termsColumn}</TableHead>
                    <TableHead>{copy.statusColumn}</TableHead>
                    <TableHead className="text-right">{copy.valueColumn}</TableHead>
                    <TableHead className="text-right">{copy.owedColumn}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuances.map((issue) => {
                    // What this issue still costs the member: an outright
                    // purchase carries its own balance, goods on credit carry
                    // theirs on the credit. Never both — see CHARGEABLE_TERMS
                    // in lib/services/warehouse.ts.
                    const owed = issue.credit
                      ? issue.credit.outstanding
                      : issue.amountOwed;

                    return (
                      <TableRow key={issue.id}>
                        <TableCell>
                          <span className="font-mono text-xs text-ink">
                            {issue.reference}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {pluralize(copy.itemsTaken, issue.lines.length)}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {date(issue.issuedAt)}
                          {issue.dueBackAt && (
                            <span
                              className={
                                issue.isOverdueBack
                                  ? "block text-xs font-medium text-danger"
                                  : "block text-xs text-ink-muted"
                              }
                            >
                              {fill(
                                issue.isOverdueBack ? copy.overdueBack : copy.dueBack,
                                { date: date(issue.dueBackAt) }
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={issue.terms} size="sm" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={issue.status} size="sm" />
                          {issue.settledAt && (
                            <span className="block text-xs text-ink-muted">
                              {fill(copy.settledOn, { date: date(issue.settledAt) })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(issue.totalValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {isPositive(owed) ? (
                            <span className="font-medium text-warning">
                              {money(owed)}
                            </span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        {/* --- Paying off --------------------------------------------------- */}
        <TabsContent value="credit" className="space-y-6">
          <SectionIntro title={copy.creditTitle} body={copy.creditHint} />

          {credits.length === 0 ? (
            <EmptyState
              icon={Coins}
              title={copy.creditEmptyTitle}
              description={copy.creditEmptyBody}
            />
          ) : (
            credits.map((item) => (
              <article
                key={item.id}
                className="space-y-5 rounded-2xl border border-border bg-surface p-5"
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-muted">
                        {item.reference}
                      </span>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <h3 className="mt-1 font-heading text-base font-semibold text-ink">
                      {item.itemSummary}
                    </h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      {fill(copy.openedOn, { date: date(item.startedAt) })} ·{" "}
                      {fill(copy.finishBy, { date: date(item.maturityDate) })}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm sm:grid-cols-4">
                    <Figure label={copy.goodsValue} value={money(item.goodsValue)} />
                    <Figure
                      label={copy.interestCharged}
                      value={money(item.interestAmount)}
                    />
                    <Figure label={copy.paidSoFar} value={money(item.totalPaid)} />
                    <Figure
                      label={copy.stillOwed}
                      value={money(item.totalOutstanding)}
                      tone={item.isOverdue ? "danger" : "warning"}
                    />
                  </dl>
                </header>

                {/* The three payments */}
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-ink">
                    {copy.scheduleTitle}
                  </h4>
                  <TableWrapper>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{copy.monthColumn}</TableHead>
                          <TableHead>{copy.dueDateColumn}</TableHead>
                          <TableHead>{copy.statusColumn}</TableHead>
                          <TableHead className="text-right">
                            {copy.amountColumn}
                          </TableHead>
                          <TableHead className="text-right">
                            {copy.paidColumn}
                          </TableHead>
                          <TableHead className="text-right">
                            {copy.remainingColumn}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.installments.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {row.installmentNumber}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {date(row.dueDate)}
                              {row.isOverdue && (
                                <span className="block text-xs font-medium text-danger">
                                  {pluralize(copy.daysLate, row.daysOverdue)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} size="sm" />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(row.totalDue)}
                              {isPositive(row.penaltyDue) && (
                                <span className="block text-xs text-danger">
                                  + {money(row.penaltyDue)} {copy.towardFine}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-ink-muted">
                              {money(row.totalPaid)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {isPositive(row.outstanding) ? (
                                <span
                                  className={
                                    row.isOverdue
                                      ? "font-medium text-danger"
                                      : "font-medium text-ink"
                                  }
                                >
                                  {money(row.outstanding)}
                                </span>
                              ) : (
                                <span className="text-ink-muted">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableWrapper>
                </section>

                {/* Every fine, with the sum that produced it */}
                {item.installments
                  .filter((row) => row.fine)
                  .map((row) => (
                    <Alert
                      key={row.fine!.id}
                      variant={row.fine!.status === "WAIVED" ? "info" : "error"}
                      title={fill(copy.fineOn, { number: row.installmentNumber })}
                    >
                      {fill(copy.fineBody, {
                        amount: money(row.fine!.amount),
                        rate: trimRate(row.fine!.rate),
                        arrears: money(row.fine!.arrearsAmount),
                      })}
                      {row.fine!.status === "WAIVED" && ` — ${copy.fineWaived}`}
                      {row.fine!.status === "SETTLED" && ` — ${copy.fineSettled}`}
                    </Alert>
                  ))}

                {/* What has actually been paid */}
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-ink">
                    {copy.paymentsTitle}
                  </h4>

                  {item.payments.length === 0 ? (
                    <p className="text-sm text-ink-muted">{copy.noPaymentsYet}</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {item.payments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
                        >
                          <div>
                            <span className="font-medium text-ink">
                              {money(payment.amount)}
                            </span>
                            <span className="ml-2 text-xs text-ink-muted">
                              {date(payment.occurredAt)} ·{" "}
                              {payment.fromSavings
                                ? copy.paidFromSavings
                                : copy.paidInCash}
                            </span>
                          </div>
                          {/* The split, so a member can see where their money
                              went rather than only that it left. */}
                          <span className="text-xs text-ink-muted">
                            {[
                              isPositive(payment.penaltyPortion) &&
                                `${money(payment.penaltyPortion)} ${copy.towardFine}`,
                              isPositive(payment.interestPortion) &&
                                `${money(payment.interestPortion)} ${copy.towardInterest}`,
                              isPositive(payment.principalPortion) &&
                                `${money(payment.principalPortion)} ${copy.towardGoods}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </article>
            ))
          )}

          {/* The rules, where they bite */}
          <section className="space-y-3 rounded-2xl border border-border bg-surface-muted p-5">
            <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
              <Scale className="size-4" aria-hidden="true" />
              {copy.rulesTitle}
            </h3>
            <ul className="space-y-1.5 text-sm text-ink-muted">
              <li>{copy.rulesInterest}</li>
              <li>
                {fill(copy.rulesTerm, { count: policy.warehouseCreditTermMonths })}
              </li>
              <li>
                {fill(copy.rulesFine, {
                  rate: trimRate(policy.warehouseCreditFineRate),
                })}
              </li>
              <li className="font-medium text-ink">{copy.rulesDestination}</li>
            </ul>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/rules">{copy.readFullRules}</Link>
            </Button>
          </section>

          <Alert variant="info" title={copy.howToPayTitle}>
            {copy.howToPayBody}
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * "7.0000" reads as a database column, not a rule. Trailing zeros are dropped
 * so the member sees the 7% they were told about.
 */
function trimRate(rate: string): string {
  return toMoney(rate).toDecimalPlaces(2).toString();
}

function SectionIntro({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{body}</p>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "font-semibold tabular-nums text-danger"
            : tone === "warning"
              ? "font-semibold tabular-nums text-warning"
              : "font-semibold tabular-nums text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
