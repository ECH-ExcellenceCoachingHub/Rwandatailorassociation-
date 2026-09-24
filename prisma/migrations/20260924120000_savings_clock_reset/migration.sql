-- An officer can restart a member's saving clock. Day numbers on fines count
-- from the obligation's start, so each fine now records which run of the
-- obligation it belongs to, and uniqueness is per run.
ALTER TABLE "contribution_fines" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "member_contribution_standings" ADD COLUMN "obligationCycle" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "contribution_fines_memberId_dueDayIndex_key";
CREATE UNIQUE INDEX "contribution_fines_memberId_cycle_dueDayIndex_key" ON "contribution_fines"("memberId", "cycle", "dueDayIndex");
