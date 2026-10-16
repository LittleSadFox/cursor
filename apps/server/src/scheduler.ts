import type { JobRunner } from '@climbing-coach/core';

export const MAINTENANCE_JOBS = ['backup-db', 'purge-trash'] as const;
export const TICK_MS = 60_000;

type Runner = Pick<JobRunner, 'ensureDaily' | 'tick'>;
type Log = { error(fields: Record<string, unknown>, message: string): void };

/** One pass: queue today's maintenance if it has not run yet, then dispatch runnable steps. */
export async function runMaintenancePass(runner: Runner): Promise<void> {
  for (const type of MAINTENANCE_JOBS) runner.ensureDaily(type);
  await runner.tick();
}

/**
 * Drives the job runner while the server is up (BUILD_PLAN §4.3 daily `backup-db` and
 * `purge-trash`). Passes never overlap; the timer does not keep the process alive.
 */
export function startScheduler(runner: Runner, log: Log, intervalMs = TICK_MS): () => void {
  let running = false;
  const pass = () => {
    if (running) return;
    running = true;
    runMaintenancePass(runner)
      .catch((error: unknown) => log.error({ err: error }, 'maintenance pass failed'))
      .finally(() => {
        running = false;
      });
  };
  pass();
  const timer = setInterval(pass, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
