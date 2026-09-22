-- The fine for falling behind on the daily saving becomes a flat charge per
-- share, in place of a percentage of the unpaid saving.
--
-- Before: 7% of the saving the missed days left unpaid (7,000 → 490).
-- After:  500 for each share the member holds, once the grace period passes.
--
-- Two halves, deliberately in one migration: the column that records how a new
-- fine was worked out, and the rule row that says so. Code reading the new rule
-- ships with this migration, and an association whose rulebook still said "7%"
-- while the nightly job charged 500 per share would be the exact drift the
-- rulebook exists to prevent.

-- A fine now records the per-share charge and the shares it was applied to.
-- `rate` stays for the fines already assessed under the percentage — they must
-- remain explainable under the rule that produced them — and is null on every
-- fine from here on.
ALTER TABLE "contribution_fines" ALTER COLUMN "rate" DROP NOT NULL,
ADD COLUMN "amountPerShare" DECIMAL(18,2),
ADD COLUMN "shares" INTEGER;

-- The rule itself: `penalty.rate` becomes `penalty.amount_per_share`.
--
-- AMENDED IN PLACE, NOT REPLACED. Retiring the old row and seeding a new one
-- would split one rule's history across two records, and a member fined at 7%
-- last month could no longer follow "the fine" from what it said then to what
-- it says now. The revision below keeps the old key's figure and wording.
--
-- Applied even where a committee reworded or retuned the old rule. Their words
-- describe a percentage the system no longer charges, and leaving them in
-- place would tell members something untrue; the revision keeps what they
-- wrote.
INSERT INTO "association_rule_revisions" (
    "id", "ruleId", "version", "value",
    "titleEn", "titleRw", "bodyEn", "bodyRw",
    "isActive", "changedById", "changeReason", "createdAt"
)
SELECT
    gen_random_uuid()::text, r."id", r."version", r."value",
    r."titleEn", r."titleRw", r."bodyEn", r."bodyRw",
    r."isActive", NULL,
    'Platform change: the fine for missed saving is now a flat amount for each share held (500 per share by default), replacing the percentage of unpaid saving. Rule key penalty.rate became penalty.amount_per_share.',
    CURRENT_TIMESTAMP
FROM "association_rules" r
WHERE r."key" = 'penalty.rate'
  AND r."isSystem" = true
  AND NOT EXISTS (
      SELECT 1 FROM "association_rules" n
      WHERE n."associationId" = r."associationId"
        AND n."key" = 'penalty.amount_per_share'
  );

UPDATE "association_rules" r SET
    "key" = 'penalty.amount_per_share',
    "valueType" = 'MONEY',
    "value" = '500.00',
    "titleEn" = 'The fine',
    "titleRw" = 'Ihazabu',
    "bodyEn" = $$The fine is this amount for each share you hold — a member with three shares is fined three times it. It does not depend on how much you have saved or how much you owe: missing seven days with one share is fined 500, and with three shares 1,500. Each further fine covers only the days the ones before it did not, so a second seven days adds another fine of the same size rather than charging the first week again. The fine is owed to the association, not to the platform.$$,
    "bodyRw" = $$Ihazabu ni aya mafaranga kuri buri mugabane ufite — umunyamuryango ufite imigabane itatu ahabwa ihazabu y'inshuro eshatu zayo. Ntishingira ku byo wazigamye cyangwa ku mwenda ufite: gusiba iminsi irindwi ufite umugabane umwe bihanishwa 500, naho ufite imigabane itatu 1,500. Buri hazabu ikurikira ireba gusa iminsi izayibanjirije zitarebye, bityo indi minsi irindwi yongeraho indi hazabu ingana n'iya mbere aho kongera guhana icyumweru cya mbere. Ihazabu igenerwa ihuriro, si urubuga.$$,
    "version" = r."version" + 1,
    "effectiveFrom" = CURRENT_TIMESTAMP,
    -- Null, as the rulebook resync leaves it: no person made this change.
    "updatedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE r."key" = 'penalty.rate'
  AND r."isSystem" = true
  AND NOT EXISTS (
      SELECT 1 FROM "association_rules" n
      WHERE n."associationId" = r."associationId"
        AND n."key" = 'penalty.amount_per_share'
  );

-- `penalty.basis` said the fine was "worked out from the days you have
-- missed". It now depends on the shares held as well. Only rows still carrying
-- the platform's own wording are touched: a committee's rewording of this one
-- is not made false by the change, and stays theirs.
INSERT INTO "association_rule_revisions" (
    "id", "ruleId", "version", "value",
    "titleEn", "titleRw", "bodyEn", "bodyRw",
    "isActive", "changedById", "changeReason", "createdAt"
)
SELECT
    gen_random_uuid()::text, r."id", r."version", r."value",
    r."titleEn", r."titleRw", r."bodyEn", r."bodyRw",
    r."isActive", NULL,
    'Platform correction: rule wording realigned with the fine now being a flat amount per share.',
    CURRENT_TIMESTAMP
FROM "association_rules" r
WHERE r."key" = 'penalty.basis'
  AND r."isSystem" = true
  AND r."bodyEn" = $$The fine is worked out from the days you have missed, never from the savings you have built up, so a member who has saved for years is not fined more than a member who joined last month for the same missed week. The fine is recorded as owed and shown to you before anything is taken from your account, and an officer may waive it with a written reason.$$;

UPDATE "association_rules" r SET
    "bodyEn" = $$The fine depends only on the shares you hold and the days you have missed, never on the savings you have built up, so a member who has saved for years is not fined more than a member with the same shares who joined last month, for the same missed week. The fine is recorded as owed and shown to you before anything is taken from your account, and an officer may waive it with a written reason.$$,
    "bodyRw" = $$Ihazabu ishingira gusa ku migabane ufite no ku minsi wasibye, ntabwo ibarwa ku buzigame wubatse, bityo umunyamuryango umaze imyaka azigama ntahabwa ihazabu iruta iy'ufite imigabane ingana n'iye winjiye ukwezi gushize, ku cyumweru kimwe basibye. Ihazabu yandikwa nk'umwenda kandi ukayibona mbere y'uko hagira igikurwa muri konti yawe, kandi umuyobozi ashobora kuyireka atanze impamvu yanditse.$$,
    "version" = r."version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE r."key" = 'penalty.basis'
  AND r."isSystem" = true
  AND r."bodyEn" = $$The fine is worked out from the days you have missed, never from the savings you have built up, so a member who has saved for years is not fined more than a member who joined last month for the same missed week. The fine is recorded as owed and shown to you before anything is taken from your account, and an officer may waive it with a written reason.$$;
