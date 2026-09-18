import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { RULE_CATALOGUE } from "../lib/rules/catalogue";

/**
 * BRINGS EXISTING ASSOCIATIONS' RULE WORDING BACK IN LINE WITH THE CATALOGUE.
 *
 * `ensureRulebook` is deliberately additive: it creates rules that are missing
 * and never touches rules that exist, so a committee's edited wording and
 * retuned figures survive every deployment. The cost of that is real — when the
 * catalogue's own wording is corrected, associations already running keep the
 * old text forever, and members go on reading a rule the system no longer
 * follows. This closes that gap deliberately rather than by loosening
 * `ensureRulebook`, which would quietly overwrite committees' own words.
 *
 * WHAT IT WILL NOT DO:
 *
 *   • It never changes a rule's VALUE. Associations retune their daily saving,
 *     their fine rate and their loan term; those are theirs. The sole exception
 *     is a rule whose type has become TEXT, which carries no value at all.
 *
 *   • It never touches a row a person has edited (`updatedById` set). If a
 *     committee reworded a rule, their wording stands and the row is reported
 *     for a human to reconcile, not silently reverted.
 *
 * Every change writes an AssociationRuleRevision holding the OLD wording — the
 * member-visible history — and an AuditLog entry, so a member fined last year
 * can still read the rule as it stood then. That is what governance.amendment_process
 * promises, and a bulk correction is not exempt from it.
 *
 * Dry by default. Pass --apply to write.
 */

const APPLY = process.argv.includes("--apply");

const REASON =
  "Platform correction: rule wording realigned with what the system enforces. " +
  "penalty.rate and penalty.basis now say that each fine covers only the days " +
  "earlier fines did not; governance.rules_are_published no longer claims a " +
  "completeness it could not keep; contribution.catch_up_allowed is stated as a " +
  "description rather than a switch that nothing read. " +
  "lending.collateral_required_above_share and lending.collateral_coverage_percent " +
  "now describe " +
  "guarantors: members who pledge their own savings for the part of a loan " +
  "above the borrower's share, held until the loan is repaid.";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const rows = await prisma.associationRule.findMany({
    where: { isSystem: true },
    select: {
      id: true, associationId: true, key: true, valueType: true, value: true,
      titleEn: true, titleRw: true, bodyEn: true, bodyRw: true,
      isActive: true, version: true, updatedById: true,
      association: { select: { code: true } },
    },
    orderBy: [{ associationId: "asc" }, { displayOrder: "asc" }],
  });

  let changed = 0;
  let skippedEdited = 0;
  let current = 0;

  for (const row of rows) {
    const def = RULE_CATALOGUE.find((d) => d.key === row.key);
    if (!def) continue;

    const drift =
      row.titleEn !== def.title.en ||
      row.titleRw !== def.title.rw ||
      row.bodyEn !== def.body.en ||
      row.bodyRw !== def.body.rw ||
      row.valueType !== def.valueType;

    if (!drift) { current++; continue; }

    if (row.updatedById !== null) {
      skippedEdited++;
      console.log(`SKIP (edited by a person) ${row.association.code} ${row.key}`);
      continue;
    }

    changed++;
    const what: string[] = [];
    if (row.titleEn !== def.title.en || row.titleRw !== def.title.rw) what.push("title");
    if (row.bodyEn !== def.body.en || row.bodyRw !== def.body.rw) what.push("body");
    if (row.valueType !== def.valueType) what.push(`valueType ${row.valueType}->${def.valueType}`);
    console.log(`${APPLY ? "UPDATE" : "WOULD UPDATE"} ${row.association.code} ${row.key} v${row.version} (${what.join(", ")})`);

    if (!APPLY) continue;

    // A rule that has become TEXT carries no value; anything else keeps the
    // figure the association chose.
    const clearValue = def.valueType === "TEXT" && row.value !== null;

    await prisma.$transaction(async (tx) => {
      // The revision records what the rule SAID BEFORE. That is the whole
      // point of it: the answer to "what was the rule in March".
      await tx.associationRuleRevision.create({
        data: {
          ruleId: row.id,
          version: row.version,
          value: row.value,
          titleEn: row.titleEn,
          titleRw: row.titleRw,
          bodyEn: row.bodyEn,
          bodyRw: row.bodyRw,
          isActive: row.isActive,
          changedById: null,
          changeReason: REASON,
        },
      });

      await tx.associationRule.update({
        where: { id: row.id },
        data: {
          titleEn: def.title.en,
          titleRw: def.title.rw,
          bodyEn: def.body.en,
          bodyRw: def.body.rw,
          valueType: def.valueType,
          ...(clearValue ? { value: null } : {}),
          version: row.version + 1,
          // Left null so a later run still recognises this row as one no
          // person has edited. effectiveFrom is untouched: the figure did not
          // change, only the sentence describing it.
          updatedById: null,
        },
      });

      await tx.auditLog.create({
        data: {
          associationId: row.associationId,
          actorId: null,
          action: "RULE_AMENDED",
          entityType: "AssociationRule",
          entityId: row.id,
          oldValue: {
            version: row.version,
            valueType: row.valueType,
            value: row.value,
            bodyEn: row.bodyEn,
          },
          newValue: {
            version: row.version + 1,
            valueType: def.valueType,
            value: clearValue ? null : row.value,
            bodyEn: def.body.en,
          },
          reason: REASON,
          metadata: { key: row.key, source: "catalogue-resync" },
          severity: "NOTICE",
        },
      });
    });
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY RUN"} — ${changed} to change, ${current} already current, ${skippedEdited} left alone (edited by a person)`
  );
  if (!APPLY && changed > 0) console.log("Re-run with --apply to write.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
