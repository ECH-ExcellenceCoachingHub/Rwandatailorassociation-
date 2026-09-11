/**
 * WHEN THE DAILY JOBS COME ROUND, AND WHETHER ONE WAS MISSED.
 *
 * node-cron fires a schedule only if the worker happens to be up at that exact
 * minute. A deploy, a crash or a restart across 01:30 therefore skips that
 * night's fines, fees and warnings — silently, until the next night — while
 * the member's page goes on telling them a fine has been added. The worker
 * uses these to notice a slot that passed without a successful run and do the
 * work late rather than not at all.
 *
 * Free of imports so the arithmetic can be tested without a database.
 */

export interface DailySlot {
  hour: number;
  minute: number;
}

/** The node-cron expression for a slot: `{ hour: 1, minute: 30 }` → "30 1 * * *". */
export function dailyCron(slot: DailySlot): string {
  return `${slot.minute} ${slot.hour} * * *`;
}

/**
 * The most recent time, at or before `now`, that a daily slot came round.
 *
 * LOCAL TIME, deliberately: node-cron runs a schedule given no `timezone` on
 * the process's own clock, and this has to agree with it — otherwise a run
 * that is simply not due yet would be judged missed, or a missed one done.
 */
export function lastDailySlot(slot: DailySlot, now: Date = new Date()): Date {
  const at = new Date(now);
  at.setHours(slot.hour, slot.minute, 0, 0);
  if (at.getTime() > now.getTime()) at.setDate(at.getDate() - 1);
  return at;
}
