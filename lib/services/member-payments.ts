import "server-only";
import { prisma } from "@/lib/db/prisma";
import { add, multiply, toMoney, toMoneyString } from "@/lib/money";
import {
  computeStandings,
  getMemberStanding,
  type MemberStanding,
} from "@/lib/services/contributions";

/**
 * One member's payments, and how each one counted towards their contribution.
 *
 * Answers the question an officer is asked at the desk: "what have I paid, and
 * where did it go?" Every payment attributed to the member is listed, and each
 * one that reached their savings is split the way the rulebook splits a day's
 * contribution — the saving, and the service fee — with the running total and
 * the contribution days it has paid for so far.
 */

/** A payment that has reached the member's savings. */
const CREDITED = "PROCESSED";

export interface MemberPaymentRow {
  id: string;
  externalTransactionId: string;
  transactionReference: string | null;
  provider: string;
  channel: string;
  status: string;
  amount: string;
  currency: string;
  transactionDate: Date;
  payerName: string | null;
  payerPhone: string | null;
  narration: string | null;
  credited: boolean;
  /// The split of this payment, by the rulebook's daily proportions. Null
  /// when the payment did not reach the member's savings.
  savingsPart: string | null;
  feePart: string | null;
  /// Credited total up to and including this payment.
  runningTotal: string | null;
  /// Contribution days paid for by the running total.
  daysCovered: number | null;
}

export interface MemberPaymentHistory {
  member: {
    id: string;
    associationId: string;
    memberNumber: string;
    paymentReference: string;
    name: string;
    phone: string | null;
    status: string;
    shares: number;
  };
  standing: MemberStanding | null;
  payments: MemberPaymentRow[];
  totals: {
    paymentCount: number;
    creditedCount: number;
    credited: string;
    savingsPart: string;
    feePart: string;
    /// Service fee already taken from savings.
    feesTaken: string;
    /// Service fee for paid days that the nightly run has not taken yet.
    feesPending: string;
  };
}

export async function getMemberPaymentHistory(
  memberId: string
): Promise<MemberPaymentHistory | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      associationId: true,
      memberNumber: true,
      paymentReference: true,
      status: true,
      sharesSubscribed: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!member) return null;

  const [payments, standing, feesTaken] = await Promise.all([
    prisma.payment.findMany({
      where: { matchedMemberId: memberId },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        externalTransactionId: true,
        transactionReference: true,
        provider: true,
        channel: true,
        status: true,
        amount: true,
        currency: true,
        transactionDate: true,
        payerName: true,
        payerPhone: true,
        narration: true,
      },
    }),
    getMemberStanding(memberId),
    prisma.platformFeeCharge.aggregate({
      where: { memberId, status: "CHARGED" },
      _sum: { amount: true },
    }),
  ]);

  // The fee is owed per WHOLE contribution day paid for — 50 per share for
  // every 1,050 — exactly as the nightly fee run charges it. A payment's fee
  // part is therefore the fee on the whole days it completes; the remainder of
  // a part-paid day stays savings until the day is paid in full. Figures come
  // from the standing so this page and the fee run cannot disagree.
  const dailyTotal = toMoney(standing?.dailyTotal ?? 0);
  const dailyFee = toMoney(standing?.dailyFee ?? 0);
  let daysSoFar = 0;

  let running = toMoney(0);
  let savingsTotal = toMoney(0);
  let feeTotal = toMoney(0);
  let creditedCount = 0;

  const rows: MemberPaymentRow[] = payments.map((payment) => {
    const credited = payment.status === CREDITED;
    let savingsPart: string | null = null;
    let feePart: string | null = null;
    let runningTotal: string | null = null;
    let daysCovered: number | null = null;

    if (credited) {
      creditedCount++;
      running = add(running, payment.amount);
      const days = dailyTotal.greaterThan(0)
        ? Math.floor(running.dividedBy(dailyTotal).toNumber())
        : 0;
      const fee = multiply(dailyFee, days - daysSoFar);
      daysSoFar = days;
      const saving = toMoney(payment.amount).minus(fee);
      savingsTotal = add(savingsTotal, saving);
      feeTotal = add(feeTotal, fee);
      savingsPart = toMoneyString(saving);
      feePart = toMoneyString(fee);
      runningTotal = toMoneyString(running);
      daysCovered = dailyTotal.greaterThan(0) ? days : null;
    }

    return {
      id: payment.id,
      externalTransactionId: payment.externalTransactionId,
      transactionReference: payment.transactionReference,
      provider: payment.provider,
      channel: payment.channel,
      status: payment.status,
      amount: toMoneyString(payment.amount),
      currency: payment.currency,
      transactionDate: payment.transactionDate,
      payerName: payment.payerName,
      payerPhone: payment.payerPhone,
      narration: payment.narration,
      credited,
      savingsPart,
      feePart,
      runningTotal,
      daysCovered,
    };
  });

  return {
    member: {
      id: member.id,
      associationId: member.associationId,
      memberNumber: member.memberNumber,
      paymentReference: member.paymentReference,
      name: `${member.user.firstName} ${member.user.lastName}`.trim(),
      phone: member.user.phone,
      status: member.status,
      shares: Math.max(1, member.sharesSubscribed ?? 1),
    },
    standing,
    payments: rows,
    totals: {
      paymentCount: rows.length,
      creditedCount,
      credited: toMoneyString(running),
      savingsPart: toMoneyString(savingsTotal),
      feePart: toMoneyString(feeTotal),
      feesTaken: toMoneyString(feesTaken._sum.amount ?? 0),
      feesPending: standing?.feeAmountOwed ?? "0.00",
    },
  };
}

/**
 * The association's service fees: what has been taken from savings, what is
 * still to be taken for days already paid for, and what has been paid over to
 * the platform. Null scope gives every association together.
 */
export async function getServiceFeeSummary(associationId: string | null) {
  const scope = associationId ? { associationId } : {};

  const associationIds = associationId
    ? [associationId]
    : (await prisma.association.findMany({ select: { id: true } })).map((a) => a.id);

  const [collected, remitted, standings] = await Promise.all([
    prisma.platformFeeCharge.aggregate({
      where: { ...scope, status: "CHARGED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.platformFeeCharge.aggregate({
      where: { ...scope, status: "CHARGED", remittedAt: { not: null } },
      _sum: { amount: true },
    }),
    Promise.all(associationIds.map((id) => computeStandings(id))).then((all) =>
      all.flat()
    ),
  ]);

  let pending = toMoney(0);
  let pendingMembers = 0;
  for (const { standing } of standings) {
    if (toMoney(standing.feeAmountOwed).greaterThan(0)) {
      pending = add(pending, standing.feeAmountOwed);
      pendingMembers++;
    }
  }

  const taken = toMoney(collected._sum.amount ?? 0);
  const paidOver = toMoney(remitted._sum.amount ?? 0);

  return {
    taken: toMoneyString(taken),
    charges: collected._count,
    pending: toMoneyString(pending),
    pendingMembers,
    total: toMoneyString(add(taken, pending)),
    paidOver: toMoneyString(paidOver),
    owedToPlatform: toMoneyString(taken.minus(paidOver)),
  };
}
