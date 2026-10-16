import { afterEach, describe, expect, it, vi } from 'vitest';

import { drainJobs, MAINTENANCE_JOBS, queueMaintenance, startScheduler } from './scheduler.js';

/** A runner whose ticks start `plan[i]` steps, then nothing. */
function fakeRunner(plan: number[]) {
  const daily: string[] = [];
  let ticks = 0;
  return {
    daily,
    ticks: () => ticks,
    ensureDaily: (type: string) => {
      daily.push(type);
      return null;
    },
    tick: async () => plan[ticks++] ?? 0,
  };
}

const log = { error: vi.fn() };

afterEach(() => {
  vi.useRealTimers();
});

describe('drainJobs', () => {
  it('ticks until a tick starts nothing, so pipelines run back to back', async () => {
    const runner = fakeRunner([1, 1, 2, 1]);
    expect(await drainJobs(runner)).toBe(5);
    expect(runner.ticks()).toBe(5);
  });

  it('stops after one idle tick', async () => {
    const runner = fakeRunner([]);
    expect(await drainJobs(runner)).toBe(0);
    expect(runner.ticks()).toBe(1);
  });
});

describe('startScheduler', () => {
  it('queues maintenance and drains at startup, then polls for new jobs', async () => {
    vi.useFakeTimers();
    const runner = fakeRunner([1, 1, 1, 1]);
    const stop = startScheduler(runner, log, { maintenanceMs: 60_000, jobPollMs: 1_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.daily).toEqual([...MAINTENANCE_JOBS]);
    expect(runner.ticks()).toBe(5);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(runner.ticks()).toBe(8);
    expect(runner.daily).toHaveLength(MAINTENANCE_JOBS.length);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runner.daily).toHaveLength(MAINTENANCE_JOBS.length * 2);
    stop();
    const after = runner.ticks();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runner.ticks()).toBe(after);
  });

  it('logs a failing pass instead of throwing', async () => {
    vi.useFakeTimers();
    const runner = {
      ensureDaily: () => {
        throw new Error('db locked');
      },
      tick: async () => {
        throw new Error('tick failed');
      },
    };
    const errors = { error: vi.fn() };
    const stop = startScheduler(runner, errors);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors.error).toHaveBeenCalledWith(expect.anything(), 'maintenance pass failed');
    expect(errors.error).toHaveBeenCalledWith(expect.anything(), 'job pass failed');
    stop();
  });

  it('queues every maintenance job type', () => {
    const runner = fakeRunner([]);
    queueMaintenance(runner);
    expect(runner.daily).toEqual(['backup-db', 'purge-trash']);
  });

  it('queues the daily maintenance jobs before the first tick', async () => {
    const calls: string[] = [];
    const stop = startScheduler(
      {
        ensureDaily: (type) => {
          calls.push(type);
          return null;
        },
        tick: async () => {
          calls.push('tick');
          return 0;
        },
      },
      log,
    );
    await vi.waitFor(() => expect(calls).toEqual(['backup-db', 'purge-trash', 'tick']));
    stop();
  });
});
