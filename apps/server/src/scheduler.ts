import type { JobRunner } from '@climbing-coach/core';

export const MAINTENANCE_JOBS = ['backup-db', 'purge-trash'] as const;
export const MAINTENANCE_MS = 60_000;
/** How soon a newly queued job (e.g. `compare`) starts when no step is finishing to wake it. */
export const JOB_POLL_MS = 1_000;

type Runner = Pick<JobRunner, 'ensureDaily' | 'tick'>;
type Log = { error(fields: Record<string, unknown>, message: string): void };

export function queueMaintenance(runner: Pick<Runner, 'ensureDaily'>): void {
  for (const type of MAINTENANCE_JOBS) runner.ensureDaily(type);
}

/**
 * Ticks until a tick starts nothing, so a pipeline's dependent steps run back to back instead
 * of one step per timer pass. Resolves with the number of steps started.
 */
export async function drainJobs(runner: Pick<Runner, 'tick'>): Promise<number> {
  let total = 0;
  for (let started = await runner.tick(); started > 0; started = await runner.tick()) {
    total += started;
  }
  return total;
}

export type SchedulerOptions = { maintenanceMs?: number; jobPollMs?: number };

/**
 * Drives the job runner while the server is up: daily `backup-db` / `purge-trash`
 * (BUILD_PLAN §4.3) and user jobs such as `compare`. Drains may overlap — the runner counts
 * running steps against its resource limits — so a long step never delays a new job. Timers do
 * not keep the process alive.
 */
export function startScheduler(runner: Runner, log: Log, options: SchedulerOptions = {}) {
  const drain = () => {
    drainJobs(runner).catch((error: unknown) => log.error({ err: error }, 'job pass failed'));
  };
  const maintain = () => {
    try {
      queueMaintenance(runner);
    } catch (error) {
      log.error({ err: error }, 'maintenance pass failed');
    }
    drain();
  };
  maintain();
  const timers = [
    setInterval(maintain, options.maintenanceMs ?? MAINTENANCE_MS),
    setInterval(drain, options.jobPollMs ?? JOB_POLL_MS),
  ];
  for (const timer of timers) timer.unref();
  return () => timers.forEach((timer) => clearInterval(timer));
}
