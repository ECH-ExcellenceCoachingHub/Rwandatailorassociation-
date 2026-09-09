-- WAREHOUSE CREDIT: goods taken now and paid for over three months.
--
-- Adds the CREDIT issue terms and the four tables that carry what a member
-- owes for goods they took without paying that day: the arrangement itself,
-- its monthly instalments, the append-only payment ledger, and the fine for a
-- month gone unpaid.
--
-- WHY NOT `loans`. No money is disbursed here — a machine leaves the store,
-- and the stock ledger has already accounted for it. Recording the value again
-- as principal lent out would double-count it in every report of where the
-- association's money went. The interest also differs: a cash loan charges 2%
-- a month and gives half back to the borrower's savings, while this is 2% once
-- and none of it returns to the member. See the WAREHOUSE CREDIT section of
-- schema.prisma.
--
-- THE TWO CONSTRAINTS THAT DO THE REAL WORK, both unique indexes rather than
-- application logic:
--   warehouse_credits_issuanceId_key      — one issue can never open two debts
--   warehouse_credit_fines_installmentId_key — one missed month, one fine, no
--     matter how many times the nightly sweep re-runs or retries after a crash
--
-- Adding CREDIT to WarehouseIssueTerms and WAREHOUSE_CREDIT to RuleCategory is
-- safe in one transaction here because neither value is USED by any statement
-- in this migration; the rulebook rows carrying the new category are seeded by
-- the application on first read, from lib/rules/catalogue.ts.

-- CreateEnum
CREATE TYPE "WarehouseCreditStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarehouseCreditFineStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WAIVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "RuleCategory" ADD VALUE 'WAREHOUSE_CREDIT';

-- AlterEnum
ALTER TYPE "WarehouseIssueTerms" ADD VALUE 'CREDIT';

-- CreateTable
CREATE TABLE "warehouse_credits" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "issuanceId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "WarehouseCreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "goodsValue" DECIMAL(18,2) NOT NULL,
    "interestRate" DECIMAL(9,4) NOT NULL,
    "interestAmount" DECIMAL(18,2) NOT NULL,
    "fineRate" DECIMAL(9,4) NOT NULL,
    "fineGraceDays" INTEGER NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL,
    "interestToAssociation" BOOLEAN NOT NULL DEFAULT true,
    "totalPayable" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "principalOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penaltyOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "principalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penaltyPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "lastPaymentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),
    "writtenOffAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "writeOffReason" TEXT,
    "cancelReason" TEXT,
    "note" TEXT,
    "openedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_credit_installments" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "principalDue" DECIMAL(18,2) NOT NULL,
    "interestDue" DECIMAL(18,2) NOT NULL,
    "penaltyDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(18,2) NOT NULL,
    "principalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penaltyPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "waiverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_credit_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_credit_payments" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "penaltyPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "principalPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "associationIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "savingsTransactionId" TEXT,
    "channel" "PaymentChannel",
    "note" TEXT,
    "recordedById" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_credit_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_credit_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "penaltyAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "principalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_credit_fines" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "arrearsAmount" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(9,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "daysLate" INTEGER NOT NULL DEFAULT 0,
    "status" "WarehouseCreditFineStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "waiverReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_credit_fines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credits_issuanceId_key" ON "warehouse_credits"("issuanceId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credits_reference_key" ON "warehouse_credits"("reference");

-- CreateIndex
CREATE INDEX "warehouse_credits_associationId_status_startedAt_idx" ON "warehouse_credits"("associationId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "warehouse_credits_memberId_startedAt_idx" ON "warehouse_credits"("memberId", "startedAt");

-- CreateIndex
CREATE INDEX "warehouse_credits_status_maturityDate_idx" ON "warehouse_credits"("status", "maturityDate");

-- CreateIndex
CREATE INDEX "warehouse_credit_installments_creditId_dueDate_idx" ON "warehouse_credit_installments"("creditId", "dueDate");

-- CreateIndex
CREATE INDEX "warehouse_credit_installments_status_dueDate_idx" ON "warehouse_credit_installments"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_installments_creditId_installmentNumber_key" ON "warehouse_credit_installments"("creditId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_payments_reference_key" ON "warehouse_credit_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_payments_savingsTransactionId_key" ON "warehouse_credit_payments"("savingsTransactionId");

-- CreateIndex
CREATE INDEX "warehouse_credit_payments_associationId_occurredAt_idx" ON "warehouse_credit_payments"("associationId", "occurredAt");

-- CreateIndex
CREATE INDEX "warehouse_credit_payments_creditId_occurredAt_idx" ON "warehouse_credit_payments"("creditId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_payments_creditId_sequence_key" ON "warehouse_credit_payments"("creditId", "sequence");

-- CreateIndex
CREATE INDEX "warehouse_credit_allocations_installmentId_idx" ON "warehouse_credit_allocations"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_allocations_paymentId_installmentId_key" ON "warehouse_credit_allocations"("paymentId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_fines_installmentId_key" ON "warehouse_credit_fines"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_credit_fines_reference_key" ON "warehouse_credit_fines"("reference");

-- CreateIndex
CREATE INDEX "warehouse_credit_fines_associationId_status_assessedAt_idx" ON "warehouse_credit_fines"("associationId", "status", "assessedAt");

-- CreateIndex
CREATE INDEX "warehouse_credit_fines_memberId_assessedAt_idx" ON "warehouse_credit_fines"("memberId", "assessedAt");

-- CreateIndex
CREATE INDEX "warehouse_credit_fines_creditId_idx" ON "warehouse_credit_fines"("creditId");

-- AddForeignKey
ALTER TABLE "warehouse_credits" ADD CONSTRAINT "warehouse_credits_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credits" ADD CONSTRAINT "warehouse_credits_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credits" ADD CONSTRAINT "warehouse_credits_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "warehouse_issuances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credits" ADD CONSTRAINT "warehouse_credits_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_installments" ADD CONSTRAINT "warehouse_credit_installments_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "warehouse_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_installments" ADD CONSTRAINT "warehouse_credit_installments_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_payments" ADD CONSTRAINT "warehouse_credit_payments_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_payments" ADD CONSTRAINT "warehouse_credit_payments_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "warehouse_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_payments" ADD CONSTRAINT "warehouse_credit_payments_savingsTransactionId_fkey" FOREIGN KEY ("savingsTransactionId") REFERENCES "savings_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_payments" ADD CONSTRAINT "warehouse_credit_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_allocations" ADD CONSTRAINT "warehouse_credit_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "warehouse_credit_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_allocations" ADD CONSTRAINT "warehouse_credit_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "warehouse_credit_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "warehouse_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "warehouse_credit_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_credit_fines" ADD CONSTRAINT "warehouse_credit_fines_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
