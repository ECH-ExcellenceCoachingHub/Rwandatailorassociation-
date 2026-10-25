import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { toMoney, toMoneyString } from "../lib/money";

function buildReference(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  process.stdout.write(
    "This will reverse excess service fee charges for all members. Type YES to continue: "
  );
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once("data", (chunk) => resolve(chunk.toString().trim()));
    process.stdin.resume();
  });
  if (answer !== "YES") {
    console.log("Aborted.");
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const members = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      memberNumber: true,
      associationId: true,
      sharesSubscribed: true,
      savingsAccounts: {
        where: { isActive: true },
        select: { id: true, balance: true, totalDeposits: true },
      },
      platformFeeCharges: {
        where: { status: "CHARGED" },
        orderBy: { coveredThroughDay: "asc" },
        select: {
          id: true,
          daysCovered: true,
          coveredThroughDay: true,
          amount: true,
          savingsTransactionId: true,
        },
      },
      association: { select: { id: true, timezone: true, rules: true } },
    },
  });

  console.log(`Found ${members.length} active members.\n`);

  let totalReversed = 0;
  let totalCharged = 0;
  let totalMembers = 0;

  for (const member of members) {
    const account = member.savingsAccounts[0];
    if (!account) continue;

    // Build policy from association rules
    const rulesMap = new Map(
      (member.association.rules as { key: string; value: string }[]).map(
        (r) => [r.key, r.value]
      )
    );
    const dailySavings = toMoney(
      rulesMap.get("DAILY_SAVINGS") ?? "500.00"
    );
    const platformFeePerDay = toMoney(
      rulesMap.get("PLATFORM_FEE_DAILY") ?? "25.00"
    );
    const shares = Math.max(1, Number(member.sharesSubscribed) || 1);
    const dailyTotal = dailySavings
      .times(shares)
      .plus(platformFeePerDay.times(shares));

    const totalContributed = toMoney(account.totalDeposits);
    const coveredDays =
      dailyTotal.isPositive()
        ? Math.floor(totalContributed.dividedBy(dailyTotal).toNumber())
        : 0;

    const charges = member.platformFeeCharges;

    let memberChanged = false;

    // Reverse excess charges (coveredThroughDay > coveredDays)
    if (charges.length > 0) {
      const lastChargedThrough = charges[charges.length - 1].coveredThroughDay;
      if (lastChargedThrough > coveredDays) {
        let reversedForMember = 0;
        for (let i = charges.length - 1; i >= 0; i--) {
          const charge = charges[i];
          if (charge.coveredThroughDay <= coveredDays) break;
          const savingsTransactionId = charge.savingsTransactionId;
          if (!savingsTransactionId) continue;

          try {
            await prisma.$transaction(async (tx) => {
              const original = await tx.savingsTransaction.findUnique({
                where: { id: savingsTransactionId },
                select: {
                  id: true,
                  associationId: true,
                  memberId: true,
                  amount: true,
                  savingsAccountId: true,
                },
              });
              if (!original) throw new Error(`Transaction ${savingsTransactionId} not found`);

              const currentAccount = await tx.savingsAccount.findUnique({
                where: { id: account.id },
                select: { balance: true },
              });
              if (!currentAccount) throw new Error(`Account ${account.id} not found`);

              const seqResult = await tx.$queryRaw<{ seq: number }[]>`
                SELECT COALESCE(MAX("sequence"), 0) + 1 AS seq
                FROM savings_transactions
                WHERE "savingsAccountId" = ${account.id}
              `;
              const sequence = Number(seqResult[0]?.seq) || 1;

              const amount = toMoney(original.amount);
              const currentBalance = toMoney(currentAccount.balance);
              const reversalAmount = amount;
              const newBalance = currentBalance.plus(reversalAmount);

              await tx.savingsTransaction.create({
                data: {
                  associationId: original.associationId,
                  savingsAccountId: account.id,
                  memberId: original.memberId,
                  sequence,
                  reference: buildReference("FEE-REV"),
                  type: "REVERSAL",
                  direction: "CREDIT",
                  amount: toMoneyString(reversalAmount),
                  status: "COMPLETED",
                  channel: "INTERNAL_TRANSFER",
                  balanceBefore: toMoneyString(currentBalance),
                  balanceAfter: toMoneyString(newBalance),
                  reversalOfId: original.id,
                  reversalReason:
                    "Excess service fee charged for days no longer covered by deposits",
                  postedById: null,
                  currency: "RWF",
                },
              });

              await tx.$executeRawUnsafe(
                `UPDATE savings_accounts SET "totalFees" = GREATEST(0, "totalFees" - ${toMoneyString(amount)}::numeric) WHERE id = $1`,
                account.id
              );

              await tx.savingsAccount.update({
                where: { id: account.id },
                data: {
                  balance: toMoneyString(newBalance),
                },
              });

              await tx.savingsTransaction.update({
                where: { id: original.id },
                data: {
                  status: "REVERSED",
                  reversedById: null,
                  reversalReason:
                    "Excess service fee charged for days no longer covered by deposits",
                },
              });

              const chargeRecord = await tx.platformFeeCharge.findUnique({
                where: { id: charge.id },
                select: { id: true, memberId: true, coveredThroughDay: true, daysCovered: true },
              });
              if (chargeRecord) {
                const lowest = await tx.platformFeeCharge.aggregate({
                  where: { memberId: chargeRecord.memberId },
                  _min: { coveredThroughDay: true },
                });
                const parkedDay = Math.min(0, lowest._min.coveredThroughDay ?? 0) - 1;
                const firstDay =
                  chargeRecord.coveredThroughDay - chargeRecord.daysCovered + 1;

                await tx.platformFeeCharge.update({
                  where: { id: chargeRecord.id },
                  data: {
                    status: "REVERSED",
                    coveredThroughDay: parkedDay,
                    waiverReason: `Excess service fee charged for days no longer covered by deposits (covered days ${firstDay}–${chargeRecord.coveredThroughDay})`,
                  },
                });
              }
            });

            reversedForMember++;
            totalReversed++;
            console.log(
              `  ${member.memberNumber ?? member.id}: reversed fee charge ${charge.id} ` +
                `(${charge.daysCovered} days, RWF ${charge.amount})`
            );
          } catch (error) {
            console.log(
              `  ${member.memberNumber ?? member.id}: failed to reverse ${charge.id}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        if (reversedForMember > 0) {
          memberChanged = true;
          console.log(
            `    → ${reversedForMember} charge(s) reversed for ${member.memberNumber ?? member.id}`
          );
        }
      }
    } else if (coveredDays > 0) {
      // No fee charges at all but member has covered days — charge from day 1
      const dailyFee = platformFeePerDay.times(shares);
      const feeAmount = dailyFee.times(coveredDays);
      const currentAccount = await prisma.savingsAccount.findUnique({
        where: { id: account.id },
        select: { balance: true },
      });
      if (currentAccount && toMoney(currentAccount.balance).gte(feeAmount)) {
        try {
          await prisma.$transaction(async (tx) => {
            const seqResult = await tx.$queryRaw<{ seq: number }[]>`
              SELECT COALESCE(MAX("sequence"), 0) + 1 AS seq
              FROM savings_transactions
              WHERE "savingsAccountId" = ${account.id}
            `;
            const sequence = Number(seqResult[0]?.seq) || 1;
            const currentBalance = toMoney(currentAccount.balance);
            const newBalance = currentBalance.minus(feeAmount);

            await tx.savingsTransaction.create({
              data: {
                associationId: member.associationId,
                savingsAccountId: account.id,
                memberId: member.id,
                sequence,
                reference: buildReference("FEE"),
                type: "FEE",
                direction: "DEBIT",
                amount: toMoneyString(feeAmount),
                status: "COMPLETED",
                channel: "INTERNAL_TRANSFER",
                balanceBefore: toMoneyString(currentBalance),
                balanceAfter: toMoneyString(newBalance),
                currency: "RWF",
              },
            });

            await tx.$executeRawUnsafe(
              `UPDATE savings_accounts SET "totalFees" = "totalFees" + ${toMoneyString(feeAmount)}::numeric, balance = ${toMoneyString(newBalance)}::numeric WHERE id = $1`,
              account.id
            );

            await tx.platformFeeCharge.create({
              data: {
                associationId: member.associationId,
                memberId: member.id,
                reference: buildReference("PSF"),
                daysCovered: coveredDays,
                coveredThroughDay: coveredDays,
                feePerDay: toMoneyString(dailyFee),
                amount: toMoneyString(feeAmount),
                status: "CHARGED",
              },
            });
          });
          totalCharged++;
          memberChanged = true;
          console.log(
            `  ${member.memberNumber ?? member.id}: charged ${coveredDays} day(s) from scratch, RWF ${feeAmount}`
          );
        } catch (error) {
          console.log(
            `  ${member.memberNumber ?? member.id}: failed to charge from scratch: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    // Re-charge for any days covered by deposits but not yet billed
    const remainingCharges = await prisma.platformFeeCharge.findMany({
      where: { memberId: member.id, status: "CHARGED" },
      orderBy: { coveredThroughDay: "desc" },
      take: 1,
      select: { coveredThroughDay: true },
    });
    const chargedThrough = remainingCharges[0]?.coveredThroughDay ?? 0;
    const missingDays = coveredDays - chargedThrough;

    if (missingDays > 0) {
      const dailyFee = platformFeePerDay.times(shares);
      const feeAmount = dailyFee.times(missingDays);
      const currentAccount = await prisma.savingsAccount.findUnique({
        where: { id: account.id },
        select: { balance: true },
      });
      if (currentAccount && toMoney(currentAccount.balance).gte(feeAmount)) {
        try {
          await prisma.$transaction(async (tx) => {
            const seqResult = await tx.$queryRaw<{ seq: number }[]>`
              SELECT COALESCE(MAX("sequence"), 0) + 1 AS seq
              FROM savings_transactions
              WHERE "savingsAccountId" = ${account.id}
            `;
            const sequence = Number(seqResult[0]?.seq) || 1;
            const currentBalance = toMoney(currentAccount.balance);
            const newBalance = currentBalance.minus(feeAmount);

            await tx.savingsTransaction.create({
              data: {
                associationId: member.associationId,
                savingsAccountId: account.id,
                memberId: member.id,
                sequence,
                reference: buildReference("FEE"),
                type: "FEE",
                direction: "DEBIT",
                amount: toMoneyString(feeAmount),
                status: "COMPLETED",
                channel: "INTERNAL_TRANSFER",
                balanceBefore: toMoneyString(currentBalance),
                balanceAfter: toMoneyString(newBalance),
                currency: "RWF",
              },
            });

            await tx.$executeRawUnsafe(
              `UPDATE savings_accounts SET "totalFees" = "totalFees" + ${toMoneyString(feeAmount)}::numeric, balance = ${toMoneyString(newBalance)}::numeric WHERE id = $1`,
              account.id
            );

            const lastCharge = await tx.platformFeeCharge.findFirst({
              where: { memberId: member.id },
              orderBy: { coveredThroughDay: "desc" },
              select: { coveredThroughDay: true },
            });
            const newCoveredThrough = (lastCharge?.coveredThroughDay ?? 0) + missingDays;

            await tx.platformFeeCharge.create({
              data: {
                associationId: member.associationId,
                memberId: member.id,
                reference: buildReference("PSF"),
                daysCovered: missingDays,
                coveredThroughDay: newCoveredThrough,
                feePerDay: toMoneyString(dailyFee),
                amount: toMoneyString(feeAmount),
                status: "CHARGED",
              },
            });
          });
          totalCharged++;
          memberChanged = true;
          console.log(
            `  ${member.memberNumber ?? member.id}: charged ${missingDays} missing day(s), RWF ${feeAmount}`
          );
        } catch (error) {
          console.log(
            `  ${member.memberNumber ?? member.id}: failed to charge missing days: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    if (memberChanged) totalMembers++;
  }

  console.log(
    `\nDone. Reversed ${totalReversed} excess fee charge(s), charged ${totalCharged} missing day-charge(s), across ${totalMembers} member(s).`
  );

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
