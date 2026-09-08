import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@/lib/db/prisma";
import { workerLogger } from "@/lib/logger";
import {
  cleanupExpiredRecords,
  dailyFinancialSummary,
  detectOverdueLoans,
  reconcilePayments,
  retryNotifications,
  runContributionDiscipline,
  runJob,
  sendRepaymentReminders,
  syncBkTransactionsJob,
  verifyLedgerIntegrity,
  workerConfig,
} from "@/worker/jobs";

/**
 * Background worker.
 *
 * A separate process from the web app, started with `npm run worker`.
 *
 * WHY SEPARATE: a Next.js server may be scaled to several instances, restarted
 * on deploy, or scaled to zero when idle. None of that is acceptable for the
 * job that credits members' payments. Running the scheduler in its own
 * single process means jobs fire exactly once, on a predictable clock,
 * regardless of web traffic.
 *
 * RUNNING MORE THAN ONE INSTANCE WOULD DOUBLE-RUN EVERY JOB. Set
 * WORKER_ENABLED=false on all but one node. Reconciliation is idempotent so a
 * duplicate run cannot double-credit, but repayment reminders are not — members
 * would receive every SMS twice, and pay for it in goodwill.
 */

const RUN_ONCE = process.argv.includes("--once");
const ONLY = process.argv.find((arg) => arg.startsWith("--job="))?.split("=")[1];

const JOBS = {
  reconcile: { name: "payment-reconciliation", fn: reconcilePayments },
  bkSync: { name: "bk-transaction-sync", fn: syncBkTransactionsJob },
  overdue: { name: "overdue-loan-detection", fn: detectOverdueLoans },
  reminders: { name: "repayment-reminders", fn: sendRepaymentReminders },
  integrity: { name: "ledger-integrity-check", fn: verifyLedgerIntegrity },
  notifications: { name: "notification-retry", fn: retryNotifications },
  cleanup: { name: "cleanup-expired", fn: cleanupExpiredRecords },
  summary: { name: "daily-financial-summary", fn: dailyFinancialSummary },
  contributions: {
    name: "contribution-discipline",
    fn: runContributionDiscipline,
  },
} as const;

type JobKey = keyof typeof JOBS;

async function main() {
  const config = workerConfig();

  workerLogger.info(
    { runOnce: RUN_ONCE, only: ONLY ?? "all", enabled: config.enabled },
    "worker starting"
  );

  // One-shot mode, for manual runs and for hosts that provide their own
  // scheduler (Vercel Cron, Kubernetes CronJob, systemd timer).
  if (RUN_ONCE) {
    const keys = ONLY ? [ONLY as JobKey] : (Object.keys(JOBS) as JobKey[]);

    for (const key of keys) {
      const job = JOBS[key];
      if (!job) {
        workerLogger.error({ key }, "unknown job");
        continue;
      }
      await runJob(job.name, job.fn);
    }

    await prisma.$disconnect();
    workerLogger.info("one-shot run complete");
    return;
  }

  if (!config.enabled) {
    workerLogger.warn(
      "WORKER_ENABLED is false — the scheduler will not start. Set it to true on exactly one node."
    );
    return;
  }

  // Payments: the most time-sensitive job. A member who has paid should see
  // their balance update within a few minutes, not the next day.
  cron.schedule(config.reconciliationCron, () => {
    void runJob(JOBS.reconcile.name, JOBS.reconcile.fn);
  });

  // BK transactions: sync from Bank of Kigali OpenAPI.
  cron.schedule(config.bkSyncCron, () => {
    void runJob(JOBS.bkSync.name, JOBS.bkSync.fn);
  });

  // Arrears, checked in the small hours so a loan becomes overdue on the day
  // it actually is, before anyone looks at a screen.
  cron.schedule(config.overdueCron, () => {
    void runJob(JOBS.overdue.name, JOBS.overdue.fn);
  });

  // Reminders at a civilised hour.
  cron.schedule(config.reminderCron, () => {
    void runJob(JOBS.reminders.name, JOBS.reminders.fn);
  });

  // The daily saving: service fee, fines and warnings. Runs at 01:30, before
  // the arrears check and well before anyone opens a screen, so a member who
  // is fined overnight sees the fine and the warning that preceded it in the
  // right order when they wake up.
  //
  // Ahead of the integrity sweep deliberately: this job posts ledger rows, and
  // the sweep should verify the books as they stand after it, not before.
  cron.schedule("30 1 * * *", () => {
    void runJob(JOBS.contributions.name, JOBS.contributions.fn);
  });

  // Integrity sweep nightly. The one job whose failure is an emergency.
  cron.schedule("30 2 * * *", () => {
    void runJob(JOBS.integrity.name, JOBS.integrity.fn);
  });

  cron.schedule("*/10 * * * *", () => {
    void runJob(JOBS.notifications.name, JOBS.notifications.fn);
  });

  cron.schedule("0 3 * * *", () => {
    void runJob(JOBS.cleanup.name, JOBS.cleanup.fn);
  });

  cron.schedule("0 18 * * *", () => {
    void runJob(JOBS.summary.name, JOBS.summary.fn);
  });

  workerLogger.info(
    {
      reconciliation: config.reconciliationCron,
      bkSync: config.bkSyncCron,
      overdue: config.overdueCron,
      reminders: config.reminderCron,
      contributions: "30 1 * * *",
      integrity: "30 2 * * *",
      notificationRetry: "*/10 * * * *",
      cleanup: "0 3 * * *",
      summary: "0 18 * * *",
    },
    "worker scheduled"
  );

  // Graceful shutdown so an in-flight financial transaction is not severed
  // mid-commit by a deploy.
  const shutdown = async (signal: string) => {
    workerLogger.info({ signal }, "worker shutting down");
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(async (error) => {
  workerLogger.error({ err: error }, "worker failed to start");
  await prisma.$disconnect();
  process.exit(1);
});
