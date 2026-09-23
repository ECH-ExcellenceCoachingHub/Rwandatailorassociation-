-- The loan repayment period becomes three months, as STGT's by-laws set it.
--
-- STGT Amategeko Ngengamikorere, Art. 33: "Umunyamuryango ntabwo agomba
-- kurenza amezi atatu atishyuye inguzanyo yahawe." The catalogue default moves
-- from 6 to 3 in the same change; this brings the rows associations already
-- have into line, because `ensureRulebook` only ever adds missing rules and
-- would leave every running association on six months forever.
--
-- Only rows still at the platform's old figure of 6 are touched. A committee
-- that chose some other term made a decision of its own and keeps it.
--
-- The wording of this rule, like the other rules realigned with the by-laws,
-- is brought up to date by `scripts/resync-rulebook.ts --apply`, which records
-- its own revisions. This migration only changes the figure.
INSERT INTO "association_rule_revisions" (
    "id", "ruleId", "version", "value",
    "titleEn", "titleRw", "bodyEn", "bodyRw",
    "isActive", "changedById", "changeReason", "createdAt"
)
SELECT
    gen_random_uuid()::text, r."id", r."version", r."value",
    r."titleEn", r."titleRw", r."bodyEn", r."bodyRw",
    r."isActive", NULL,
    'Aligned with the STGT by-laws (Amategeko Ngengamikorere, 13/09/2026), Art. 33: loans are repaid within three months, not six.',
    CURRENT_TIMESTAMP
FROM "association_rules" r
WHERE r."key" = 'loan.maximum_term_months'
  AND r."isSystem" = true
  AND r."value" = '6';

UPDATE "association_rules" r SET
    "value" = '3',
    "version" = r."version" + 1,
    "effectiveFrom" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE r."key" = 'loan.maximum_term_months'
  AND r."isSystem" = true
  AND r."value" = '6';
