import { describe, expect, it } from 'vitest';

import { ProblemError, type CoachEvent, type Job } from '@climbing-coach/api';

import { getJob, saveJob } from '../db/repos/jobs.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';
import { createEventBus } from '../ports/events.js';
import { fakeClock } from '../test/fakes.js';
import { openMemoryLibrary } from '../test/memory-db.js';
import { createJobRunner } from './runner.js';
import type { Pipeline, StepHandler } from './types.js';

const DAY_MS = 86_400_000;

const PIPELINES: readonly Pipeline[] = [
  {
    type: 'chain',
    steps: [
      { name: 'first', resource: 'compute', dependsOn: [] },
      { name: 'second', resource: 'compute', dependsOn: ['first'] },
    ],
  },
  { type: 'cpu', steps: [{ name: 'work', resource: 'compute', dependsOn: [] }] },
  { type: 'pose', steps: [{ name: 'infer', resource: 'pose', dependsOn: [] }] },
  { type: 'chore', steps: [{ name: 'tidy', resource: 'idle', dependsOn: [] }] },
];

type Deferred = { promise: Promise<void>; resolve(): void; reject(error: Error): void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(handlers: Record<string, StepHandler>, cpuCores = 4) {
  const clock = fakeClock();
  const memory = openMemoryLibrary(clock.nowIso());
  const ids = createIdGen(clock, sequentialRandomBytes(1));
  const events = createEventBus(() => clock.nowMs());
  const seen: CoachEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const make = () =>
    createJobRunner({
      db: memory.db,
      clock,
      ids,
      events,
      pipelines: PIPELINES,
      handlers,
      cpuCores,
    });
  return { clock, db: memory.db, runner: make(), make, seen };
}

/** Lets handler promises settle without finishing `tick()`. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('job runner', () => {
  it('runs dependent steps across ticks and completes the job', async () => {
    const order: string[] = [];
    const { runner, seen } = setup({
      'chain.first': async () => order.push('first'),
      'chain.second': async () => {
        order.push('second');
        return { ok: true };
      },
    });
    const job = runner.enqueue('chain', {});
    await runner.tick();
    expect(runner.get(job.id).steps.map((s) => s.status)).toEqual(['succeeded', 'queued']);
    await runner.tick();
    const done = runner.get(job.id);
    expect(done.status).toBe('succeeded');
    expect(done.result).toEqual({ ok: true });
    expect(order).toEqual(['first', 'second']);
    expect(seen.some((event) => event.type === 'job.completed')).toBe(true);
  });

  it('starts every runnable step within its resource limit in one tick', async () => {
    const gate = deferred();
    let running = 0;
    let peak = 0;
    const { runner } = setup(
      {
        'cpu.work': async () => {
          running += 1;
          peak = Math.max(peak, running);
          await gate.promise;
          running -= 1;
        },
      },
      4,
    );
    for (let i = 0; i < 5; i += 1) runner.enqueue('cpu', {});
    const tick = runner.tick();
    await flush();
    expect(running).toBe(3);
    gate.resolve();
    await tick;
    expect(peak).toBe(3);
    expect(runner.list().filter((job) => job.status === 'queued')).toHaveLength(2);
  });

  it('keeps idle work waiting while non-idle work runs', async () => {
    const gate = deferred();
    const { runner } = setup({
      'pose.infer': () => gate.promise,
      'chore.tidy': async () => undefined,
    });
    runner.enqueue('pose', {});
    const chore = runner.enqueue('chore', {});
    const tick = runner.tick();
    await flush();
    expect(runner.get(chore.id).status).toBe('queued');
    gate.resolve();
    await tick;
    await runner.tick();
    expect(runner.get(chore.id).status).toBe('succeeded');
  });

  it('keeps a job cancelled when its in-flight step finishes afterwards', async () => {
    const gate = deferred();
    let aborted = false;
    const { runner, db } = setup({
      'cpu.work': async ({ signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        await gate.promise;
        return { late: true };
      },
    });
    const job = runner.enqueue('cpu', {});
    const tick = runner.tick();
    await flush();
    runner.cancel(job.id);
    expect(aborted).toBe(true);
    gate.resolve();
    await tick;
    const stored = getJob(db, job.id);
    expect(stored.status).toBe('cancelled');
    expect(stored.result).toBeNull();
  });

  it('refuses to cancel a finished job', async () => {
    const { runner } = setup({ 'cpu.work': async () => undefined });
    const job = runner.enqueue('cpu', {});
    await runner.tick();
    expect(() => runner.cancel(job.id)).toThrow(ProblemError);
    expect(runner.get(job.id).status).toBe('succeeded');
  });

  it('fails the job when a step throws, and retry requeues only the failed step', async () => {
    let calls = 0;
    const { runner } = setup({
      'chain.first': async () => undefined,
      'chain.second': async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
      },
    });
    const job = runner.enqueue('chain', {});
    await runner.tick();
    await runner.tick();
    expect(runner.get(job.id)).toMatchObject({ status: 'failed', error: 'boom' });
    runner.retry(job.id);
    expect(runner.get(job.id).steps.map((s) => s.status)).toEqual(['succeeded', 'queued']);
    await runner.tick();
    expect(runner.get(job.id).status).toBe('succeeded');
  });

  it('recovers steps orphaned as running by a previous process', async () => {
    const { runner, db, make } = setup({ 'cpu.work': async () => 'done' });
    const job = runner.enqueue('cpu', {});
    const crashed: Job = {
      ...job,
      status: 'running',
      steps: job.steps.map((s) => ({ ...s, status: 'running' })),
    };
    saveJob(db, crashed);

    const restarted = make();
    await restarted.tick();
    expect(getJob(db, job.id).status).toBe('running');
    expect(restarted.recover()).toBe(1);
    expect(getJob(db, job.id).status).toBe('queued');
    await restarted.tick();
    expect(getJob(db, job.id).status).toBe('succeeded');
  });

  it('ensureDaily enqueues at most once per UTC day', () => {
    const { runner, clock } = setup({});
    expect(runner.ensureDaily('chore')).not.toBeNull();
    expect(runner.ensureDaily('chore')).toBeNull();
    clock.advance(DAY_MS);
    expect(runner.ensureDaily('chore')).not.toBeNull();
  });

  it('fails a job whose step has no handler', async () => {
    const { runner } = setup({});
    const job = runner.enqueue('chore', {});
    await runner.tick();
    expect(runner.get(job.id).status).toBe('failed');
  });
});
