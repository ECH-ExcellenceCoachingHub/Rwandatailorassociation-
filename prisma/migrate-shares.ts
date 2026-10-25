import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * ONE-TIME SHARE REBASE MIGRATION — 1000 RWF/share → 500 RWF/share.
 *
 * The daily saving (1st charge) moved from 1000 to 500 and the platform fee
 * from 50 to 25, so one share now represents 500 RWF of savings instead of
 * 1000. A member's saved money did not change, but the share count that
 * represents it must double to keep the same value:
 *
 *   • 1 share @ 1000 → 2 shares @ 500   (still 1000 RWF)
 *   • 2 shares @ 2000 → 4 shares @ 500  (still 2000 RWF)
 *   • null (counted as 1 @ 1000) → 2 shares @ 500
 *
 * Run once against a real database:
 *   DATABASE_URL="..." npx tsx prisma/migrate-shares.ts
 *
 * It is idempotent-safe only in the sense that re-running doubles again, so
 * do NOT run it twice. Back up the database first.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  // Confirm before mutating anything.
  process.stdout.write(
    "This will DOUBLE every member's sharesSubscribed (null → 2). " +
      "Type YES to continue: "
  );
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once("data", (chunk) => resolve(chunk.toString().trim()));
    process.stdin.resume();
  });
  if (answer !== "YES") {
    console.log("Aborted.");
    return;
  }

  const members = await prisma.member.findMany({
    select: { id: true, memberNumber: true, sharesSubscribed: true },
  });

  console.log(`Found ${members.length} members.`);

  let updated = 0;
  for (const member of members) {
    const oldShares = member.sharesSubscribed ?? 1;
    const newShares = oldShares * 2;

    if (member.sharesSubscribed === newShares) continue;

    await prisma.member.update({
      where: { id: member.id },
      data: { sharesSubscribed: newShares },
    });
    updated++;

    console.log(
      `  ${member.memberNumber ?? member.id}: ${oldShares} → ${newShares} shares`
    );
  }

  console.log(`\nMigrated ${updated}/${members.length} members.`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
