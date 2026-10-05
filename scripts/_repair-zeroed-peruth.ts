import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * One-off: RTA-M000016 was set to zero by ADJ-2610-TYHUGD5ZBY before a balance
 * correction removed money from contributions too. The 16,800 recorded by hand
 * is still counted in totalDeposits, and the fee charge for days 5–8 was paid
 * for out of it. Dry run unless --apply.
 */
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ACCOUNT = "cmu6zcg0p000x01eoulae2ur9";
const MEMBER = "cmu6zcfo2000w01eomit0eqgb";
const CORRECTION = "ADJ-2610-TYHUGD5ZBY";

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM savings_accounts WHERE id = ${ACCOUNT} FOR UPDATE`;
    const account = await tx.savingsAccount.findUniqueOrThrow({ where: { id: ACCOUNT } });
    const charges = await tx.platformFeeCharge.findMany({
      where: { memberId: MEMBER, status: "CHARGED" },
      orderBy: { coveredThroughDay: "asc" },
    });

    console.log("before:", {
      balance: account.balance.toFixed(2),
      totalDeposits: account.totalDeposits.toFixed(2),
      charges: charges.map(
        (c) =>
          `${c.reference} days ${c.coveredThroughDay - c.daysCovered + 1}-${c.coveredThroughDay} ` +
          `${c.amount.toFixed(2)} remitted=${Boolean(c.remittedAt)}`
      ),
    });

    // Refuse unless the account is exactly as inspected.
    if (
      account.balance.toFixed(2) !== "16000.00" ||
      account.totalDeposits.toFixed(2) !== "33600.00" ||
      charges.length !== 2 ||
      charges[1].coveredThroughDay !== 8 ||
      charges[1].daysCovered !== 4 ||
      charges[1].remittedAt
    ) {
      throw new Error("The account has changed since it was inspected; not repairing.");
    }
    const phantomFee = charges[1];

    // The hand-recorded deposit and the adjustment that took it back. Linking
    // them marks the deposit REVERSED, which takes it out of "collected this
    // month" and the deposit charts. Neither row's amount or balance changes,
    // so the ledger still replays to the same balance.
    const deposit = await tx.savingsTransaction.findFirstOrThrow({
      where: { savingsAccountId: ACCOUNT, sequence: 1 },
    });
    const adjustment = await tx.savingsTransaction.findUniqueOrThrow({
      where: { reference: CORRECTION },
    });
    if (
      deposit.type !== "DEPOSIT" ||
      deposit.status !== "COMPLETED" ||
      deposit.amount.toFixed(2) !== "16800.00" ||
      adjustment.savingsAccountId !== ACCOUNT ||
      adjustment.reversalOfId
    ) {
      throw new Error("The deposit or adjustment has changed since it was inspected; not repairing.");
    }

    const lowest = await tx.platformFeeCharge.aggregate({
      where: { memberId: MEMBER },
      _min: { coveredThroughDay: true },
    });
    const parkedDay = Math.min(0, lowest._min.coveredThroughDay ?? 0) - 1;

    console.log("after:", {
      balance: "16000.00",
      totalDeposits: "16800.00",
      voided: `${phantomFee.reference} (800.00), parked at day ${parkedDay}`,
      depositReversed: `${deposit.reference} (16800.00), by ${CORRECTION}`,
    });
    if (!APPLY) {
      console.log("Dry run. Re-run with --apply to write.");
      return;
    }

    await tx.savingsAccount.update({ where: { id: ACCOUNT }, data: { totalDeposits: "16800" } });
    const why = "Recorded by hand, then brought in by the bank statement; removed by " + CORRECTION;
    await tx.savingsTransaction.update({
      where: { id: adjustment.id },
      data: { reversalOfId: deposit.id, reversalReason: why },
    });
    await tx.savingsTransaction.update({
      where: { id: deposit.id },
      data: { status: "REVERSED", reversedById: adjustment.postedById, reversalReason: why },
    });
    await tx.platformFeeCharge.update({
      where: { id: phantomFee.id },
      data: {
        status: "REVERSED",
        coveredThroughDay: parkedDay,
        waiverReason:
          `Voided: paid for only by the 16,800 recorded by hand and removed by ${CORRECTION}; ` +
          "the real transfers cover days 1–4 (covered days 5–8)",
      },
    });
    await tx.auditLog.create({
      data: {
        action: "PLATFORM_FEE_WAIVED",
        entityType: "SavingsAccount",
        entityId: ACCOUNT,
        associationId: account.associationId,
        oldValue: { totalDeposits: "33600.00" },
        newValue: {
          totalDeposits: "16800.00",
          feeChargesVoided: [phantomFee.reference],
          feeVoided: "800.00",
        },
        reason: `Money removed by ${CORRECTION} taken out of contributions as well`,
        metadata: { memberId: MEMBER, correction: CORRECTION },
        severity: "CRITICAL",
      },
    });
    console.log("Applied.");
  }, { maxWait: 30_000, timeout: 60_000 });
}

main().finally(() => prisma.$disconnect());
