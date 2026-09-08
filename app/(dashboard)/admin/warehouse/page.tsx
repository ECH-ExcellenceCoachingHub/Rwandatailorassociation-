import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  Coins,
  Package,
  Users,
} from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  getWarehouseOverview,
  listItems,
  listIssuances,
  listMovements,
  type WarehouseItemSummary,
} from "@/lib/services/warehouse";
import { formatMoney, toMoneyString } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { getDashboardCopy } from "@/lib/i18n/server";
import { pluralize } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import type { Locale } from "@/types";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import {
  AdjustStockButton,
  CancelIssuanceButton,
  EditItemButton,
  IssueGoodsButton,
  NewItemButton,
  ReceiveStockButton,
  RecordReturnButton,
  SettleIssuanceButton,
  WriteOffButton,
} from "@/components/dashboard/WarehouseForms";

/**
 * The store, from the committee's side.
 *
 * Three tabs, because there are three questions and they belong to different
 * people. The storekeeper asks what is on the shelf; the treasurer asks who
 * owes for what they took; whoever is checking the books asks what moved and
 * who recorded it. Putting all three in one list would serve none of them.
 *
 * WHAT THE ACTIONS ARE GATED ON. Four permissions, not one. Seeing the stock
 * book is routine; handing goods to a member creates a debt on their file;
 * correcting the count or writing stock off is how a shortfall gets papered
 * over. The buttons hide accordingly — and every route behind them re-checks,
 * because hidden buttons are cosmetic and the guard is the control.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return { title: `${d.admin.warehouse.title} | RTA` };
}

export const dynamic = "force-dynamic";

export default async function AdminWarehousePage() {
  const context = await requirePermission(
    PERMISSIONS.WAREHOUSE_VIEW,
    "/admin/warehouse"
  );
  const associationId = resolveAssociationScope(context);
  const { d, locale } = await getDashboardCopy();
  const copy = d.admin.warehouse;

  // A super admin who has not chosen an association has no store to show; the
  // service functions all require a tenant, so there is nothing to fetch.
  if (!associationId) {
    return (
      <div className="space-y-6">
        <PageHeader title={copy.title} description={copy.description} />
        <EmptyState
          icon={Package}
          title={d.admin.settings.noAssociationTitle}
          description={d.admin.settings.noAssociationBody}
        />
      </div>
    );
  }

  const [overview, items, issuances, movements, members, loans] = await Promise.all([
    getWarehouseOverview(associationId),
    listItems(associationId, { includeInactive: true }),
    listIssuances(associationId, { pageSize: 50 }),
    listMovements(associationId, { limit: 60 }),

    // Options for the issue form. Only members who may actually receive goods
    // — the service refuses a suspended or exited member anyway, and offering
    // them in the picker only invites a failed submission.
    prisma.member.findMany({
      where: { associationId, status: "ACTIVE" },
      orderBy: { memberNumber: "asc" },
      select: {
        id: true,
        memberNumber: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),

    prisma.loan.findMany({
      where: {
        associationId,
        status: { in: ["DISBURSED", "ACTIVE", "OVERDUE", "PENDING_DISBURSEMENT"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, memberId: true, reference: true },
    }),
  ]);

  const currency = overview.currency;
  const canManage = context.permissions.has(PERMISSIONS.WAREHOUSE_MANAGE);
  const canIssue = context.permissions.has(PERMISSIONS.WAREHOUSE_ISSUE);
  const canAdjust = context.permissions.has(PERMISSIONS.WAREHOUSE_ADJUST);

  const itemOptions = items
    .filter((item) => item.isActive)
    .map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      unitPrice: item.unitPrice,
      quantityOnHand: item.quantityOnHand,
    }));

  const memberOptions = members.map((member) => ({
    id: member.id,
    memberNumber: member.memberNumber,
    name: `${member.user.firstName} ${member.user.lastName}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <>
            {canManage && <NewItemButton />}
            {canIssue && itemOptions.length > 0 && (
              <IssueGoodsButton
                items={itemOptions}
                members={memberOptions}
                loans={loans}
              />
            )}
          </>
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label={copy.stockValue}
          value={formatMoney(overview.stockValue, { currency })}
          hint={pluralize(copy.itemsHeld, overview.itemCount)}
          icon={Boxes}
          tone="primary"
        />
        <StatCard
          label={copy.withMembers}
          value={formatMoney(overview.issuedValue, { currency })}
          hint={copy.withMembersHint}
          icon={Users}
        />
        <StatCard
          label={copy.owedByMembers}
          value={formatMoney(overview.owedValue, { currency })}
          hint={copy.owedByMembersHint}
          icon={Coins}
          tone={Number(overview.owedValue) > 0 ? "warning" : "default"}
        />
        <StatCard
          label={copy.needsReorder}
          value={String(overview.reorderCount)}
          hint={
            overview.overdueReturns > 0
              ? `${overview.overdueReturns} · ${copy.overdueReturns}`
              : undefined
          }
          icon={AlertTriangle}
          tone={
            overview.reorderCount > 0 || overview.overdueReturns > 0
              ? "warning"
              : "default"
          }
        />
      </StatGrid>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock" count={items.length}>
            {copy.stockTab}
          </TabsTrigger>
          <TabsTrigger value="issues" count={issuances.total}>
            {copy.issuesTab}
          </TabsTrigger>
          <TabsTrigger value="movements">{copy.movementsTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="pt-5">
          {items.length === 0 ? (
            <EmptyState
              icon={Package}
              title={copy.noItemsTitle}
              description={copy.noItemsBody}
              action={canManage ? <NewItemButton /> : undefined}
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <StockRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  copy={copy}
                  canManage={canManage}
                  canAdjust={canAdjust}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="issues" className="pt-5">
          {issuances.rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={copy.noIssuesTitle}
              description={copy.noIssuesBody}
            />
          ) : (
            <ul className="space-y-4">
              {issuances.rows.map((issuance) => (
                <li
                  key={issuance.id}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold tracking-wide text-ink">
                        {issuance.reference}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {issuance.memberName}{" "}
                        <span className="font-mono text-xs font-normal text-ink-muted">
                          {issuance.memberNumber}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {copy.issuedOn} {formatDate(issuance.issuedAt, locale)}
                        {issuance.issuedByName && ` · ${issuance.issuedByName}`}
                        {issuance.loanReference && ` · ${issuance.loanReference}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge status={issuance.terms} size="sm" />
                      <StatusBadge status={issuance.status} size="sm" />
                      {issuance.isOverdueBack && (
                        <StatusBadge
                          status="OVERDUE"
                          label={copy.overdueReturns}
                          size="sm"
                        />
                      )}
                    </div>
                  </div>

                  <ul className="mt-4 space-y-2 border-t border-border pt-4">
                    {issuance.lines.map((line) => (
                      <li
                        key={line.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm"
                      >
                        <span className="font-medium text-ink">{line.itemName}</span>
                        <span className="text-ink-muted">
                          {formatQuantity(line.quantity, line.unit)}
                          {Number(line.quantityReturned) > 0 &&
                            ` · ${copy.stillOut} ${formatQuantity(
                              line.quantityOutstanding,
                              line.unit
                            )}`}{" "}
                          ·{" "}
                          <span className="tabular-nums text-ink">
                            {formatMoney(line.lineValue, { currency })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <span className="text-ink-muted">
                        {copy.issueValue}:{" "}
                        <strong className="tabular-nums text-ink">
                          {formatMoney(issuance.totalValue, { currency })}
                        </strong>
                      </span>
                      <span className="text-ink-muted">
                        {copy.issueSettled}:{" "}
                        <strong className="tabular-nums text-emerald-700">
                          {formatMoney(issuance.amountSettled, { currency })}
                        </strong>
                      </span>
                      {Number(issuance.amountOwed) > 0 && (
                        <span className="text-ink-muted">
                          {copy.issueOwed}:{" "}
                          <strong className="tabular-nums text-red-700">
                            {formatMoney(issuance.amountOwed, { currency })}
                          </strong>
                        </span>
                      )}
                      {issuance.dueBackAt && (
                        <span className="inline-flex items-center gap-1.5 text-ink-muted">
                          <CalendarClock className="size-3.5" aria-hidden="true" />
                          {formatDate(issuance.dueBackAt, locale)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canIssue && issuance.status !== "CANCELLED" && (
                        <>
                          {issuance.lines.some(
                            (line) => Number(line.quantityOutstanding) > 0
                          ) && (
                            <RecordReturnButton
                              issuance={{
                                id: issuance.id,
                                reference: issuance.reference,
                                memberName: issuance.memberName,
                                amountOwed: issuance.amountOwed,
                                currency: issuance.currency,
                                lines: issuance.lines.map((line) => ({
                                  id: line.id,
                                  itemName: line.itemName,
                                  unit: line.unit,
                                  quantityOutstanding: line.quantityOutstanding,
                                })),
                              }}
                            />
                          )}
                          {Number(issuance.amountOwed) > 0 && (
                            <SettleIssuanceButton
                              issuance={{
                                id: issuance.id,
                                reference: issuance.reference,
                                memberName: issuance.memberName,
                                amountOwed: issuance.amountOwed,
                                currency: issuance.currency,
                                lines: [],
                              }}
                            />
                          )}
                        </>
                      )}
                      {canAdjust &&
                        issuance.status !== "CANCELLED" &&
                        Number(issuance.amountSettled) === 0 && (
                          <CancelIssuanceButton
                            issuance={{
                              id: issuance.id,
                              reference: issuance.reference,
                              memberName: issuance.memberName,
                              amountOwed: issuance.amountOwed,
                              currency: issuance.currency,
                              lines: [],
                            }}
                          />
                        )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="movements" className="pt-5">
          <MovementsTable
            movements={movements}
            currency={currency}
            copy={copy}
            locale={locale}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type WarehouseCopy = Awaited<
  ReturnType<typeof getDashboardCopy>
>["d"]["admin"]["warehouse"];

/**
 * One catalogue line. A card rather than a table row: it carries a name, two
 * prices, two counts, a state and up to four actions, and that does not fit a
 * row on a phone in any arrangement.
 */
function StockRow({
  item,
  currency,
  copy,
  canManage,
  canAdjust,
}: {
  item: WarehouseItemSummary;
  currency: string;
  copy: WarehouseCopy;
  canManage: boolean;
  canAdjust: boolean;
}) {
  const defaults = {
    id: item.id,
    sku: item.sku,
    name: item.name,
    nameRw: item.nameRw,
    category: item.category,
    unit: item.unit,
    unitCost: item.unitCost,
    unitPrice: item.unitPrice,
    reorderLevel: item.reorderLevel,
    quantityOnHand: item.quantityOnHand,
    notes: item.notes,
    isActive: item.isActive,
  };

  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-semibold text-ink">
              {item.name}
            </h3>
            <span className="font-mono text-xs text-ink-muted">{item.sku}</span>
            <StatusBadge status={item.category} size="sm" />
            {item.needsReorder && (
              <StatusBadge status="DUE" label={copy.reorderBadge} size="sm" />
            )}
            {!item.isActive && (
              <StatusBadge status="ARCHIVED" label={copy.archived} size="sm" />
            )}
          </div>
          {item.nameRw && (
            <p className="mt-1 text-sm text-ink-muted">{item.nameRw}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {canManage && (
            <>
              <ReceiveStockButton item={defaults} />
              <EditItemButton item={defaults} />
            </>
          )}
          {canAdjust && (
            <>
              <AdjustStockButton item={defaults} />
              <WriteOffButton item={defaults} />
            </>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
        <Cell label={copy.onHand} value={formatQuantity(item.quantityOnHand, item.unit)} />
        <Cell label={copy.issuedOut} value={formatQuantity(item.quantityIssued, item.unit)} />
        <Cell label={copy.unitCost} value={formatMoney(item.unitCost, { currency })} />
        <Cell label={copy.unitPrice} value={formatMoney(item.unitPrice, { currency })} />
        <Cell label={copy.stockValue} value={formatMoney(item.stockValue, { currency })} />
      </dl>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

/**
 * The stock ledger. The direction is carried by an arrow and the sign as well
 * as by colour — the same rule the savings ledger follows, and for the same
 * reason: on a movement row, the direction is the whole meaning.
 */
function MovementsTable({
  movements,
  currency,
  copy,
  locale,
}: {
  movements: Awaited<ReturnType<typeof listMovements>>;
  currency: string;
  copy: WarehouseCopy;
  locale: Locale;
}) {
  return (
    <TableWrapper>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.movementWhen}</TableHead>
            <TableHead>{copy.movementType}</TableHead>
            <TableHead>{copy.movementItem}</TableHead>
            <TableHead align="right">{copy.quantity}</TableHead>
            <TableHead align="right">{copy.onHand}</TableHead>
            <TableHead align="right">{copy.value}</TableHead>
            <TableHead>{copy.movementWho}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.length === 0 ? (
            <TableEmpty colSpan={7}>{copy.noMovements}</TableEmpty>
          ) : (
            movements.map((movement) => {
              const isIn = movement.direction === "IN";
              const Arrow = isIn ? ArrowDownLeft : ArrowUpRight;

              return (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap text-ink-muted">
                    {formatDate(movement.occurredAt, locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={movement.type} size="sm" />
                      <span className="font-mono text-[11px] text-ink-muted">
                        {movement.reference}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{movement.itemName}</span>
                    {(movement.memberName || movement.supplierName) && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {movement.memberName ?? movement.supplierName}
                      </span>
                    )}
                    {movement.reason && (
                      <span className="mt-0.5 block text-xs italic text-ink-muted">
                        {movement.reason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <span
                      className={`inline-flex items-center justify-end gap-1 whitespace-nowrap font-medium tabular-nums ${
                        isIn ? "text-emerald-700" : "text-ink"
                      }`}
                    >
                      <Arrow className="size-3.5 shrink-0" aria-hidden="true" />
                      {isIn ? "+" : "−"}
                      {formatQuantity(movement.quantity, movement.unit)}
                    </span>
                  </TableCell>
                  <TableCell align="right" tabular>
                    {formatQuantity(movement.quantityAfter)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(toMoneyString(movement.totalValue), { currency })}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {movement.recordedByName ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}
