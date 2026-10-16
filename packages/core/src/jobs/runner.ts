import type { Accepted, Job, JobQuery, JobStep } from '@climbing-coach/api';
import { ProblemError } from '@climbing-coach/api';

import type { IdGen } from '../ids/ulid.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { AppDatabase } from '../ports/sql.js';
import {
  getJob,
  incompleteJobs,
  insertJob,
  latestJobOfType,
  listJobs,
  saveJob,
} from '../db/repos/jobs.js';
import { isTerminal, nextRunnableStep, requeueOrphanedSteps } from './dispatch.js';
import { countRunning, defaultLimits } from './resources.js';
import { stepProgress, stepsFromPipeline, type Pipeline, type StepHandler } from './types.js';

export type JobRunner = {
  enqueue(type: string, payload: unknown): Job;
  /** Enqueues `type` unless a job of that type was already created on the current UTC day. */
  ensureDaily(type: string, payload?: unknown): Job | null;
  list(query?: JobQuery): Job[];
  get(id: string): Job;
  cancel(id: string): void;
  retry(id: string): Accepted;
  /** Requeues steps left `running` by a previous process. Call once at startup. */
  recover(): number;
  /** Starts every runnable step that fits its resource class and resolves when they finish. */
  tick(): Promise<void>;
};

export type JobRunnerOptions = {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  events: EventBus;
  pipelines: readonly Pipeline[];
  handlers: Readonly<Record<string, StepHandler>>;
  cpuCores?: number | undefined;
};

function findPipeline(pipelines: readonly Pipeline[], type: string): Pipeline {
  const pipeline = pipelines.find((item) => item.type === type);
  if (!pipeline) throw new ProblemError('VALIDATION_FAILED', `unknown job type ${type}`);
  return pipeline;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createJobRunner(opts: JobRunnerOptions): JobRunner {
  const limits = defaultLimits(opts.cpuCores ?? 4);
  /** One shared object per job with running steps, so concurrent steps never persist stale copies. */
  const active = new Map<string, Job>();
  const controllers = new Map<string, AbortController>();
  const stepKey = (job: Job, step: JobStep) => `${job.id}:${step.name}`;

  function load(id: string): Job {
    return active.get(id) ?? getJob(opts.db, id);
  }

  function abortRunning(job: Job): void {
    for (const step of job.steps) controllers.get(stepKey(job, step))?.abort();
  }

  function completeJob(job: Job, status: Job['status'], error: string | null): void {
    job.status = status;
    job.finishedAt = opts.clock.nowIso();
    job.error = error;
    job.progress = status === 'succeeded' ? 1 : stepProgress(job.steps);
    saveJob(opts.db, job);
    abortRunning(job);
    opts.events.publish({
      type: status === 'succeeded' ? 'job.completed' : 'job.failed',
      jobId: job.id,
      jobType: job.type,
      ...(error === null ? { result: job.result } : { error }),
    });
  }

  function startStep(job: Job, step: JobStep): Promise<void> | null {
    const handler = opts.handlers[`${job.type}.${step.name}`] ?? opts.handlers[step.name];
    if (!handler) {
      step.status = 'failed';
      step.error = `no handler for ${job.type}.${step.name}`;
      completeJob(job, 'failed', step.error);
      return null;
    }
    if (job.startedAt === null) job.startedAt = opts.clock.nowIso();
    job.status = 'running';
    step.status = 'running';
    saveJob(opts.db, job);
    active.set(job.id, job);
    const controller = new AbortController();
    controllers.set(stepKey(job, step), controller);
    return runStep(job, step, handler, controller.signal);
  }

  async function runStep(
    job: Job,
    step: JobStep,
    handler: StepHandler,
    signal: AbortSignal,
  ): Promise<void> {
    let result: unknown;
    let failure: string | null = null;
    try {
      result = await handler({ job, step, signal });
    } catch (error) {
      failure = errorMessage(error);
    } finally {
      controllers.delete(stepKey(job, step));
    }
    // Cancelled (or failed by a sibling step) while this step ran: its outcome is moot.
    if (!isTerminal(job.status)) finishStep(job, step, result, failure);
    if (!job.steps.some((item) => item.status === 'running')) active.delete(job.id);
  }

  function finishStep(job: Job, step: JobStep, result: unknown, failure: string | null): void {
    if (failure !== null) {
      step.status = 'failed';
      step.error = failure;
      completeJob(job, 'failed', failure);
      return;
    }
    step.status = 'succeeded';
    step.error = null;
    job.result = result ?? job.result;
    job.progress = stepProgress(job.steps);
    opts.events.publish({
      type: 'job.progress',
      jobId: job.id,
      jobType: job.type,
      step: step.name,
      progress: job.progress,
    });
    if (job.steps.every((item) => item.status === 'succeeded')) completeJob(job, 'succeeded', null);
    else saveJob(opts.db, job);
  }

  function enqueue(type: string, payload: unknown): Job {
    const pipeline = findPipeline(opts.pipelines, type);
    const job: Job = {
      id: opts.ids.ulid(),
      type,
      status: 'queued',
      steps: stepsFromPipeline(pipeline),
      progress: 0,
      payload,
      result: null,
      error: null,
      attempt: 0,
      createdAt: opts.clock.nowIso(),
      startedAt: null,
      finishedAt: null,
    };
    insertJob(opts.db, job);
    return job;
  }

  return {
    enqueue,
    ensureDaily(type, payload = {}) {
      const latest = latestJobOfType(opts.db, type);
      if (latest && latest.createdAt.slice(0, 10) === opts.clock.nowIso().slice(0, 10)) return null;
      return enqueue(type, payload);
    },
    list: (query) => listJobs(opts.db, query),
    get: (id) => load(id),
    cancel(id) {
      const job = load(id);
      if (isTerminal(job.status)) {
        throw new ProblemError('VALIDATION_FAILED', `job ${id} already ${job.status}`);
      }
      for (const step of job.steps) {
        if (step.status === 'queued' || step.status === 'running') step.status = 'cancelled';
      }
      completeJob(job, 'cancelled', null);
    },
    retry(id) {
      const job = load(id);
      if (job.status !== 'failed' && job.status !== 'cancelled') {
        throw new ProblemError('VALIDATION_FAILED', `job ${id} is ${job.status}`);
      }
      job.status = 'queued';
      job.attempt += 1;
      job.error = null;
      job.finishedAt = null;
      job.startedAt = null;
      for (const step of job.steps) {
        if (step.status === 'failed' || step.status === 'cancelled') {
          step.status = 'queued';
          step.error = null;
        }
      }
      saveJob(opts.db, job);
      return { jobId: job.id };
    },
    recover() {
      let recovered = 0;
      for (const job of incompleteJobs(opts.db)) {
        if (active.has(job.id) || !requeueOrphanedSteps(job)) continue;
        saveJob(opts.db, job);
        recovered += 1;
      }
      return recovered;
    },
    async tick() {
      const open = incompleteJobs(opts.db).map((job) => active.get(job.id) ?? job);
      const running = countRunning(
        open.flatMap((job) =>
          job.steps.filter((step) => step.status === 'running').map((step) => step.resource),
        ),
      );
      const started: Promise<void>[] = [];
      for (const job of open) {
        for (
          let step = nextRunnableStep(job, limits, running);
          step;
          step = nextRunnableStep(job, limits, running)
        ) {
          running[step.resource] += 1;
          const run = startStep(job, step);
          if (run) started.push(run);
        }
      }
      await Promise.all(started);
    },
  };
}
