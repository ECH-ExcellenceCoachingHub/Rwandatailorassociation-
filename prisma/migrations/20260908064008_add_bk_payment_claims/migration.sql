-- CreateTable
CREATE TABLE "bk_payment_claims" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "clientReference" TEXT NOT NULL,
    "payerCode" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "memberId" TEXT,
    "status" TEXT NOT NULL,
    "expiryTime" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "rawResponse" JSONB,
    "observedAt" TIMESTAMP(3),
    "observedTransactionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bk_payment_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bk_payment_claims_clientReference_key" ON "bk_payment_claims"("clientReference");

-- CreateIndex
CREATE INDEX "bk_payment_claims_associationId_createdAt_idx" ON "bk_payment_claims"("associationId", "createdAt");

-- CreateIndex
CREATE INDEX "bk_payment_claims_associationId_observedAt_idx" ON "bk_payment_claims"("associationId", "observedAt");

-- CreateIndex
CREATE INDEX "bk_payment_claims_payerCode_idx" ON "bk_payment_claims"("payerCode");

-- AddForeignKey
ALTER TABLE "bk_payment_claims" ADD CONSTRAINT "bk_payment_claims_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_payment_claims" ADD CONSTRAINT "bk_payment_claims_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bk_payment_claims" ADD CONSTRAINT "bk_payment_claims_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
