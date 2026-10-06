-- Card payment: whether a member has paid for their printed membership card.
ALTER TABLE "members" ADD COLUMN "cardPaidAt" TIMESTAMP(3);
ALTER TABLE "members" ADD COLUMN "cardPaidById" TEXT;

-- Register ordering and the card-paid filter.
CREATE INDEX "members_associationId_createdAt_idx" ON "members"("associationId", "createdAt" DESC);
CREATE INDEX "members_associationId_cardPaidAt_idx" ON "members"("associationId", "cardPaidAt");
CREATE INDEX "users_lastName_firstName_idx" ON "users"("lastName", "firstName");
CREATE INDEX "audit_logs_action_entityType_entityId_createdAt_idx" ON "audit_logs"("action", "entityType", "entityId", "createdAt");

-- Substring search (ILIKE '%…%') on the member register, served by trigram
-- indexes instead of a scan of every member and user.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "members_member_number_trgm_idx" ON "members" USING GIN ("memberNumber" gin_trgm_ops);
CREATE INDEX "members_payment_reference_trgm_idx" ON "members" USING GIN ("paymentReference" gin_trgm_ops);
CREATE INDEX "members_national_id_trgm_idx" ON "members" USING GIN ("nationalId" gin_trgm_ops);
CREATE INDEX "users_first_name_trgm_idx" ON "users" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "users_last_name_trgm_idx" ON "users" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX "users_phone_trgm_idx" ON "users" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
