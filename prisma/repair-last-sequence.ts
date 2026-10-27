import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * One-off repair: realign `savings_accounts.lastSequence` with the actual
 * maximum ledger sequence per account.
 *
 * Symptom this fixes: `Unique constraint failed on ("savingsAccountId", "sequence")`
 * at lib/services/ledger.ts:240 when posting a savings transaction, because a
 * savings_transactions row already exists with a sequence higher than the
 * account's cached lastSequence (lastSequence fell behind MAX(sequence)).
 *
 * Safe: only raises lastSequence, never lowers it, so no existing row is
 * touched and no new sequence collision can occur. Run once, then redeploy.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const repaired = await prisma.$queryRawUnsafe<
      { id: string; lastSequence: number; maxSeq: number | null }[]
    >(`
      UPDATE savings_accounts sa
      SET "lastSequence" = GREATEST(sa."lastSequence", COALESCE(mx.max_seq, 0))
      FROM (
        SELECT "savingsAccountId" AS id, MAX("sequence") AS max_seq
        FROM savings_transactions
        GROUP BY "savingsAccountId"
      ) mx
      WHERE sa.id = mx.id
        AND sa."lastSequence" < COALESCE(mx.max_seq, 0)
      RETURNING sa.id, sa."lastSequence", mx.max_seq;
    `);

    console.log(
      `Repaired ${repaired.length} savings account(s): lastSequence raised to >= max ledger sequence.`
    );
    for (const row of repaired) {
      console.log(
        `  ${row.id}: lastSequence ${row.lastSequence} (was behind max ledger sequence ${row.maxSeq})`
      );
    }

    // Spot check: accounts whose cached balance no longer equals replaying the ledger.
    const mismatches = await prisma.$queryRawUnsafe<{ cnt: string }[]>(`
      SELECT COUNT(*)::text AS cnt
      FROM savings_accounts sa
      WHERE sa.balance IS DISTINCT FROM (
        SELECT COALESCE(SUM(CASE st.direction WHEN 'CREDIT' THEN st.amount ELSE -st.amount END)::numeric, 0)
        FROM savings_transactions st
        WHERE st."savingsAccountId" = sa.id
      );
    `);
    console.log(`Balance mismatches vs ledger replay: ${mismatches[0].cnt}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
