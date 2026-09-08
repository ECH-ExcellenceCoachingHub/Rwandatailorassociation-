-- CreateEnum
CREATE TYPE "WarehouseMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "WarehouseStockDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "WarehouseItemCategory" AS ENUM ('FABRIC', 'THREAD_AND_TRIM', 'MACHINE', 'MACHINE_PART', 'TOOL', 'PACKAGING', 'CONSUMABLE', 'FINISHED_GOODS', 'OTHER');

-- CreateEnum
CREATE TYPE "WarehouseIssueTerms" AS ENUM ('PURCHASE', 'LOAN_OUT', 'AGAINST_LOAN', 'FREE_ISSUE');

-- CreateEnum
CREATE TYPE "WarehouseIssuanceStatus" AS ENUM ('ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CHARGED', 'SETTLED', 'WRITTEN_OFF', 'CANCELLED');

-- CreateTable
CREATE TABLE "warehouse_items" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameRw" TEXT,
    "category" "WarehouseItemCategory" NOT NULL DEFAULT 'OTHER',
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "unitCost" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "quantityOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "quantityIssued" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stock_movements" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "WarehouseMovementType" NOT NULL,
    "direction" "WarehouseStockDirection" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "quantityBefore" DECIMAL(18,3) NOT NULL,
    "quantityAfter" DECIMAL(18,3) NOT NULL,
    "unitValue" DECIMAL(18,2) NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "issuanceId" TEXT,
    "issuanceLineId" TEXT,
    "supplierName" TEXT,
    "deliveryNoteRef" TEXT,
    "note" TEXT,
    "reason" TEXT,
    "recordedById" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_issuances" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "terms" "WarehouseIssueTerms" NOT NULL DEFAULT 'PURCHASE',
    "status" "WarehouseIssuanceStatus" NOT NULL DEFAULT 'ISSUED',
    "loanId" TEXT,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "amountSettled" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountReturned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueBackAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "writtenOffAt" TIMESTAMP(3),
    "savingsTransactionId" TEXT,
    "note" TEXT,
    "cancelReason" TEXT,
    "writeOffReason" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_issuances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_issuance_lines" (
    "id" TEXT NOT NULL,
    "issuanceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "quantityReturned" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitValue" DECIMAL(18,2) NOT NULL,
    "lineValue" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_issuance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_items_associationId_isActive_idx" ON "warehouse_items"("associationId", "isActive");

-- CreateIndex
CREATE INDEX "warehouse_items_associationId_category_idx" ON "warehouse_items"("associationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_items_associationId_sku_key" ON "warehouse_items"("associationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_stock_movements_reference_key" ON "warehouse_stock_movements"("reference");

-- CreateIndex
CREATE INDEX "warehouse_stock_movements_associationId_occurredAt_idx" ON "warehouse_stock_movements"("associationId", "occurredAt");

-- CreateIndex
CREATE INDEX "warehouse_stock_movements_associationId_type_occurredAt_idx" ON "warehouse_stock_movements"("associationId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "warehouse_stock_movements_itemId_occurredAt_idx" ON "warehouse_stock_movements"("itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "warehouse_stock_movements_issuanceId_idx" ON "warehouse_stock_movements"("issuanceId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_stock_movements_itemId_sequence_key" ON "warehouse_stock_movements"("itemId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_issuances_reference_key" ON "warehouse_issuances"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_issuances_savingsTransactionId_key" ON "warehouse_issuances"("savingsTransactionId");

-- CreateIndex
CREATE INDEX "warehouse_issuances_associationId_status_issuedAt_idx" ON "warehouse_issuances"("associationId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "warehouse_issuances_memberId_issuedAt_idx" ON "warehouse_issuances"("memberId", "issuedAt");

-- CreateIndex
CREATE INDEX "warehouse_issuances_loanId_idx" ON "warehouse_issuances"("loanId");

-- CreateIndex
CREATE INDEX "warehouse_issuance_lines_issuanceId_idx" ON "warehouse_issuance_lines"("issuanceId");

-- CreateIndex
CREATE INDEX "warehouse_issuance_lines_itemId_idx" ON "warehouse_issuance_lines"("itemId");

-- AddForeignKey
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_movements" ADD CONSTRAINT "warehouse_stock_movements_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_movements" ADD CONSTRAINT "warehouse_stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "warehouse_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_movements" ADD CONSTRAINT "warehouse_stock_movements_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "warehouse_issuances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_movements" ADD CONSTRAINT "warehouse_stock_movements_issuanceLineId_fkey" FOREIGN KEY ("issuanceLineId") REFERENCES "warehouse_issuance_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_movements" ADD CONSTRAINT "warehouse_stock_movements_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuances" ADD CONSTRAINT "warehouse_issuances_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuances" ADD CONSTRAINT "warehouse_issuances_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuances" ADD CONSTRAINT "warehouse_issuances_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuances" ADD CONSTRAINT "warehouse_issuances_savingsTransactionId_fkey" FOREIGN KEY ("savingsTransactionId") REFERENCES "savings_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuances" ADD CONSTRAINT "warehouse_issuances_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuance_lines" ADD CONSTRAINT "warehouse_issuance_lines_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "warehouse_issuances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_issuance_lines" ADD CONSTRAINT "warehouse_issuance_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "warehouse_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
