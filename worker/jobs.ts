import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { workerLogger, serialiseError } from "@/lib/logger";
import { runReconciliation, retryFailedPayments } from "@/lib/services/reconciliation";
import { syncBkTransactions } from "@/lib/services/bk-transactions";
import { refreshOverdueStatus } from "@/lib/services/loans";
import { verifyAccountIntegrity } from "@/lib/services/ledger";
import {
  assessFines,
  chargePlatformFees,
  sendContributionReminders,
} from "@/lib/services/contributions";
import { purgeExpiredSessions } from "@/lib/auth/session";
import { purgeExpiredQrCodes } from "@/lib/auth/qr-access";
import { notify, retryFailedDeliveries, NOTIFICATION_EVENTS } from "@/lib/notifications";
import { add, toMoneyString } from "@/lib/money";

/**
 * Scheduled jobs.
 *
 * These run in their own process (`npm run worker`), never inside a request.
 * The brief is explicit that background processing must not depend on a
 * browser being open, and it should not: reconciliation must keep crediting
 * members' payments at 3am whether or not anyone is signed in.
 *
 * Every job records a JobRun so a super admin can see when it last ran,
 * whether it succeeded, and what it did. A job that silently stops running is
 * the failure mode that hurts most here — payments would simply stop being
 * credited, with nothing on any screen to say why.
 */

type JobResult = Record<string, unknown>;

/** Wraps a job with JobRun bookkeeping and error isolation. */
export async function runJob(
  jobName: string,
  fn: () => Promise<JobResult>
): Promise<void> {
  const started = Date.now();

  const run = await prisma.jobRun.create({
    data: { jobName, status: "RUNNING" },
    select: { id: true },
  });

  try {
    const details = await fn();

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        details: details as object,
        itemsProcessed: Number(details.processed ?? 0),
        itemsSucceeded: Number(details.succeeded ?? details.processed ?? 0),
        itemsFailed: Number(details.failed ?? 0),
      },
    });

    workerLogger.info({ jobName, durationMs: Date.now() - started, ...details }, "job complete");
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    // Never rethrow: one failing job must not take the scheduler down and stop
    // every other job with it.
    workerLogger.error({ jobName, ...serialiseError(error) }, "job failed");
  }
}

/** Polls the payment provider and reconciles new transactions. */
export async function reconcilePayments(): Promise<JobResult> {
  const env = getEnv();

  const associations = await prisma.association.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, bankAccountNumber: true },
  });

  let processed = 0;
  let unmatched = 0;
  let failed = 0;
  let skipped = 0;

  for (const association of associations) {
    // An association that has not yet had its collection account configured is
    // simply not set up for payments — a normal state during onboarding, not a
    // failure. Logging it as an error every fifteen minutes would bury the
    // failures that actually need attention.
    if (!association.bankAccountNumber && !env.JENGA_ACCOUNT_NUMBER) {
      skipped++;
      workerLogger.debug(
        { associationCode: association.code },
        "skipping reconciliation — no collection account configured"
      );
      continue;
    }

    try {
      const summary = await runReconciliation({ associationId: association.id });
      processed += summary.processed;
      unmatched += summary.unmatched;
      failed += summary.errors;

      // An unmatched payment is money sitting in the association's account
      // belonging to a member who has not been credited. Someone should know.
      if (summary.unmatched > 0) {
        const { notifyAssociationAdmins } = await import("@/lib/notifications");
        await notifyAssociationAdmins(
          association.id,
          NOTIFICATION_EVENTS.PAYMENT_UNMATCHED,
          { reason: `${summary.unmatched} payment(s) need manual matching` },
          { entityType: "Payment" }
        );
      }
    } catch (error) {
      failed++;
      workerLogger.error(
        { associationCode: association.code, ...serialiseError(error) },
        "reconciliation failed for association"
      );
    }
  }

  const retried = await retryFailedPayments();

  return { associations: associations.length, skipped, processed, unmatched, failed, retried };
}

/** Syncs transactions from Bank of Kigali OpenAPI. */
export async function syncBkTransactionsJob(): Promise<JobResult> {
  const env = getEnv();

  const associations = await prisma.association.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true },
  });

  let fetched = 0;
  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let matched = 0;
  let unmatched = 0;
  let errors = 0;

  for (const association of associations) {
    try {
      const result = await syncBkTransactions({
        associationId: association.id,
        lookbackHours: env.BK_SYNC_LOOKBACK_HOURS,
        triggeredById: null,
      });

      fetched += result.transactionsFetched;
      created += result.transactionsCreated;
      updated += result.transactionsUpdated;
      duplicates += result.duplicatesSkipped;
      matched += result.matchedCount;
      unmatched += result.unmatchedCount;
      errors += result.errorsCount;

      if (result.unmatchedCount > 0) {
        const { notifyAssociationAdmins } = await import("@/lib/notifications");
        await notifyAssociationAdmins(
          association.id,
          NOTIFICATION_EVENTS.PAYMENT_UNMATCHED,
          { reason: `${result.unmatchedCount} BK transaction(s) need manual matching` },
          { entityType: "BkTransaction" }
        );
      }
    } catch (error) {
      errors++;
      workerLogger.error(
        { associationCode: association.code, ...serialiseError(error) },
        "BK sync failed for association"
      );
    }
  }

  return {
    associations: associations.length,
    fetched,
    created,
    updated,
    duplicates,
    matched,
    unmatched,
    errors,
    processed: fetched,
    succeeded: matched,
    failed: errors,
  };
}

/**
 * Near-real-time BK poll.
 *
 * Deliberately not the same thing as `syncBkTransactionsJob`. This runs every
 * few seconds and asks only "has anything landed very recently": a short
 * window, a page or two, no sync-log row unless it finds something. The cron
 * sync still runs on its own slower schedule and sweeps a long window, which
 * is what repairs whatever this missed while the worker was restarting.
 *
 * Returns a `skipped` result rather than throwing when BK has no credentials,
 * so an install that does not use BK is not woken up every five seconds to
 * fail.
 */
export async function pollBkTransactionsJob(): Promise<JobResult> {
  const env = getEnv();

  if (!env.BK_CLIENT_ID || !env.BK_CLIENT_SECRET) {
    return { skipped: 1, reason: "BK is not configured" };
  }

  const associations = await prisma.association.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true },
  });

  let fetched = 0;
  let created = 0;
  let matched = 0;
  let errors = 0;

  for (const association of associations) {
    try {
      const result = await syncBkTransactions({
        associationId: association.id,
        lookbackHours: Math.max(1, Math.ceil(env.BK_POLL_LOOKBACK_MINUTES / 60)),
        fromDate: new Date(Date.now() - env.BK_POLL_LOOKBACK_MINUTES * 60_000),
        toDate: new Date(),
        maxPages: env.BK_POLL_MAX_PAGES,
        triggeredById: null,
        persistLog: "when-interesting",
      });

      fetched += result.transactionsFetched;
      created += result.transactionsCreated;
      matched += result.matchedCount;
      errors += result.errorsCount;
    } catch (error) {
      errors++;
      workerLogger.error(
        { associationCode: association.code, ...serialiseError(error) },
        "BK poll failed for association"
      );
    }
  }

  return {
    associations: associations.length,
    fetched,
    created,
    matched,
    errors,
    processed: fetched,
    succeeded: created,
    failed: errors,
  };
}

/** Marks overdue instalments and notifies the members affected. */
export async function detectOverdueLoans(): Promise<JobResult> {
  const result = await refreshOverdueStatus();

  const overdueLoans = await prisma.loan.findMany({
    where: { status: "OVERDUE", daysOverdue: { gt: 0 } },
    select: {
      id: true,
      reference: true,
      daysOverdue: true,
      overdueAmount: true,
      member: { select: { user: { select: { id: true } } } },
    },
    take: 500,
  });

  let notified = 0;

  for (const loan of overdueLoans) {
    // Once a day at most, and only on the days that matter — daily nagging
    // trains people to ignore the messages, and each SMS costs money.
    const milestone = [1, 3, 7, 14, 30, 60, 90].includes(loan.daysOverdue);
    if (!milestone) continue;

    await notify({
      userId: loan.member.user.id,
      event: NOTIFICATION_EVENTS.LOAN_OVERDUE,
      context: {
        amount: toMoneyString(loan.overdueAmount),
        daysOverdue: loan.daysOverdue,
        reference: loan.reference,
      },
      entityType: "Loan",
      entityId: loan.id,
    });

    notified++;
  }

  return { ...result, overdueLoans: overdueLoans.length, notified, processed: notified };
}

/** Reminds members of instalments falling due shortly. */
export async function sendRepaymentReminders(): Promise<JobResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 86_400_000);

  const upcoming = await prisma.loanInstallment.findMany({
    where: {
      dueDate: { gte: now, lte: horizon },
      status: { in: ["UPCOMING", "DUE", "PARTIALLY_PAID"] },
    },
    select: {
      id: true,
      dueDate: true,
      totalDue: true,
      totalPaid: true,
      loan: {
        select: {
          id: true,
          reference: true,
          member: { select: { user: { select: { id: true } } } },
        },
      },
    },
    take: 1000,
  });

  let sent = 0;

  for (const instalment of upcoming) {
    const outstanding = add(instalment.totalDue, `-${instalment.totalPaid.toFixed(2)}`);

    await notify({
      userId: instalment.loan.member.user.id,
      event: NOTIFICATION_EVENTS.LOAN_REPAYMENT_REMINDER,
      context: {
        amount: toMoneyString(outstanding),
        dueDate: instalment.dueDate,
        reference: instalment.loan.reference,
      },
      entityType: "LoanInstallment",
      entityId: instalment.id,
    });

    sent++;
  }

  return { upcoming: upcoming.length, sent, processed: sent };
}

/**
 * LEDGER INTEGRITY SWEEP.
 *
 * Re-derives every savings balance by replaying its ledger and compares the
 * result with the cached figure. This is the check that turns "the ledger is
 * correct by construction" from a claim into something verified nightly.
 *
 * A discrepancy is a serious incident: it means either a bug or direct
 * database tampering, and it is logged at CRITICAL and raised to every super
 * admin rather than merely counted.
 */
export async function verifyLedgerIntegrity(): Promise<JobResult> {
  const accounts = await prisma.savingsAccount.findMany({
    where: { isActive: true },
    select: { id: true, accountNumber: true, associationId: true },
  });

  const failures: {
    accountNumber: string;
    cached: string;
    derived: string;
    difference: string;
    gaps: number[];
  }[] = [];

  for (const account of accounts) {
    try {
      const report = await verifyAccountIntegrity(account.id);

      if (!report.ok) {
        failures.push({
          accountNumber: account.accountNumber,
          cached: report.cachedBalance,
          derived: report.derivedBalance,
          difference: report.difference,
          gaps: report.sequenceGaps,
        });

        workerLogger.error(
          {
            accountNumber: account.accountNumber,
            cachedBalance: report.cachedBalance,
            derivedBalance: report.derivedBalance,
            difference: report.difference,
            sequenceGaps: report.sequenceGaps,
            brokenChainAt: report.brokenChainAt,
          },
          "LEDGER INTEGRITY FAILURE — cached balance does not match the ledger"
        );
      }
    } catch (error) {
      workerLogger.error(
        { accountId: account.id, ...serialiseError(error) },
        "integrity check threw"
      );
    }
  }

  if (failures.length > 0) {
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true },
    });

    await Promise.all(
      superAdmins.map((admin) =>
        notify({
          userId: admin.id,
          event: NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT,
          context: {
            reason: `LEDGER INTEGRITY ALERT: ${failures.length} savings account(s) have a balance that does not match their transaction history. Investigate immediately.`,
          },
          channels: ["IN_APP", "EMAIL"],
        })
      )
    );
  }

  return {
    checked: accounts.length,
    failed: failures.length,
    processed: accounts.length,
    failures: failures.slice(0, 20),
  };
}

/** Retries notification deliveries that failed transiently. */
export async function retryNotifications(): Promise<JobResult> {
  const attempted = await retryFailedDeliveries();
  return { attempted, processed: attempted };
}

/** Housekeeping: expired sessions, consumed tokens and dead QR codes. */
export async function cleanupExpiredRecords(): Promise<JobResult> {
  const sessions = await purgeExpiredSessions(30);

  const tokens = await prisma.verificationToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });

  const idempotency = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  // Long expired sign-in codes. Kept for a month past expiry rather than
  // dropped on the day, so that "was this card still live when it was used?"
  // is answerable for a while after the fact.
  const qrCodes = await purgeExpiredQrCodes(30);

  return {
    sessions,
    tokens: tokens.count,
    idempotencyKeys: idempotency.count,
    qrCodes,
    processed: sessions + tokens.count + idempotency.count + qrCodes,
  };
}

/** Per-association daily financial summary for administrators. */
export async function dailyFinancialSummary(): Promise<JobResult> {
  const associations = await prisma.association.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true },
  });

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const summaries: Record<string, unknown>[] = [];

  for (const association of associations) {
    const [deposits, withdrawals, newMembers, unmatched] = await Promise.all([
      prisma.savingsTransaction.aggregate({
        where: { associationId: association.id, type: "DEPOSIT", createdAt: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.savingsTransaction.aggregate({
        where: { associationId: association.id, type: "WITHDRAWAL", createdAt: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.member.count({
        where: { associationId: association.id, createdAt: { gte: since } },
      }),
      prisma.payment.count({
        where: { associationId: association.id, status: "UNMATCHED" },
      }),
    ]);

    summaries.push({
      association: association.code,
      depositCount: deposits._count,
      depositTotal: toMoneyString(deposits._sum.amount ?? 0),
      withdrawalCount: withdrawals._count,
      withdrawalTotal: toMoneyString(withdrawals._sum.amount ?? 0),
      newMembers,
      unmatchedPayments: unmatched,
    });
  }

  return { summaries, processed: summaries.length };
}

export function workerConfig() {
  const env = getEnv();
  return {
    enabled: env.WORKER_ENABLED,
    reconciliationCron: env.RECONCILIATION_CRON,
    reminderCron: env.LOAN_REMINDER_CRON,
    overdueCron: env.OVERDUE_CHECK_CRON,
    bkSyncCron: env.BK_SYNC_CRON,
    bkPollEnabled: env.BK_POLL_ENABLED && Boolean(env.BK_CLIENT_ID && env.BK_CLIENT_SECRET),
    bkPollSeconds: env.BK_POLL_SECONDS,
  };
}

/**
 * THE DAILY CONTRIBUTION SWEEP.
 *
 * Three tasks, in a fixed order, for every active association:
 *
 *   1. take the platform's service fee for contribution days members have
 *      already paid for;
 *   2. assess the fines the rulebook calls for;
 *   3. warn the members who are close to one.
 *
 * THE ORDER IS NOT ARBITRARY. Fees first, because charging them changes
 * balances but nobody's arrears. Fines next, judged on the arrears as they now
 * stand. Reminders last, so a member warned tonight is warned about their
 * position AFTER tonight's fine rather than the one before it — being told
 * "pay 6,300 to avoid a fine" by a system that fined you an hour earlier is
 * how people stop reading the messages.
 *
 * EVERY TASK IS IDEMPOTENT, guaranteed by unique indexes rather than by this
 * function being careful: (memberId, coveredThroughDay) on platform_fee_charges
 * and (memberId, dueDayIndex) on contribution_fines. A double-run, a retry
 * after a crash, or an officer pressing the manual button while this is
 * mid-flight all converge on the same state.
 *
 * One association failing does not stop the others. An association whose rules
 * are misconfigured must not cost every other tenant their nightly run.
 */
export async function runContributionDiscipline(): Promise<JobResult> {
  const associations = await prisma.association.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true },
  });

  let feesCharged = 0;
  let finesAssessed = 0;
  let warned = 0;
  let cleared = 0;
  let failed = 0;

  let feeTotal = "0.00";
  let fineTotal = "0.00";

  for (const association of associations) {
    try {
      const fees = await chargePlatformFees(association.id);
      const fines = await assessFines(association.id);
      const reminders = await sendContributionReminders(association.id);

      feesCharged += fees.charged;
      finesAssessed += fines.assessed;
      warned += reminders.warned;
      cleared += reminders.clearedNotices;

      feeTotal = toMoneyString(add(feeTotal, fees.totalCharged));
      fineTotal = toMoneyString(add(fineTotal, fines.totalAssessed));

      workerLogger.info(
        {
          association: association.code,
          fees: fees.charged,
          feesSkipped: fees.skippedInsufficientFunds,
          fines: fines.assessed,
          warned: reminders.warned,
        },
        "contribution discipline complete for association"
      );
    } catch (error) {
      failed++;
      workerLogger.error(
        { association: association.code, ...serialiseError(error) },
        "contribution discipline failed for association"
      );
    }
  }

  return {
    associations: associations.length,
    feesCharged,
    feeTotal,
    finesAssessed,
    fineTotal,
    warned,
    cleared,
    failed,
    processed: feesCharged + finesAssessed + warned,
    succeeded: feesCharged + finesAssessed + warned,
  };
}
