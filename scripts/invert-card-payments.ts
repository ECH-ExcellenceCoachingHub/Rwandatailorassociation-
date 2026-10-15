import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

/**
 * Invert card payment status for all members:
 * - If cardPaidAt is set (paid) → set to null (unpaid)
 * - If cardPaidAt is null (unpaid) → set to now (paid)
 *
 * Run with:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/invert-card-payments.ts
 */

async function main() {
  console.log("Fetching all members...");

  const members = await prisma.member.findMany({
    select: {
      id: true,
      memberNumber: true,
      cardPaidAt: true,
    },
    orderBy: { memberNumber: "asc" },
  });

  console.log(`Found ${members.length} members\n`);

  let flippedToUnpaid = 0;
  let flippedToPaid = 0;

  for (const member of members) {
    const wasPaid = member.cardPaidAt !== null;

    if (wasPaid) {
      // Paid → Unpaid
      await prisma.member.update({
        where: { id: member.id },
        data: { cardPaidAt: null, cardPaidById: null },
      });
      flippedToUnpaid++;
      console.log(`  ${member.memberNumber}: paid → unpaid`);
    } else {
      // Unpaid → Paid
      await prisma.member.update({
        where: { id: member.id },
        data: { cardPaidAt: new Date(), cardPaidById: null },
      });
      flippedToPaid++;
      console.log(`  ${member.memberNumber}: unpaid → paid`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Flipped to unpaid: ${flippedToUnpaid}`);
  console.log(`  Flipped to paid:   ${flippedToPaid}`);
  console.log(`  Total members:     ${members.length}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});