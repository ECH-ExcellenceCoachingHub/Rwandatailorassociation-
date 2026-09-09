import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@/lib/db/prisma";
import { workerLogger, serialiseError } from "@/lib/logger";
import {
  assessWarehouseCredits,
  cleanupExpiredRecords,
  dailyFinancialSummary,
  detectOverdueLoans,
  reconcilePayments,
  retryNotifications,
  runContributionDiscipline,
  pollBkTransactionsJob,
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
  warehouseCredits: {
    name: "warehouse-credit-sweep",
    fn: assessWarehouseCredits,
  },
} as const;

type JobKey = keyof typeof JOBS;

/**
 * The fast BK poll.
 *
 * Two things make a seconds-scale poll safe, and both are easy to get wrong:
 *
 *  • It re-arms only after the previous tick has finished. A plain
 *    `setInterval` fires on the wall clock regardless, so the moment BK slows
 *    down — or starts timing out, which takes 60s — ticks pile up on top of
 *    each other, each holding a database connection, until the pool is
 *    exhausted and the whole worker stops. Chaining the timer means a slow BK
 *    makes the poll slower, not fatal.
 *
 *  • It backs off when BK is failing. Hammering a bank's API every five
 *    seconds through an outage is how a client gets rate-limited, and a
 *    credentials failure would otherwise generate a sync-log row every tick
 *    forever. Consecutive failures widen the gap up to a minute; one success
 *    restores the configured interval.
 *
 * The poll writes no JobRun row: at this frequency the job log would be
 * nothing but polls. Runs that find something still record a BkSyncLog entry,
 * which is where the useful history lives.
 */
let bkPollTimer: NodeJS.Timeout | null = null;
let bkPollStopped = false;

function startBkPoll(intervalSeconds: number) {
  const baseMs = intervalSeconds * 1000;
  const maxBackoffMs = 60_000;
  let consecutiveFailures = 0;

  const tick = async () => {
    if (bkPollStopped) return;

    try {
      const result = await pollBkTransactionsJob();

      // The job reports per-association failures rather than throwing, so a
      // thrown error is not the only kind of failed tick. A tick where every
      // association failed is a systemic problem — expired credentials, BK
      // down — and must widen the interval. Without this the poll hammers the
      // bank every five seconds straight through an outage.
      const attempted = Number(result.associations ?? 0);
      const failed = Number(result.errors ?? 0);
      const totalFailure = attempted > 0 && failed >= attempted;

      if (totalFailure) {
        consecutiveFailures++;
        workerLogger.warn(
          { consecutiveFailures, attempted, failed },
          "BK poll tick failed for every association"
        );
      } else {
        consecutiveFailures = 0;

        if (Number(result.created ?? 0) > 0) {
          workerLogger.info({ ...result }, "BK poll ingested new transactions");
        }
      }
    } catch (error) {
      consecutiveFailures++;
      workerLogger.error(
        { consecutiveFailures, ...serialiseError(error) },
        "BK poll tick failed"
      );
    }

    if (bkPollStopped) return;

    const delay =
      consecutiveFailures === 0
        ? baseMs
        : Math.min(baseMs * 2 ** consecutiveFailures, maxBackoffMs);

    bkPollTimer = setTimeout(() => void tick(), delay);
  };

  workerLogger.info({ intervalSeconds }, "BK fast poll started");
  bkPollTimer = setTimeout(() => void tick(), baseMs);
}

function stopBkPoll() {
  bkPollStopped = true;
  if (bkPollTimer) {
    clearTimeout(bkPollTimer);
    bkPollTimer = null;
  }
}

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

  // BK transactions: the deep sweep. Long window, full pagination, one row in
  // the job log per run. This is what repairs whatever the fast poll below
  // missed while the worker was down or BK was unreachable.
  cron.schedule(config.bkSyncCron, () => {
    void runJob(JOBS.bkSync.name, JOBS.bkSync.fn);
  });

  // BK transactions: the fast poll, so money that lands is visible within
  // seconds rather than at the next quarter hour.
  //
  // setInterval rather than cron because cron's smallest honest unit here is
  // awkward at this scale, and because the interval has to be re-armed only
  // AFTER the previous tick finishes — see below.
  if (config.bkPollEnabled) {
    startBkPoll(config.bkPollSeconds);
  } else {
    workerLogger.info(
      "BK fast poll disabled (BK_POLL_ENABLED=false or no BK credentials configured)"
    );
  }

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

  // Goods bought on credit: the 7% for a missed month, and the standing of
  // every credit. Fifteen minutes after the contribution sweep, so the older
  // claim on a member's savings is settled first and this job reads balances
  // as they stand afterwards.
  cron.schedule("45 1 * * *", () => {
    void runJob(JOBS.warehouseCredits.name, JOBS.warehouseCredits.fn);
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
      bkPoll: config.bkPollEnabled ? `every ${config.bkPollSeconds}s` : "disabled",
      overdue: config.overdueCron,
      reminders: config.reminderCron,
      contributions: "30 1 * * *",
      warehouseCredits: "45 1 * * *",
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
    // Before disconnecting: an in-flight poll holding a connection through
    // $disconnect is exactly the mid-commit severing this handler exists to
    // avoid.
    stopBkPoll();
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
