import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { toMoneyString } from "../lib/money";

/**
 * RELEASE ALL FINES.
 *
 * Waives every OUTSTANDING fine (contribution and warehouse-credit) across
 * every association, because the statements were added late by the system and
 * members must not carry fines the system's own delay produced.
 *
 * Fines are WAIVED, not deleted: the assessment remains on the record with a
 * waiver reason and audit entry, so the release is auditable and the members
 * are no longer asked to pay.
 *
 * Run with: npx tsx --tsconfig tsconfig.scripts.json scripts/release-fines.ts
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WAIVER_REASON =
  "Released by the association: member statements were added late by the " +
  "system, so fines assessed for missed contributions during that delay are " +
  "forgiven. Members are not liable for fines caused by the system's delay.";

function money(value: unknown): string {
  if (value === null || value === undefined) return "0.00";
  if (typeof value.toFixed === "function") return value.toFixed(2);
  return String(value);
}

async function main() {
  const actor = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true, role: true },
  });
  if (!actor) {
    throw new Error("No SUPER_ADMIN user found to act as the waiving officer");
  }

  const associations = await prisma.association.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  let contributionWaived = 0;
  let warehouseWaived = 0;
  let contributionAmount = 0;
  let warehouseAmount = 0;
  const lines: string[] = [];

  for (const assoc of associations) {
    let assocC = 0;
    let assocW = 0;
    let assocCAmt = 0;
    let assocWAmt = 0;

    // --- Contribution fines ---
    const cfines = await prisma.contributionFine.findMany({
      where: { associationId: assoc.id, status: "OUTSTANDING" },
      select: {
        id: true,
        reference: true,
        amount: true,
        memberId: true,
        member: { select: { memberNumber: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });

    for (const fine of cfines) {
      await prisma.$transaction(async (tx) => {
        await tx.contributionFine.update({
          where: { id: fine.id },
          data: {
            status: "WAIVED",
            waivedAt: new Date(),
            waivedById: actor.id,
            waiverReason: WAIVER_REASON,
          },
        });
        await tx.auditLog.create({
          data: {
            associationId: assoc.id,
            actorId: actor.id,
            actorRole: actor.role,
            actorEmail: actor.email,
            action: "CONTRIBUTION_FINE_WAIVED",
            entityType: "ContributionFine",
            entityId: fine.id,
            oldValue: {
              status: "OUTSTANDING",
              amount: toMoneyString(fine.amount),
            },
            newValue: { status: "WAIVED" },
            reason: WAIVER_REASON,
            metadata: {
              memberId: fine.memberId,
              memberNumber: fine.member.memberNumber,
              reference: fine.reference,
            },
            severity: "NOTICE",
            ipAddress: null,
            userAgent: null,
          },
        });
      });
      contributionWaived++;
      assocC++;
      const amt = Number(money(fine.amount));
      contributionAmount += amt;
      assocCAmt += amt;
    }

    // --- Warehouse credit fines ---
    const wfines = await prisma.warehouseCreditFine.findMany({
      where: { associationId: assoc.id, status: "OUTSTANDING" },
      select: {
        id: true,
        reference: true,
        amount: true,
        memberId: true,
        creditId: true,
        installmentId: true,
        installment: { select: { penaltyPaid: true } },
        credit: { select: { reference: true } },
      },
    });

    for (const fine of wfines) {
      const amount = Number(money(fine.amount));
      const alreadyPaid = Number(money(fine.installment.penaltyPaid));
      const relief = Math.max(amount - alreadyPaid, 0);

      await prisma.$transaction(async (tx) => {
        await tx.warehouseCreditFine.update({
          where: { id: fine.id },
          data: {
            status: "WAIVED",
            waivedAt: new Date(),
            waivedById: actor.id,
            waiverReason: WAIVER_REASON,
          },
        });
        if (relief > 0) {
          await tx.warehouseCreditInstallment.update({
            where: { id: fine.installmentId },
            data: { penaltyDue: { decrement: relief.toFixed(2) } },
          });
          await tx.warehouseCredit.update({
            where: { id: fine.creditId },
            data: { penaltyOutstanding: { decrement: relief.toFixed(2) } },
          });
        }
        await tx.auditLog.create({
          data: {
            associationId: assoc.id,
            actorId: actor.id,
            actorRole: actor.role,
            actorEmail: actor.email,
            action: "WAREHOUSE_CREDIT_FINE_WAIVED",
            entityType: "WarehouseCreditFine",
            entityId: fine.id,
            oldValue: {
              status: "OUTSTANDING",
              amount: toMoneyString(fine.amount),
            },
            newValue: { status: "WAIVED" },
            reason: WAIVER_REASON,
            metadata: {
              memberId: fine.memberId,
              credit: fine.credit.reference,
              fine: fine.reference,
              amount: toMoneyString(fine.amount),
              alreadyPaid: toMoneyString(fine.installment.penaltyPaid),
              forgiven: toMoneyString(relief),
            },
            severity: "NOTICE",
            ipAddress: null,
            userAgent: null,
          },
        });
      });
      warehouseWaived++;
      assocW++;
      warehouseAmount += amount;
      assocWAmt += amount;
    }

    if (assocC > 0 || assocW > 0) {
      lines.push(
        `${assoc.code} (${assoc.name}): contribution ${assocC} waived (RWF ${assocCAmt.toFixed(2)}), ` +
          `warehouse ${assocW} waived (RWF ${assocWAmt.toFixed(2)})`
      );
    }
  }

  console.log("Fines released by:", actor.email, `(${actor.role})`);
  console.log("Waiver reason:", WAIVER_REASON);
  console.log("");
  for (const line of lines) {
    console.log("  " + line);
  }
  console.log("");
  console.log(
    `TOTAL: ${contributionWaived} contribution fines waived (RWF ${contributionAmount.toFixed(2)}) + ` +
      `${warehouseWaived} warehouse-credit fines waived (RWF ${warehouseAmount.toFixed(2)}) = ` +
      `${contributionWaived + warehouseWaived} fines, RWF ${(contributionAmount + warehouseAmount).toFixed(2)}`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Release failed:", error);
  process.exit(1);
});
