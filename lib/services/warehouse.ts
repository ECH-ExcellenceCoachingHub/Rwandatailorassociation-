import "server-only";
import { customAlphabet } from "nanoid";
import { Prisma, prisma, withFinancialTransaction, type TxClient } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { add, gt, gte, isPositive, multiply, subtract, toMoney, toMoneyString } from "@/lib/money";
import {
  gtQuantity,
  isPositiveQuantity,
  subtractQuantity,
  toQuantity,
  toQuantityString,
} from "@/lib/quantity";
import { postSavingsTransaction } from "@/lib/services/ledger";
import { openCreditWithin } from "@/lib/services/warehouse-credit";
import { getPolicy } from "@/lib/services/rulebook";
import type {
  InstallmentStatus,
  WarehouseCreditStatus,
  WarehouseIssuanceStatus,
  WarehouseIssueTerms,
  WarehouseItemCategory,
  WarehouseMovementType,
} from "@/lib/generated/prisma/enums";

/**
 * THE STORE, AND WHAT LEAVES IT ON A MEMBER'S NAME.
 *
 * An association that buys fabric by the roll and sewing machines by the crate
 * is moving members' money just as surely as when it lends cash — but goods
 * leave no ledger row unless something writes one. Before this module, a
 * machine handed to a member on credit existed only in a storekeeper's
 * notebook, and the member's account page could not say they held it.
 *
 * THE SHAPE OF THIS FILE MIRRORS lib/services/ledger.ts DELIBERATELY, because
 * the failure modes are identical and the answers therefore should be too:
 *
 *  1. STOCK MOVES IN ONE STATEMENT. `postStockMovement` claims the next
 *     sequence, moves the quantity and enforces the no-negative-stock guard in
 *     a single UPDATE. The guard lives in the WHERE clause, so there is no
 *     window between "there is enough" and "it has been taken" — two officers
 *     issuing the last roll of fabric at the same moment cannot both succeed.
 *
 *  2. THE MOVEMENT LOG IS APPEND-ONLY. Rows are never updated or deleted. A
 *     miscount is corrected by an ADJUSTMENT that carries a written reason,
 *     never by editing history.
 *
 *  3. QUANTITY ON HAND IS A CACHE. It is only ever written inside the same
 *     transaction that appends a movement, and every movement records
 *     quantityBefore/quantityAfter, so the count can be rebuilt from the log
 *     and a divergence is detectable rather than silent.
 *
 *  4. VALUE IS FROZEN AT THE MOVEMENT. `unitValue` is copied onto the movement
 *     and onto the issuance line, not read back through the item. Prices
 *     change; what a member was charged in March must still read as March's
 *     price in December.
 *
 * WHAT ISSUING DOES NOT DO: it does not touch the member's savings. Handing
 * somebody a roll of fabric records that they have it and what it is worth —
 * collecting the money is a separate, deliberate act (`settleIssuance`), for
 * the same reason a contribution fine is a debt and not an automatic debit. A
 * member with an empty balance must not be driven negative by the act of
 * receiving goods they were told they could pay for later.
 */

// Same alphabet as the savings ledger: these references are read aloud over
// the phone and copied off printed delivery notes.
const referenceId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);

function buildWarehouseReference(prefix: "WHM" | "WHI"): string {
  const now = new Date();
  const period = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${period}-${referenceId()}`;
}

export class WarehouseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "INVALID_QUANTITY"
      | "INVALID_STATE"
      | "REASON_REQUIRED"
      | "DUPLICATE_SKU"
      | "NO_SAVINGS_ACCOUNT"
  ) {
    super(message);
    this.name = "WarehouseError";
  }
}

// ---------------------------------------------------------------------------
// The critical section: moving stock
// ---------------------------------------------------------------------------

interface StockMovementInput {
  itemId: string;
  type: WarehouseMovementType;
  direction: "IN" | "OUT";
  /// Always positive. `direction` carries the sign.
  quantity: string;
  /// Frozen onto the movement. Defaults to the item's cost for stock coming
  /// in and its price for stock going out — the caller may override.
  unitValue?: string | null;
  issuanceId?: string | null;
  issuanceLineId?: string | null;
  supplierName?: string | null;
  deliveryNoteRef?: string | null;
  note?: string | null;
  /// Mandatory for ADJUSTMENT and WRITE_OFF.
  reason?: string | null;
  recordedById?: string | null;
  occurredAt?: Date;
  /// Permit the count to go negative. Only a stock take correcting a book
  /// figure that was already wrong should ever need this.
  allowNegative?: boolean;
}

export interface PostedStockMovement {
  id: string;
  reference: string;
  sequence: number;
  quantity: string;
  quantityBefore: string;
  quantityAfter: string;
  totalValue: string;
  currency: string;
}

/**
 * Appends one movement and moves the item's cached quantity, atomically.
 *
 * Must be called inside a transaction — every caller here does, because a
 * movement that commits without the issuance it belongs to would leave stock
 * missing from the store and owed by nobody.
 */
async function postStockMovement(
  tx: TxClient,
  input: StockMovementInput
): Promise<PostedStockMovement> {
  const quantity = toQuantity(input.quantity);

  if (!isPositiveQuantity(quantity)) {
    throw new WarehouseError(
      `Quantity must be greater than zero (received ${toQuantityString(quantity)})`,
      "INVALID_QUANTITY"
    );
  }

  if (
    (input.type === "ADJUSTMENT" || input.type === "WRITE_OFF") &&
    !input.reason?.trim()
  ) {
    throw new WarehouseError(
      input.type === "ADJUSTMENT"
        ? "A stock adjustment requires a written reason"
        : "A write-off requires a written reason",
      "REASON_REQUIRED"
    );
  }

  const item = await tx.warehouseItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, unitCost: true, unitPrice: true, currency: true, name: true },
  });

  if (!item) {
    throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");
  }

  const unitValue = toMoney(
    input.unitValue ?? (input.direction === "IN" ? item.unitCost : item.unitPrice)
  );
  const totalValue = multiply(unitValue, toQuantityString(quantity));

  // ---------------------------------------------------------------------
  // THE CRITICAL SECTION — one statement, exactly as in the savings ledger.
  //
  // Takes the row lock, enforces the stock guard, claims the next sequence
  // and moves the quantity, returning the before and after values. The guard
  // is in the WHERE clause so the check and the write are indivisible.
  // ---------------------------------------------------------------------
  const delta =
    input.direction === "IN"
      ? toQuantityString(quantity)
      : toQuantityString(quantity.negated());

  const stockGuard = input.allowNegative
    ? Prisma.empty
    : Prisma.sql`AND "quantityOnHand" + ${delta}::numeric >= 0`;

  const updated = await tx.$queryRaw<
    {
      id: string;
      associationId: string;
      quantityBefore: string;
      quantityAfter: string;
      sequence: number;
    }[]
  >`
    UPDATE warehouse_items
    SET "quantityOnHand" = "quantityOnHand" + ${delta}::numeric,
        "lastSequence"   = "lastSequence" + 1,
        "updatedAt"      = now()
    WHERE id = ${input.itemId}
      ${stockGuard}
    RETURNING
      id,
      "associationId",
      ("quantityOnHand" - ${delta}::numeric)::text AS "quantityBefore",
      "quantityOnHand"::text                       AS "quantityAfter",
      "lastSequence"                               AS sequence
  `;

  const row = updated[0];

  // Zero rows means the guard rejected it. The item exists — we read it above
  // — so the only condition that can have failed is the stock check.
  if (!row) {
    const current = await tx.warehouseItem.findUnique({
      where: { id: input.itemId },
      select: { quantityOnHand: true, unit: true },
    });
    throw new WarehouseError(
      `Not enough ${item.name} in the store: ${toQuantityString(current?.quantityOnHand ?? 0)} ` +
        `${current?.unit ?? "unit"} on hand, ${toQuantityString(quantity)} requested`,
      "INSUFFICIENT_STOCK"
    );
  }

  const reference = buildWarehouseReference("WHM");

  const movement = await tx.warehouseStockMovement.create({
    data: {
      associationId: row.associationId,
      itemId: row.id,
      sequence: row.sequence,
      reference,
      type: input.type,
      direction: input.direction,
      quantity: toQuantityString(quantity),
      quantityBefore: row.quantityBefore,
      quantityAfter: row.quantityAfter,
      unitValue: toMoneyString(unitValue),
      totalValue: toMoneyString(totalValue),
      currency: item.currency,
      issuanceId: input.issuanceId ?? null,
      issuanceLineId: input.issuanceLineId ?? null,
      supplierName: input.supplierName ?? null,
      deliveryNoteRef: input.deliveryNoteRef ?? null,
      note: input.note ?? null,
      reason: input.reason ?? null,
      recordedById: input.recordedById ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true, reference: true, sequence: true },
  });

  logger.info(
    {
      reference,
      itemId: row.id,
      type: input.type,
      direction: input.direction,
      quantity: toQuantityString(quantity),
      quantityAfter: row.quantityAfter,
    },
    "warehouse stock movement posted"
  );

  return {
    id: movement.id,
    reference: movement.reference,
    sequence: movement.sequence,
    quantity: toQuantityString(quantity),
    quantityBefore: toQuantityString(row.quantityBefore),
    quantityAfter: toQuantityString(row.quantityAfter),
    totalValue: toMoneyString(totalValue),
    currency: item.currency,
  };
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export interface WarehouseItemSummary {
  id: string;
  sku: string;
  name: string;
  nameRw: string | null;
  category: WarehouseItemCategory;
  unit: string;
  unitCost: string;
  unitPrice: string;
  currency: string;
  quantityOnHand: string;
  quantityIssued: string;
  reorderLevel: string;
  /// Quantity on hand valued at cost — what the association would write down
  /// if this line vanished. At cost, never at price: valuing stock at what you
  /// hope to sell it for books a profit that has not happened.
  stockValue: string;
  /// True when the count has fallen to or below the reorder level, and a
  /// reorder level is actually set.
  needsReorder: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
}

function toItemSummary(item: {
  id: string;
  sku: string;
  name: string;
  nameRw: string | null;
  category: WarehouseItemCategory;
  unit: string;
  unitCost: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  currency: string;
  quantityOnHand: Prisma.Decimal;
  quantityIssued: Prisma.Decimal;
  reorderLevel: Prisma.Decimal;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
}): WarehouseItemSummary {
  const reorderLevel = toQuantity(item.reorderLevel);

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    nameRw: item.nameRw,
    category: item.category,
    unit: item.unit,
    unitCost: toMoneyString(item.unitCost),
    unitPrice: toMoneyString(item.unitPrice),
    currency: item.currency,
    quantityOnHand: toQuantityString(item.quantityOnHand),
    quantityIssued: toQuantityString(item.quantityIssued),
    reorderLevel: toQuantityString(reorderLevel),
    stockValue: toMoneyString(
      multiply(item.unitCost, toQuantityString(item.quantityOnHand))
    ),
    needsReorder:
      isPositiveQuantity(reorderLevel) &&
      !gtQuantity(item.quantityOnHand, reorderLevel),
    isActive: item.isActive,
    notes: item.notes,
    createdAt: item.createdAt,
  };
}

const ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  nameRw: true,
  category: true,
  unit: true,
  unitCost: true,
  unitPrice: true,
  currency: true,
  quantityOnHand: true,
  quantityIssued: true,
  reorderLevel: true,
  isActive: true,
  notes: true,
  createdAt: true,
} as const;

export async function listItems(
  associationId: string,
  options: {
    search?: string;
    category?: WarehouseItemCategory;
    includeInactive?: boolean;
    needsReorderOnly?: boolean;
  } = {}
): Promise<WarehouseItemSummary[]> {
  const items = await prisma.warehouseItem.findMany({
    where: {
      associationId,
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(options.category ? { category: options.category } : {}),
      ...(options.search
        ? {
            OR: [
              { name: { contains: options.search, mode: "insensitive" as const } },
              { nameRw: { contains: options.search, mode: "insensitive" as const } },
              { sku: { contains: options.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: ITEM_SELECT,
  });

  const summaries = items.map(toItemSummary);
  return options.needsReorderOnly
    ? summaries.filter((item) => item.needsReorder)
    : summaries;
}

export async function getItem(
  associationId: string,
  itemId: string
): Promise<WarehouseItemSummary | null> {
  const item = await prisma.warehouseItem.findFirst({
    where: { id: itemId, associationId },
    select: ITEM_SELECT,
  });
  return item ? toItemSummary(item) : null;
}

export async function createItem(params: {
  associationId: string;
  actorId: string;
  sku: string;
  name: string;
  nameRw?: string | null;
  category: WarehouseItemCategory;
  unit: string;
  unitCost: string;
  unitPrice: string;
  currency: string;
  reorderLevel?: string | null;
  notes?: string | null;
  /// Stock already in the store when the item is first catalogued. Posted as a
  /// RECEIPT so that even the opening figure has a movement behind it — an
  /// item that starts at 40 with no row explaining why is the first crack in
  /// the audit trail.
  openingQuantity?: string | null;
}): Promise<WarehouseItemSummary> {
  const existing = await prisma.warehouseItem.findUnique({
    where: {
      associationId_sku: { associationId: params.associationId, sku: params.sku },
    },
    select: { id: true },
  });

  if (existing) {
    throw new WarehouseError(
      `Stock code ${params.sku} is already in use`,
      "DUPLICATE_SKU"
    );
  }

  const item = await withFinancialTransaction(async (tx) => {
    const created = await tx.warehouseItem.create({
      data: {
        associationId: params.associationId,
        sku: params.sku,
        name: params.name,
        nameRw: params.nameRw?.trim() || null,
        category: params.category,
        unit: params.unit,
        unitCost: toMoneyString(params.unitCost),
        unitPrice: toMoneyString(params.unitPrice),
        currency: params.currency,
        reorderLevel: toQuantityString(params.reorderLevel ?? 0),
        notes: params.notes?.trim() || null,
        createdById: params.actorId,
      },
      select: { id: true },
    });

    if (params.openingQuantity && isPositiveQuantity(params.openingQuantity)) {
      await postStockMovement(tx, {
        itemId: created.id,
        type: "RECEIPT",
        direction: "IN",
        quantity: params.openingQuantity,
        unitValue: params.unitCost,
        note: "Opening stock recorded when the item was added",
        recordedById: params.actorId,
      });
    }

    const full = await tx.warehouseItem.findUniqueOrThrow({
      where: { id: created.id },
      select: ITEM_SELECT,
    });

    return toItemSummary(full);
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_ITEM_CREATED,
    entityType: "WarehouseItem",
    entityId: item.id,
    associationId: params.associationId,
    metadata: {
      sku: item.sku,
      name: item.name,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      openingQuantity: item.quantityOnHand,
    },
  }, { id: params.actorId });

  return item;
}

/**
 * Edits the catalogue entry. Deliberately cannot touch `quantityOnHand`:
 * stock only ever moves through a movement, so an officer who wants the count
 * changed must post an adjustment and say why.
 */
export async function updateItem(params: {
  associationId: string;
  actorId: string;
  itemId: string;
  name?: string;
  nameRw?: string | null;
  category?: WarehouseItemCategory;
  unit?: string;
  unitCost?: string;
  unitPrice?: string;
  reorderLevel?: string;
  notes?: string | null;
  isActive?: boolean;
}): Promise<WarehouseItemSummary> {
  const existing = await prisma.warehouseItem.findFirst({
    where: { id: params.itemId, associationId: params.associationId },
    select: ITEM_SELECT,
  });

  if (!existing) {
    throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");
  }

  const updated = await prisma.warehouseItem.update({
    where: { id: params.itemId },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.nameRw !== undefined ? { nameRw: params.nameRw?.trim() || null } : {}),
      ...(params.category !== undefined ? { category: params.category } : {}),
      ...(params.unit !== undefined ? { unit: params.unit } : {}),
      ...(params.unitCost !== undefined
        ? { unitCost: toMoneyString(params.unitCost) }
        : {}),
      ...(params.unitPrice !== undefined
        ? { unitPrice: toMoneyString(params.unitPrice) }
        : {}),
      ...(params.reorderLevel !== undefined
        ? { reorderLevel: toQuantityString(params.reorderLevel) }
        : {}),
      ...(params.notes !== undefined ? { notes: params.notes?.trim() || null } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    },
    select: ITEM_SELECT,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_ITEM_UPDATED,
    entityType: "WarehouseItem",
    entityId: params.itemId,
    associationId: params.associationId,
    metadata: {
      sku: existing.sku,
      // Price changes are the part of an edit a member could be affected by,
      // so before/after is recorded rather than just the new figure.
      before: {
        unitCost: toMoneyString(existing.unitCost),
        unitPrice: toMoneyString(existing.unitPrice),
        isActive: existing.isActive,
      },
      after: {
        unitCost: toMoneyString(updated.unitCost),
        unitPrice: toMoneyString(updated.unitPrice),
        isActive: updated.isActive,
      },
    },
  }, { id: params.actorId });

  return toItemSummary(updated);
}

// ---------------------------------------------------------------------------
// Stock coming in, and stock being corrected
// ---------------------------------------------------------------------------

export async function receiveStock(params: {
  associationId: string;
  actorId: string;
  itemId: string;
  quantity: string;
  /// What this delivery actually cost per unit. When given it also updates the
  /// item's standing cost, because the next valuation should use what the
  /// association last paid rather than what it paid in the first delivery.
  unitCost?: string | null;
  supplierName?: string | null;
  deliveryNoteRef?: string | null;
  note?: string | null;
  occurredAt?: Date;
}): Promise<PostedStockMovement> {
  const item = await prisma.warehouseItem.findFirst({
    where: { id: params.itemId, associationId: params.associationId },
    select: { id: true, name: true, sku: true, isActive: true },
  });

  if (!item) throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");
  if (!item.isActive) {
    throw new WarehouseError(
      `${item.name} is archived. Restore it before recording a delivery.`,
      "INVALID_STATE"
    );
  }

  const movement = await withFinancialTransaction(async (tx) => {
    const posted = await postStockMovement(tx, {
      itemId: params.itemId,
      type: "RECEIPT",
      direction: "IN",
      quantity: params.quantity,
      unitValue: params.unitCost ?? null,
      supplierName: params.supplierName ?? null,
      deliveryNoteRef: params.deliveryNoteRef ?? null,
      note: params.note ?? null,
      recordedById: params.actorId,
      occurredAt: params.occurredAt,
    });

    if (params.unitCost && isPositive(params.unitCost)) {
      await tx.warehouseItem.update({
        where: { id: params.itemId },
        data: { unitCost: toMoneyString(params.unitCost) },
      });
    }

    return posted;
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_STOCK_RECEIVED,
    entityType: "WarehouseItem",
    entityId: params.itemId,
    associationId: params.associationId,
    metadata: {
      sku: item.sku,
      reference: movement.reference,
      quantity: movement.quantity,
      quantityAfter: movement.quantityAfter,
      value: movement.totalValue,
      supplier: params.supplierName ?? null,
    },
  }, { id: params.actorId });

  return movement;
}

/**
 * Records a physical count that disagrees with the book figure.
 *
 * `countedQuantity` is what is actually on the shelf; the movement posted is
 * the difference. Passing the difference instead would mean an officer doing
 * mental arithmetic against a figure they are in the middle of disputing.
 */
export async function adjustStock(params: {
  associationId: string;
  actorId: string;
  itemId: string;
  countedQuantity: string;
  reason: string;
  occurredAt?: Date;
}): Promise<PostedStockMovement | null> {
  if (!params.reason?.trim()) {
    throw new WarehouseError(
      "A stock adjustment requires a written reason",
      "REASON_REQUIRED"
    );
  }

  const item = await prisma.warehouseItem.findFirst({
    where: { id: params.itemId, associationId: params.associationId },
    select: { id: true, sku: true, name: true, unit: true, quantityOnHand: true },
  });

  if (!item) throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");

  const difference = subtractQuantity(params.countedQuantity, item.quantityOnHand);

  // A count that agrees with the book is not an event. Posting a zero movement
  // would put a row in the ledger, an entry in the audit log and a line on the
  // item's history that says nothing happened.
  if (difference.isZero()) return null;

  const movement = await withFinancialTransaction((tx) =>
    postStockMovement(tx, {
      itemId: params.itemId,
      type: "ADJUSTMENT",
      direction: difference.isPositive() ? "IN" : "OUT",
      quantity: toQuantityString(difference.abs()),
      reason: params.reason,
      recordedById: params.actorId,
      occurredAt: params.occurredAt,
      // A stock take may legitimately find less than the book claims, and the
      // book may already have been wrong. Refusing to record that would leave
      // the false figure standing.
      allowNegative: true,
    })
  );

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_STOCK_ADJUSTED,
    entityType: "WarehouseItem",
    entityId: params.itemId,
    associationId: params.associationId,
    // A correction that reduces stock is how a shortfall is made to disappear,
    // so this one is a WARNING rather than an INFO and carries both figures.
    severity: difference.isNegative() ? "WARNING" : "INFO",
    reason: params.reason,
    metadata: {
      sku: item.sku,
      reference: movement.reference,
      bookQuantity: toQuantityString(item.quantityOnHand),
      countedQuantity: toQuantityString(params.countedQuantity),
      difference: toQuantityString(difference),
    },
  }, { id: params.actorId });

  return movement;
}

export async function writeOffStock(params: {
  associationId: string;
  actorId: string;
  itemId: string;
  quantity: string;
  reason: string;
  occurredAt?: Date;
}): Promise<PostedStockMovement> {
  if (!params.reason?.trim()) {
    throw new WarehouseError("A write-off requires a written reason", "REASON_REQUIRED");
  }

  const item = await prisma.warehouseItem.findFirst({
    where: { id: params.itemId, associationId: params.associationId },
    select: { id: true, sku: true },
  });

  if (!item) throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");

  const movement = await withFinancialTransaction((tx) =>
    postStockMovement(tx, {
      itemId: params.itemId,
      type: "WRITE_OFF",
      direction: "OUT",
      quantity: params.quantity,
      reason: params.reason,
      recordedById: params.actorId,
      occurredAt: params.occurredAt,
    })
  );

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_STOCK_WRITTEN_OFF,
    entityType: "WarehouseItem",
    entityId: params.itemId,
    associationId: params.associationId,
    severity: "WARNING",
    reason: params.reason,
    metadata: {
      sku: item.sku,
      reference: movement.reference,
      quantity: movement.quantity,
      lostValue: movement.totalValue,
    },
  }, { id: params.actorId });

  return movement;
}

// ---------------------------------------------------------------------------
// Issuing to a member
// ---------------------------------------------------------------------------

export interface IssuanceLineInput {
  itemId: string;
  quantity: string;
  /// Overrides the item's standing price for this member, on this issue.
  /// Recorded on the line, so a discount stays visible rather than looking
  /// like the price everybody paid.
  unitValue?: string | null;
}

/// Terms on which the goods are expected back rather than paid for.
const RETURNABLE_TERMS: WarehouseIssueTerms[] = ["LOAN_OUT"];

/// Terms under which the member owes the value ON THE ISSUE ITSELF, settled
/// with `settleIssuance`.
///
/// CREDIT is deliberately absent. Goods bought on credit are owed too, but the
/// debt lives on the WarehouseCredit — with its interest, its three dated
/// instalments and any fine — and counting it here as well would show the
/// member the same machine twice and let an officer collect for it in two
/// places. See lib/services/warehouse-credit.ts.
const CHARGEABLE_TERMS: WarehouseIssueTerms[] = ["PURCHASE", "AGAINST_LOAN"];

/// Terms that open an instalment arrangement instead.
const CREDIT_TERMS: WarehouseIssueTerms[] = ["CREDIT"];

export async function issueToMember(params: {
  associationId: string;
  actorId: string;
  memberId: string;
  terms: WarehouseIssueTerms;
  lines: IssuanceLineInput[];
  loanId?: string | null;
  dueBackAt?: Date | null;
  note?: string | null;
  issuedAt?: Date;
}): Promise<WarehouseIssuanceDetail> {
  if (params.lines.length === 0) {
    throw new WarehouseError("Add at least one item to issue", "INVALID_QUANTITY");
  }

  const member = await prisma.member.findFirst({
    where: { id: params.memberId, associationId: params.associationId },
    select: { id: true, memberNumber: true, status: true },
  });

  if (!member) throw new WarehouseError("Member not found", "NOT_FOUND");

  // A suspended member's deposits, withdrawals and loans are already paused.
  // Handing them goods on credit would open the one door the suspension was
  // meant to close.
  if (member.status === "SUSPENDED" || member.status === "EXITED") {
    throw new WarehouseError(
      "This member's account is not active, so goods cannot be issued to them",
      "INVALID_STATE"
    );
  }

  if (params.loanId) {
    const loan = await prisma.loan.findFirst({
      where: {
        id: params.loanId,
        associationId: params.associationId,
        memberId: params.memberId,
      },
      select: { id: true },
    });
    if (!loan) {
      throw new WarehouseError(
        "That loan does not belong to this member",
        "INVALID_STATE"
      );
    }
  }

  const association = await prisma.association.findUniqueOrThrow({
    where: { id: params.associationId },
    select: { currency: true },
  });

  // Read OUTSIDE the transaction: the rulebook is a handful of rows and does
  // not change during an issue, and holding the stock lock while querying it
  // would widen the critical section for nothing.
  const policy = CREDIT_TERMS.includes(params.terms)
    ? await getPolicy(params.associationId)
    : null;

  const issuanceId = await withFinancialTransaction(async (tx) => {
    const issuance = await tx.warehouseIssuance.create({
      data: {
        associationId: params.associationId,
        memberId: params.memberId,
        reference: buildWarehouseReference("WHI"),
        terms: params.terms,
        status: "ISSUED",
        loanId: params.loanId ?? null,
        totalValue: "0.00",
        currency: association.currency,
        issuedAt: params.issuedAt ?? new Date(),
        dueBackAt: params.dueBackAt ?? null,
        note: params.note?.trim() || null,
        issuedById: params.actorId,
      },
      select: { id: true },
    });

    let total = toMoney(0);

    for (const line of params.lines) {
      const item = await tx.warehouseItem.findFirst({
        where: { id: line.itemId, associationId: params.associationId },
        select: { id: true, name: true, nameRw: true, unit: true, unitPrice: true },
      });

      if (!item) {
        throw new WarehouseError("That stock item no longer exists", "NOT_FOUND");
      }

      // FREE_ISSUE still records what the goods were worth — the association
      // gave something away and its accounts should say how much — but the
      // member is charged nothing, so the line value is zero.
      const unitValue =
        params.terms === "FREE_ISSUE"
          ? toMoney(0)
          : toMoney(line.unitValue ?? item.unitPrice);

      const lineValue = multiply(unitValue, toQuantityString(line.quantity));

      const created = await tx.warehouseIssuanceLine.create({
        data: {
          issuanceId: issuance.id,
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity: toQuantityString(line.quantity),
          unitValue: toMoneyString(unitValue),
          lineValue: toMoneyString(lineValue),
        },
        select: { id: true },
      });

      await postStockMovement(tx, {
        itemId: item.id,
        type: "ISSUE",
        direction: "OUT",
        quantity: line.quantity,
        unitValue: toMoneyString(unitValue),
        issuanceId: issuance.id,
        issuanceLineId: created.id,
        recordedById: params.actorId,
        occurredAt: params.issuedAt,
      });

      // Goods lent out are still the association's, so they stay on the books
      // as issued rather than gone. Goods sold have left for good.
      if (RETURNABLE_TERMS.includes(params.terms)) {
        await tx.warehouseItem.update({
          where: { id: item.id },
          data: {
            quantityIssued: {
              increment: new Prisma.Decimal(toQuantityString(line.quantity)),
            },
          },
        });
      }

      total = add(total, lineValue);
    }

    await tx.warehouseIssuance.update({
      where: { id: issuance.id },
      data: { totalValue: toMoneyString(total) },
    });

    // IN THE SAME TRANSACTION as the stock leaving. Goods out of the store
    // with no credit against them are goods nobody owes for, and a second
    // transaction that failed would leave exactly that.
    if (policy) {
      await openCreditWithin(tx, {
        policy,
        associationId: params.associationId,
        memberId: params.memberId,
        issuanceId: issuance.id,
        goodsValue: toMoneyString(total),
        currency: association.currency,
        actorId: params.actorId,
        startedAt: params.issuedAt,
        note: params.note ?? null,
      });
    }

    return issuance.id;
  });

  const detail = await getIssuance(params.associationId, issuanceId);
  if (!detail) throw new WarehouseError("Issue could not be read back", "NOT_FOUND");

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_ISSUED,
    entityType: "WarehouseIssuance",
    entityId: issuanceId,
    associationId: params.associationId,
    metadata: {
      reference: detail.reference,
      memberNumber: member.memberNumber,
      terms: params.terms,
      totalValue: detail.totalValue,
      loanId: params.loanId ?? null,
      lines: detail.lines.map((line) => ({
        item: line.itemName,
        quantity: line.quantity,
        value: line.lineValue,
      })),
    },
  }, { id: params.actorId });

  return detail;
}

/**
 * Records goods coming back from a member.
 *
 * Returns are per line, because a member who brings back two of three machines
 * has done something the record must be able to state exactly.
 */
export async function recordReturn(params: {
  associationId: string;
  actorId: string;
  issuanceId: string;
  lines: { lineId: string; quantity: string }[];
  note?: string | null;
  occurredAt?: Date;
}): Promise<WarehouseIssuanceDetail> {
  const issuance = await prisma.warehouseIssuance.findFirst({
    where: { id: params.issuanceId, associationId: params.associationId },
    select: {
      id: true,
      reference: true,
      status: true,
      terms: true,
      totalValue: true,
      amountSettled: true,
      amountReturned: true,
      member: { select: { memberNumber: true } },
      lines: {
        select: {
          id: true,
          itemId: true,
          itemName: true,
          quantity: true,
          quantityReturned: true,
          unitValue: true,
        },
      },
    },
  });

  if (!issuance) throw new WarehouseError("That issue was not found", "NOT_FOUND");

  if (issuance.status === "CANCELLED" || issuance.status === "WRITTEN_OFF") {
    throw new WarehouseError(
      "That issue is closed and cannot take a return",
      "INVALID_STATE"
    );
  }

  await withFinancialTransaction(async (tx) => {
    let returnedValue = toMoney(0);

    for (const request of params.lines) {
      const line = issuance.lines.find((candidate) => candidate.id === request.lineId);
      if (!line) {
        throw new WarehouseError("That line is not on this issue", "NOT_FOUND");
      }

      const outstanding = subtractQuantity(line.quantity, line.quantityReturned);

      if (gtQuantity(request.quantity, outstanding)) {
        throw new WarehouseError(
          `Only ${toQuantityString(outstanding)} of ${line.itemName} is still out`,
          "INVALID_QUANTITY"
        );
      }

      if (!isPositiveQuantity(request.quantity)) continue;

      await postStockMovement(tx, {
        itemId: line.itemId,
        type: "RETURN",
        direction: "IN",
        quantity: request.quantity,
        unitValue: toMoneyString(line.unitValue),
        issuanceId: issuance.id,
        issuanceLineId: line.id,
        note: params.note ?? null,
        recordedById: params.actorId,
        occurredAt: params.occurredAt,
      });

      await tx.warehouseIssuanceLine.update({
        where: { id: line.id },
        data: {
          quantityReturned: {
            increment: new Prisma.Decimal(toQuantityString(request.quantity)),
          },
        },
      });

      if (RETURNABLE_TERMS.includes(issuance.terms)) {
        await tx.warehouseItem.update({
          where: { id: line.itemId },
          data: {
            quantityIssued: {
              decrement: new Prisma.Decimal(toQuantityString(request.quantity)),
            },
          },
        });
      }

      returnedValue = add(
        returnedValue,
        multiply(line.unitValue, toQuantityString(request.quantity))
      );
    }

    // Re-read the lines inside the transaction: the loop above has changed
    // them, and the status depends on the totals after every line has moved.
    const lines = await tx.warehouseIssuanceLine.findMany({
      where: { issuanceId: issuance.id },
      select: { quantity: true, quantityReturned: true },
    });

    const fullyReturned = lines.every((line) =>
      toQuantity(line.quantityReturned).greaterThanOrEqualTo(toQuantity(line.quantity))
    );
    const anyReturned = lines.some((line) => isPositiveQuantity(line.quantityReturned));

    const amountReturned = add(issuance.amountReturned, returnedValue);

    await tx.warehouseIssuance.update({
      where: { id: issuance.id },
      data: {
        amountReturned: toMoneyString(amountReturned),
        status: fullyReturned
          ? "RETURNED"
          : anyReturned
            ? "PARTIALLY_RETURNED"
            : issuance.status,
        returnedAt: fullyReturned ? (params.occurredAt ?? new Date()) : null,
      },
    });
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_RETURNED,
    entityType: "WarehouseIssuance",
    entityId: issuance.id,
    associationId: params.associationId,
    metadata: {
      reference: issuance.reference,
      memberNumber: issuance.member.memberNumber,
      lines: params.lines,
      note: params.note ?? null,
    },
  }, { id: params.actorId });

  const detail = await getIssuance(params.associationId, issuance.id);
  if (!detail) throw new WarehouseError("Issue could not be read back", "NOT_FOUND");
  return detail;
}

/**
 * Records that a member has paid for what they took.
 *
 * `fromSavings` posts a FEE debit against their savings; otherwise the money
 * came in as cash and only the issuance is updated. Either way this is a
 * separate act from issuing — see the note at the top of this file.
 */
export async function settleIssuance(params: {
  associationId: string;
  actorId: string;
  issuanceId: string;
  amount: string;
  fromSavings: boolean;
  note?: string | null;
}): Promise<WarehouseIssuanceDetail> {
  const issuance = await prisma.warehouseIssuance.findFirst({
    where: { id: params.issuanceId, associationId: params.associationId },
    select: {
      id: true,
      reference: true,
      status: true,
      terms: true,
      memberId: true,
      totalValue: true,
      amountSettled: true,
      amountReturned: true,
      currency: true,
      savingsTransactionId: true,
      member: { select: { memberNumber: true } },
    },
  });

  if (!issuance) throw new WarehouseError("That issue was not found", "NOT_FOUND");

  if (CREDIT_TERMS.includes(issuance.terms)) {
    throw new WarehouseError(
      "These goods were bought on credit. Record the payment against the credit so it lands on the right instalment.",
      "INVALID_STATE"
    );
  }

  if (!CHARGEABLE_TERMS.includes(issuance.terms)) {
    throw new WarehouseError(
      "Nothing is owed on this issue, so there is nothing to settle",
      "INVALID_STATE"
    );
  }

  if (issuance.status === "CANCELLED" || issuance.status === "WRITTEN_OFF") {
    throw new WarehouseError("That issue is closed", "INVALID_STATE");
  }

  const amount = toMoney(params.amount);
  if (!isPositive(amount)) {
    throw new WarehouseError("Enter an amount greater than zero", "INVALID_QUANTITY");
  }

  // What is still owed is the value less what has been paid AND less the value
  // of anything handed back. Ignoring returns here would charge a member for
  // fabric that is sitting back on the shelf.
  const owed = subtract(
    issuance.totalValue,
    add(issuance.amountSettled, issuance.amountReturned)
  );

  if (gt(amount, owed)) {
    throw new WarehouseError(
      `Only ${toMoneyString(owed)} is still owed on this issue`,
      "INVALID_QUANTITY"
    );
  }

  await withFinancialTransaction(async (tx) => {
    let savingsTransactionId: string | null = null;

    if (params.fromSavings) {
      const account = await tx.savingsAccount.findFirst({
        where: { memberId: issuance.memberId, isActive: true },
        orderBy: { openedAt: "asc" },
        select: { id: true },
      });

      if (!account) {
        throw new WarehouseError(
          "This member has no active savings account to take the payment from",
          "NO_SAVINGS_ACCOUNT"
        );
      }

      const posted = await postSavingsTransaction(
        {
          savingsAccountId: account.id,
          type: "FEE",
          direction: "DEBIT",
          amount: toMoneyString(amount),
          description: `Warehouse goods ${issuance.reference}`,
          externalReference: issuance.reference,
          postedById: params.actorId,
          // Deliberately NOT allowed: a member must not be driven into a
          // negative balance to pay for goods. If the money is not there the
          // settlement fails and an officer collects it in cash instead.
          allowOverdraft: false,
        },
        tx
      );

      savingsTransactionId = posted.id;
    }

    const settled = add(issuance.amountSettled, amount);
    const cleared = gte(add(settled, issuance.amountReturned), issuance.totalValue);

    await tx.warehouseIssuance.update({
      where: { id: issuance.id },
      data: {
        amountSettled: toMoneyString(settled),
        status: cleared ? "SETTLED" : "CHARGED",
        settledAt: cleared ? new Date() : null,
        // Only the FIRST savings debit is linked here, which the unique
        // constraint on the column enforces anyway. A part-payment followed by
        // another leaves the first on the record and the rest traceable
        // through the ledger's own externalReference, which carries this
        // issue's reference on every debit.
        ...(savingsTransactionId && !issuance.savingsTransactionId
          ? { savingsTransactionId }
          : {}),
      },
    });
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_SETTLED,
    entityType: "WarehouseIssuance",
    entityId: issuance.id,
    associationId: params.associationId,
    metadata: {
      reference: issuance.reference,
      memberNumber: issuance.member.memberNumber,
      amount: toMoneyString(amount),
      fromSavings: params.fromSavings,
      note: params.note ?? null,
    },
  }, { id: params.actorId });

  const detail = await getIssuance(params.associationId, issuance.id);
  if (!detail) throw new WarehouseError("Issue could not be read back", "NOT_FOUND");
  return detail;
}

/**
 * Withdraws an issue recorded in error, returning every unreturned item to
 * stock. The row survives with a reason on it — see rule 2 of the schema.
 */
export async function cancelIssuance(params: {
  associationId: string;
  actorId: string;
  issuanceId: string;
  reason: string;
}): Promise<void> {
  if (!params.reason?.trim()) {
    throw new WarehouseError("Cancelling an issue requires a reason", "REASON_REQUIRED");
  }

  const issuance = await prisma.warehouseIssuance.findFirst({
    where: { id: params.issuanceId, associationId: params.associationId },
    select: {
      id: true,
      reference: true,
      status: true,
      terms: true,
      amountSettled: true,
      member: { select: { memberNumber: true } },
      credit: { select: { id: true, reference: true, totalPaid: true } },
      lines: {
        select: {
          id: true,
          itemId: true,
          quantity: true,
          quantityReturned: true,
          unitValue: true,
        },
      },
    },
  });

  if (!issuance) throw new WarehouseError("That issue was not found", "NOT_FOUND");

  if (issuance.status === "CANCELLED") {
    throw new WarehouseError("That issue is already cancelled", "INVALID_STATE");
  }

  // Money has already changed hands. Cancelling would leave a savings debit
  // pointing at a withdrawn record, so the refund has to be a deliberate act
  // before this becomes available.
  if (isPositive(issuance.amountSettled)) {
    throw new WarehouseError(
      "This issue has already been paid for. Reverse the payment before cancelling it.",
      "INVALID_STATE"
    );
  }

  // Same rule for goods bought on credit: once the member has paid an
  // instalment, withdrawing the issue would strand that payment against a
  // record that no longer says they took anything.
  if (issuance.credit && isPositive(issuance.credit.totalPaid)) {
    throw new WarehouseError(
      `Payments have already been made against credit ${issuance.credit.reference}. Reverse them before cancelling this issue.`,
      "INVALID_STATE"
    );
  }

  await withFinancialTransaction(async (tx) => {
    for (const line of issuance.lines) {
      const outstanding = subtractQuantity(line.quantity, line.quantityReturned);
      if (!isPositiveQuantity(outstanding)) continue;

      await postStockMovement(tx, {
        itemId: line.itemId,
        type: "RETURN",
        direction: "IN",
        quantity: toQuantityString(outstanding),
        unitValue: toMoneyString(line.unitValue),
        issuanceId: issuance.id,
        issuanceLineId: line.id,
        reason: params.reason,
        note: "Issue cancelled",
        recordedById: params.actorId,
      });

      await tx.warehouseIssuanceLine.update({
        where: { id: line.id },
        data: { quantityReturned: line.quantity },
      });

      if (RETURNABLE_TERMS.includes(issuance.terms)) {
        await tx.warehouseItem.update({
          where: { id: line.itemId },
          data: {
            quantityIssued: {
              decrement: new Prisma.Decimal(toQuantityString(outstanding)),
            },
          },
        });
      }
    }

    await tx.warehouseIssuance.update({
      where: { id: issuance.id },
      data: {
        status: "CANCELLED",
        cancelReason: params.reason,
        returnedAt: new Date(),
      },
    });

    // An unpaid credit against withdrawn goods is withdrawn with them, and its
    // instalments stop counting toward anything. The row survives with the
    // reason on it, like every other cancellation here.
    if (issuance.credit) {
      await tx.warehouseCredit.update({
        where: { id: issuance.credit.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: params.reason,
          principalOutstanding: "0.00",
          interestOutstanding: "0.00",
          penaltyOutstanding: "0.00",
        },
      });

      await tx.warehouseCreditInstallment.updateMany({
        where: { creditId: issuance.credit.id, status: { not: "PAID" } },
        data: { status: "WAIVED", waiverReason: params.reason },
      });

      await tx.warehouseCreditFine.updateMany({
        where: { creditId: issuance.credit.id, status: "OUTSTANDING" },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: params.reason,
        },
      });
    }
  });

  await recordAudit({
    action: AUDIT_ACTIONS.WAREHOUSE_ISSUANCE_CANCELLED,
    entityType: "WarehouseIssuance",
    entityId: issuance.id,
    associationId: params.associationId,
    severity: "WARNING",
    reason: params.reason,
    metadata: {
      reference: issuance.reference,
      memberNumber: issuance.member.memberNumber,
    },
  }, { id: params.actorId });
}

/**
 * Puts back into stock everything a member who is being deleted never
 * returned, ahead of their issues being erased. Returns how many movements it
 * posted.
 *
 * Deleting a member is for a record that should never have existed — a test
 * account above all — so their issues are unwound the way a cancelled one is:
 * a RETURN for whatever is still out, and the on-loan count brought down with
 * it. The movements stay, because the stock ledger is append-only and each
 * row's before-and-after chains into the next; once the issue is gone they
 * lose only the link to it, which is SetNull, and the note says where they
 * came from.
 *
 * Runs inside the caller's transaction, so the stock is back if and only if
 * the member is gone.
 */
export async function returnStockOfDeletedMember(
  tx: TxClient,
  params: { memberId: string; memberNumber: string; actorId: string; reason: string }
): Promise<number> {
  const issuances = await tx.warehouseIssuance.findMany({
    where: {
      memberId: params.memberId,
      // A cancelled issue already returned everything. Nothing writes off an
      // issue today, but one that is written off is never coming back, the
      // same as recordReturn treats it.
      status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
    },
    select: {
      reference: true,
      terms: true,
      lines: {
        select: { itemId: true, quantity: true, quantityReturned: true, unitValue: true },
      },
    },
  });

  let posted = 0;

  for (const issuance of issuances) {
    for (const line of issuance.lines) {
      const outstanding = subtractQuantity(line.quantity, line.quantityReturned);
      if (!isPositiveQuantity(outstanding)) continue;

      await postStockMovement(tx, {
        itemId: line.itemId,
        type: "RETURN",
        direction: "IN",
        quantity: toQuantityString(outstanding),
        unitValue: toMoneyString(line.unitValue),
        reason: params.reason,
        note: `Member ${params.memberNumber} deleted; issue ${issuance.reference} withdrawn`,
        recordedById: params.actorId,
      });
      posted += 1;

      if (RETURNABLE_TERMS.includes(issuance.terms)) {
        await tx.warehouseItem.update({
          where: { id: line.itemId },
          data: {
            quantityIssued: {
              decrement: new Prisma.Decimal(toQuantityString(outstanding)),
            },
          },
        });
      }
    }
  }

  return posted;
}

// ---------------------------------------------------------------------------
// Reading issues back
// ---------------------------------------------------------------------------

export interface WarehouseIssuanceLineDetail {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  quantityReturned: string;
  quantityOutstanding: string;
  unitValue: string;
  lineValue: string;
}

export interface WarehouseIssuanceDetail {
  id: string;
  reference: string;
  terms: WarehouseIssueTerms;
  status: WarehouseIssuanceStatus;
  memberId: string;
  memberNumber: string;
  memberName: string;
  totalValue: string;
  amountSettled: string;
  amountReturned: string;
  /// Value less what has been paid and what has come back. The single figure a
  /// member should be shown, because it is the only one they can act on.
  amountOwed: string;
  currency: string;
  loanId: string | null;
  loanReference: string | null;
  issuedAt: Date;
  dueBackAt: Date | null;
  returnedAt: Date | null;
  settledAt: Date | null;
  /// True when goods were expected back by a date that has passed.
  isOverdueBack: boolean;
  note: string | null;
  issuedByName: string | null;
  lines: WarehouseIssuanceLineDetail[];

  /// Set only on CREDIT terms. The instalment arrangement this issue opened,
  /// which is where the money owed for these goods actually lives — see the
  /// note on CHARGEABLE_TERMS above.
  credit: {
    id: string;
    reference: string;
    status: WarehouseCreditStatus;
    totalPayable: string;
    outstanding: string;
    nextDueDate: Date | null;
    isOverdue: boolean;
  } | null;
}

const ISSUANCE_SELECT = {
  id: true,
  reference: true,
  terms: true,
  status: true,
  memberId: true,
  totalValue: true,
  amountSettled: true,
  amountReturned: true,
  currency: true,
  loanId: true,
  issuedAt: true,
  dueBackAt: true,
  returnedAt: true,
  settledAt: true,
  note: true,
  member: {
    select: {
      memberNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  loan: { select: { reference: true } },
  credit: {
    select: {
      id: true,
      reference: true,
      status: true,
      totalPayable: true,
      principalOutstanding: true,
      interestOutstanding: true,
      penaltyOutstanding: true,
      installments: {
        // Typed rather than left to `as const`, which would freeze the array
        // readonly and Prisma's filter wants a mutable one.
        where: { status: { notIn: ["PAID", "WAIVED"] as InstallmentStatus[] } },
        orderBy: { installmentNumber: "asc" as const },
        take: 1,
        select: { dueDate: true },
      },
    },
  },
  issuedBy: { select: { firstName: true, lastName: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      itemId: true,
      itemName: true,
      unit: true,
      quantity: true,
      quantityReturned: true,
      unitValue: true,
      lineValue: true,
    },
  },
} as const;

type IssuanceRow = Prisma.WarehouseIssuanceGetPayload<{
  select: typeof ISSUANCE_SELECT;
}>;

function toIssuanceDetail(row: IssuanceRow, asOf: Date): WarehouseIssuanceDetail {
  const owed = CHARGEABLE_TERMS.includes(row.terms)
    ? subtract(row.totalValue, add(row.amountSettled, row.amountReturned))
    : toMoney(0);

  const open =
    row.status === "ISSUED" ||
    row.status === "PARTIALLY_RETURNED" ||
    row.status === "CHARGED";

  return {
    id: row.id,
    reference: row.reference,
    terms: row.terms,
    status: row.status,
    memberId: row.memberId,
    memberNumber: row.member.memberNumber,
    memberName: `${row.member.user.firstName} ${row.member.user.lastName}`,
    totalValue: toMoneyString(row.totalValue),
    amountSettled: toMoneyString(row.amountSettled),
    amountReturned: toMoneyString(row.amountReturned),
    amountOwed: toMoneyString(gt(owed, 0) ? owed : 0),
    currency: row.currency,
    loanId: row.loanId,
    loanReference: row.loan?.reference ?? null,
    issuedAt: row.issuedAt,
    dueBackAt: row.dueBackAt,
    returnedAt: row.returnedAt,
    settledAt: row.settledAt,
    isOverdueBack: Boolean(
      row.dueBackAt && open && row.dueBackAt.getTime() < asOf.getTime()
    ),
    note: row.note,
    issuedByName: row.issuedBy
      ? `${row.issuedBy.firstName} ${row.issuedBy.lastName}`
      : null,
    lines: row.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      itemName: line.itemName,
      unit: line.unit,
      quantity: toQuantityString(line.quantity),
      quantityReturned: toQuantityString(line.quantityReturned),
      quantityOutstanding: toQuantityString(
        subtractQuantity(line.quantity, line.quantityReturned)
      ),
      unitValue: toMoneyString(line.unitValue),
      lineValue: toMoneyString(line.lineValue),
    })),
    credit: row.credit
      ? {
          id: row.credit.id,
          reference: row.credit.reference,
          status: row.credit.status,
          totalPayable: toMoneyString(row.credit.totalPayable),
          outstanding: toMoneyString(
            add(
              row.credit.principalOutstanding,
              row.credit.interestOutstanding,
              row.credit.penaltyOutstanding
            )
          ),
          nextDueDate: row.credit.installments[0]?.dueDate ?? null,
          isOverdue:
            row.credit.status === "OVERDUE" || row.credit.status === "DEFAULTED",
        }
      : null,
  };
}

export async function getIssuance(
  associationId: string,
  issuanceId: string
): Promise<WarehouseIssuanceDetail | null> {
  const row = await prisma.warehouseIssuance.findFirst({
    where: { id: issuanceId, associationId },
    select: ISSUANCE_SELECT,
  });
  return row ? toIssuanceDetail(row, new Date()) : null;
}

export interface IssuancesPage {
  rows: WarehouseIssuanceDetail[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listIssuances(
  associationId: string,
  options: {
    memberId?: string;
    status?: WarehouseIssuanceStatus;
    terms?: WarehouseIssueTerms;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<IssuancesPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));

  const where: Prisma.WarehouseIssuanceWhereInput = {
    associationId,
    ...(options.memberId ? { memberId: options.memberId } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.terms ? { terms: options.terms } : {}),
    ...(options.search
      ? {
          OR: [
            { reference: { contains: options.search, mode: "insensitive" } },
            {
              member: {
                memberNumber: { contains: options.search, mode: "insensitive" },
              },
            },
            {
              member: {
                user: {
                  OR: [
                    {
                      firstName: {
                        contains: options.search,
                        mode: "insensitive",
                      },
                    },
                    {
                      lastName: { contains: options.search, mode: "insensitive" },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.warehouseIssuance.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ISSUANCE_SELECT,
    }),
    prisma.warehouseIssuance.count({ where }),
  ]);

  const asOf = new Date();

  return {
    rows: rows.map((row) => toIssuanceDetail(row, asOf)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// The stock movement history
// ---------------------------------------------------------------------------

export interface StockMovementRow {
  id: string;
  reference: string;
  itemId: string;
  itemName: string;
  unit: string;
  type: WarehouseMovementType;
  direction: "IN" | "OUT";
  quantity: string;
  quantityAfter: string;
  unitValue: string;
  totalValue: string;
  currency: string;
  issuanceReference: string | null;
  memberName: string | null;
  supplierName: string | null;
  note: string | null;
  reason: string | null;
  recordedByName: string | null;
  occurredAt: Date;
}

export async function listMovements(
  associationId: string,
  options: {
    itemId?: string;
    type?: WarehouseMovementType;
    limit?: number;
  } = {}
): Promise<StockMovementRow[]> {
  const movements = await prisma.warehouseStockMovement.findMany({
    where: {
      associationId,
      ...(options.itemId ? { itemId: options.itemId } : {}),
      ...(options.type ? { type: options.type } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: Math.min(200, options.limit ?? 50),
    select: {
      id: true,
      reference: true,
      itemId: true,
      type: true,
      direction: true,
      quantity: true,
      quantityAfter: true,
      unitValue: true,
      totalValue: true,
      currency: true,
      supplierName: true,
      note: true,
      reason: true,
      occurredAt: true,
      item: { select: { name: true, unit: true } },
      issuance: {
        select: {
          reference: true,
          member: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return movements.map((movement) => ({
    id: movement.id,
    reference: movement.reference,
    itemId: movement.itemId,
    itemName: movement.item.name,
    unit: movement.item.unit,
    type: movement.type,
    direction: movement.direction,
    quantity: toQuantityString(movement.quantity),
    quantityAfter: toQuantityString(movement.quantityAfter),
    unitValue: toMoneyString(movement.unitValue),
    totalValue: toMoneyString(movement.totalValue),
    currency: movement.currency,
    issuanceReference: movement.issuance?.reference ?? null,
    memberName: movement.issuance
      ? `${movement.issuance.member.user.firstName} ${movement.issuance.member.user.lastName}`
      : null,
    supplierName: movement.supplierName,
    note: movement.note,
    reason: movement.reason,
    recordedByName: movement.recordedBy
      ? `${movement.recordedBy.firstName} ${movement.recordedBy.lastName}`
      : null,
    occurredAt: movement.occurredAt,
  }));
}

// ---------------------------------------------------------------------------
// The association-wide picture
// ---------------------------------------------------------------------------

export interface WarehouseOverview {
  itemCount: number;
  /// Stock on hand valued at cost. See the note on `stockValue`.
  stockValue: string;
  /// Value of goods sitting with members right now, and what they still owe.
  issuedValue: string;
  owedValue: string;
  currency: string;
  reorderCount: number;
  openIssuances: number;
  overdueReturns: number;
}

export async function getWarehouseOverview(
  associationId: string
): Promise<WarehouseOverview> {
  const [items, issuances, association] = await Promise.all([
    prisma.warehouseItem.findMany({
      where: { associationId, isActive: true },
      select: {
        unitCost: true,
        quantityOnHand: true,
        quantityIssued: true,
        reorderLevel: true,
      },
    }),
    prisma.warehouseIssuance.findMany({
      where: {
        associationId,
        status: { in: ["ISSUED", "PARTIALLY_RETURNED", "CHARGED"] },
      },
      select: {
        terms: true,
        totalValue: true,
        amountSettled: true,
        amountReturned: true,
        dueBackAt: true,
      },
    }),
    prisma.association.findUniqueOrThrow({
      where: { id: associationId },
      select: { currency: true },
    }),
  ]);

  const now = new Date();

  let stockValue = toMoney(0);
  let issuedValue = toMoney(0);
  let reorderCount = 0;

  for (const item of items) {
    stockValue = add(
      stockValue,
      multiply(item.unitCost, toQuantityString(item.quantityOnHand))
    );
    issuedValue = add(
      issuedValue,
      multiply(item.unitCost, toQuantityString(item.quantityIssued))
    );
    if (
      isPositiveQuantity(item.reorderLevel) &&
      !gtQuantity(item.quantityOnHand, item.reorderLevel)
    ) {
      reorderCount += 1;
    }
  }

  let owedValue = toMoney(0);
  let overdueReturns = 0;

  for (const issuance of issuances) {
    if (CHARGEABLE_TERMS.includes(issuance.terms)) {
      const owed = subtract(
        issuance.totalValue,
        add(issuance.amountSettled, issuance.amountReturned)
      );
      if (gt(owed, 0)) owedValue = add(owedValue, owed);
    }
    if (issuance.dueBackAt && issuance.dueBackAt.getTime() < now.getTime()) {
      overdueReturns += 1;
    }
  }

  return {
    itemCount: items.length,
    stockValue: toMoneyString(stockValue),
    issuedValue: toMoneyString(issuedValue),
    owedValue: toMoneyString(owedValue),
    currency: association.currency,
    reorderCount,
    openIssuances: issuances.length,
    overdueReturns,
  };
}

// ---------------------------------------------------------------------------
// One member's warehouse position
// ---------------------------------------------------------------------------

export interface MemberWarehouseSummary {
  /// Every issue on this member's file, newest first.
  issuances: WarehouseIssuanceDetail[];
  /// Value of everything ever issued to them, on any terms.
  totalIssuedValue: string;
  /// Value of goods they still hold on returnable terms.
  outstandingValue: string;
  /// Money still owed for goods taken OUTRIGHT. The figure that belongs on
  /// their account page beside what they owe on a loan.
  totalOwed: string;
  totalSettled: string;
  /// Still owed on goods bought on credit — instalments, interest and any
  /// fine. Reported separately from `totalOwed` because the two are settled in
  /// different places and only one of them carries a due date.
  creditOutstanding: string;
  /// The two added: everything the store is owed by this member.
  totalDueToStore: string;
  currency: string;
  openCount: number;
  overdueReturnCount: number;
  activeCreditCount: number;
  overdueCreditCount: number;
}

/**
 * What one member has taken out of the store — the source for the warehouse
 * panel on their account status page.
 */
export async function getMemberWarehouseSummary(
  memberId: string
): Promise<MemberWarehouseSummary | null> {
  // Together, not one after the other: the issues are keyed by the member id
  // already in hand, so waiting for the member row first only added a round
  // trip to the hosted database.
  const [member, rows] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, association: { select: { currency: true } } },
    }),
    prisma.warehouseIssuance.findMany({
      where: { memberId, status: { not: "CANCELLED" } },
      orderBy: { issuedAt: "desc" },
      select: ISSUANCE_SELECT,
    }),
  ]);

  if (!member) return null;

  const asOf = new Date();
  return summariseIssuances(
    rows.map((row) => toIssuanceDetail(row, asOf)),
    member.association.currency
  );
}

/**
 * Every member's warehouse position at once, keyed by member id — for the
 * association-wide member account statement. One query for the whole
 * association rather than one per member, totalled by the same function the
 * account status page uses, so the two cannot disagree about what is owed.
 * Members who have never taken anything from the store are absent.
 */
export async function getWarehouseSummariesByMember(
  associationId: string
): Promise<Map<string, MemberWarehouseSummary>> {
  const [association, rows] = await Promise.all([
    prisma.association.findUnique({
      where: { id: associationId },
      select: { currency: true },
    }),
    prisma.warehouseIssuance.findMany({
      where: { associationId, status: { not: "CANCELLED" } },
      orderBy: { issuedAt: "desc" },
      select: ISSUANCE_SELECT,
    }),
  ]);

  const asOf = new Date();
  const byMember = new Map<string, WarehouseIssuanceDetail[]>();
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(toIssuanceDetail(row, asOf));
    byMember.set(row.memberId, list);
  }

  const currency = association?.currency ?? "RWF";
  return new Map(
    [...byMember].map(([memberId, issuances]) => [
      memberId,
      summariseIssuances(issuances, currency),
    ])
  );
}

/** Totals one member's issues, newest first, into their warehouse position. */
function summariseIssuances(
  issuances: WarehouseIssuanceDetail[],
  currency: string
): MemberWarehouseSummary {
  let totalIssuedValue = toMoney(0);
  let totalOwed = toMoney(0);
  let totalSettled = toMoney(0);
  let outstandingValue = toMoney(0);
  let openCount = 0;
  let overdueReturnCount = 0;
  let creditOutstanding = toMoney(0);
  let activeCreditCount = 0;
  let overdueCreditCount = 0;

  for (const issuance of issuances) {
    totalIssuedValue = add(totalIssuedValue, issuance.totalValue);
    totalOwed = add(totalOwed, issuance.amountOwed);
    totalSettled = add(totalSettled, issuance.amountSettled);

    const open =
      issuance.status === "ISSUED" ||
      issuance.status === "PARTIALLY_RETURNED" ||
      issuance.status === "CHARGED";

    if (open) {
      openCount += 1;
      // Value still in the member's hands: what was issued less what has come
      // back. Applies on every terms, because a member holding a machine they
      // have paid for still has association property in their workshop.
      outstandingValue = add(
        outstandingValue,
        subtract(issuance.totalValue, issuance.amountReturned)
      );
    }

    if (issuance.isOverdueBack) overdueReturnCount += 1;

    if (issuance.credit) {
      // Only what is still being collected. A written-off credit keeps its
      // balance on the record but is not a bill this member is being sent —
      // see getMemberCreditSummary, which applies the same rule.
      const collectable =
        issuance.credit.status === "ACTIVE" ||
        issuance.credit.status === "OVERDUE" ||
        issuance.credit.status === "DEFAULTED";

      if (collectable) {
        creditOutstanding = add(creditOutstanding, issuance.credit.outstanding);
      }

      if (
        issuance.credit.status === "ACTIVE" ||
        issuance.credit.status === "OVERDUE"
      ) {
        activeCreditCount += 1;
      }
      if (issuance.credit.isOverdue) overdueCreditCount += 1;
    }
  }

  return {
    issuances,
    totalIssuedValue: toMoneyString(totalIssuedValue),
    outstandingValue: toMoneyString(outstandingValue),
    totalOwed: toMoneyString(totalOwed),
    totalSettled: toMoneyString(totalSettled),
    creditOutstanding: toMoneyString(creditOutstanding),
    totalDueToStore: toMoneyString(add(totalOwed, creditOutstanding)),
    currency,
    openCount,
    overdueReturnCount,
    activeCreditCount,
    overdueCreditCount,
  };
}
