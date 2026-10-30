-- Association-wide deductions: money taken out of the members' pool, split
-- across every member's savings with a reason each member is shown.
-- CreateEnum
CREATE TYPE "PoolDeductionPurpose" AS ENUM ('MEMBER_LOAN', 'ASSOCIATION_PROJECT', 'ASSOCIATION_EXPENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PoolDeductionAllocation" AS ENUM ('BY_BALANCE', 'BY_SHARES', 'EQUAL');

-- AlterTable
ALTER TABLE "savings_transactions" ADD COLUMN     "poolDeductionId" TEXT;

-- CreateTable
CREATE TABLE "association_deductions" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "purpose" "PoolDeductionPurpose" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "allocation" "PoolDeductionAllocation" NOT NULL,
    "membersAffected" INTEGER NOT NULL,
    "beneficiaryMemberId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "association_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "association_deductions_reference_key" ON "association_deductions"("reference");

-- CreateIndex
CREATE INDEX "association_deductions_associationId_createdAt_idx" ON "association_deductions"("associationId", "createdAt");

-- CreateIndex
CREATE INDEX "savings_transactions_poolDeductionId_idx" ON "savings_transactions"("poolDeductionId");

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_poolDeductionId_fkey" FOREIGN KEY ("poolDeductionId") REFERENCES "association_deductions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_deductions" ADD CONSTRAINT "association_deductions_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_deductions" ADD CONSTRAINT "association_deductions_beneficiaryMemberId_fkey" FOREIGN KEY ("beneficiaryMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_deductions" ADD CONSTRAINT "association_deductions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

