-- A system rule the code never reads can now be deleted by an officer. It is
-- kept as a hidden row so ensureRulebook does not re-seed it.
ALTER TABLE "association_rules" ADD COLUMN "deletedAt" TIMESTAMP(3);
