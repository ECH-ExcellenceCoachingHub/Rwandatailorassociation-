-- CreateEnum
CREATE TYPE "BkReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'MANUALLY_MATCHED', 'DUPLICATE', 'PENDING', 'FAILED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BkMatchStrategy" AS ENUM ('MEMBER_PAYMENT_REFERENCE', 'EXTERNAL_REFERENCE', 'PAYMENT_CODE', 'PHONE_NUMBER', 'BANK_ACCOUNT', 'PAYER_NAME', 'MANUAL', 'NONE');

-- CreateTable
CREATE TABLE "bk_transactions" (
    "id" TEXT NOT NULL,
    "associationId" TEXT,
    "bkTransactionId" TEXT NOT NULL,
    "bkClientReference" TEXT,
    "bkTransactionReference" TEXT,
    "bkPaymentCode" TEXT,
    "bkExtrasClientReference" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "bkStatus" TEXT,
    "bkExtrasStatus" TEXT,
    "payerNames" TEXT,
    "payerAccount" TEXT,
    "payerContact" TEXT,
    "payeeNames" TEXT,
    "payeeAccount" TEXT,
    "beneficiaryNames" TEXT,
    "beneficiaryBank" TEXT,
    "beneficiaryBankCode" TEXT,
    "narration" TEXT,
    "serviceCode" TEXT,
    "transferType" TEXT,
    "sourceChannel" TEXT,
    "transactionStage" TEXT,
    "transactionStatus" TEXT,
    "transactionStatusComment" TEXT,
    "digitalProfileId" TEXT,
    "debitedAccount" TEXT,
    "debitedAccountOwnerNames" TEXT,
    "creditedAccount" TEXT,
    "creditedAccountOwnerNames" TEXT,
    "debitCurrency" TEXT,
    "creditCurrency" TEXT,
    "debitAccount" TEXT,
    "creditAccount" TEXT,
    "transactionDate" TIMESTAMP(3),
    "createdDate" TIMESTAMP(3),
    "updatedDate" TIMESTAMP(3),
    "rawPayload" JSONB,
    "reconciliationStatus" "BkReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedMemberId" TEXT,
    "matchStrategy" "BkMatchStrategy" NOT NULL DEFAULT 'NONE',
    "matchConfidence" INTEGER NOT NULL DEFAULT 0,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchReason" TEXT,
    "paymentId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncError" TEXT,
    "syncErrorCode" TEXT,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bk_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bk_transaction_reconciliations" (
    "id" TEXT NOT NULL,
    "bkTransactionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" "BkReconciliationStatus" NOT NULL,
    "strategy" "BkMatchStrategy" NOT NULL DEFAULT 'NONE',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "candidateIds" TEXT[],
    "resolvedMemberId" TEXT,
    "notes" TEXT,
    "errorMessage" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bk_transaction_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bk_sync_logs" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "lookbackHours" INTEGER,
    "pageSize" INTEGER,
    "startPage" INTEGER,
    "endPage" INTEGER,
    "transactionsFetched" INTEGER NOT NULL DEFAULT 0,
    "transactionsCreated" INTEGER NOT NULL DEFAULT 0,
    "transactionsUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "nextPage" INTEGER,
    "hasMore" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "triggeredById" TEXT,

    CONSTRAINT "bk_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bk_transactions_bk_transaction_id_key" ON "bk_transactions"("bkTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "bk_transactions_paymentId_key" ON "bk_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "bk_transactions_associationId_reconciliationStatus_idx" ON "bk_transactions"("associationId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "bk_transactions_reconciliationStatus_transactionDate_idx" ON "bk_transactions"("reconciliationStatus", "transactionDate");

-- CreateIndex
CREATE INDEX "bk_transactions_matchedMemberId_idx" ON "bk_transactions"("matchedMemberId");

-- CreateIndex
CREATE INDEX "bk_transactions_payerContact_idx" ON "bk_transactions"("payerContact");

-- CreateIndex
CREATE INDEX "bk_transactions_bkPaymentCode_idx" ON "bk_transactions"("bkPaymentCode");

-- CreateIndex
CREATE INDEX "bk_transactions_bkClientReference_idx" ON "bk_transactions"("bkClientReference");

-- CreateIndex
CREATE INDEX "bk_transactions_lastSyncedAt_idx" ON "bk_transactions"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "bk_transactions_importedAt_idx" ON "bk_transactions"("importedAt");

-- CreateIndex
CREATE INDEX "bk_transaction_reconciliations_bkTransactionId_attempt_idx" ON "bk_transaction_reconciliations"("bkTransactionId", "attempt");

-- CreateIndex
CREATE INDEX "bk_sync_logs_status_startedAt_idx" ON "bk_sync_logs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "bk_sync_logs_startedAt_idx" ON "bk_sync_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "bk_transactions" ADD CONSTRAINT "bk_transactions_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_transactions" ADD CONSTRAINT "bk_transactions_matchedMemberId_fkey" FOREIGN KEY ("matchedMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_transactions" ADD CONSTRAINT "bk_transactions_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_transactions" ADD CONSTRAINT "bk_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_transaction_reconciliations" ADD CONSTRAINT "bk_transaction_reconciliations_bkTransactionId_fkey" FOREIGN KEY ("bkTransactionId") REFERENCES "bk_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_transaction_reconciliations" ADD CONSTRAINT "bk_transaction_reconciliations_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_sync_logs" ADD CONSTRAINT "bk_sync_logs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
