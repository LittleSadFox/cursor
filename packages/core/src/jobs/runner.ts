import type { Accepted, Job, JobQuery, JobStep } from '@climbing-coach/api';
import { ProblemError } from '@climbing-coach/api';

import type { IdGen } from '../ids/ulid.js';
import type { Clock } from '../ports/clock.js';
import type { EventBus } from '../ports/events.js';
import type { AppDatabase } from '../ports/sql.js';
import { getJob, incompleteJobs, insertJob, listJobs, saveJob } from '../db/repos/jobs.js';
import { countRunning, defaultLimits, hasCapacity, type ResourceLimits } from './resources.js';
import { stepProgress, stepsFromPipeline, type Pipeline, type StepHandler } from './types.js';

export type JobRunner = {
  enqueue(type: string, payload: unknown): Job;
  list(query?: JobQuery): Job[];
  get(id: string): Job;
  cancel(id: string): void;
  retry(id: string): Accepted;
  tick(): Promise<void>;
};

function findPipeline(pipelines: readonly Pipeline[], type: string): Pipeline {
  const pipeline = pipelines.find((item) => item.type === type);
  if (!pipeline) throw new ProblemError('VALIDATION_FAILED', `unknown job type ${type}`);
  return pipeline;
}

function runnableStep(job: Job, limits: ResourceLimits, running: ReturnType<typeof countRunning>): JobStep | null {
  const busyNonIdle = (running.pose ?? 0) + (running.ffmpeg ?? 0) + (running.compute ?? 0) > 0;
  for (const step of job.steps) {
    if (step.status !== 'queued') continue;
    const depsOk = step.dependsOn.every((name) =>
      job.steps.some((other) => other.name === name && other.status === 'succeeded'),
    );
    if (!depsOk) continue;
    if (!hasCapacity(limits, running, step.resource, busyNonIdle)) continue;
    return step;
  }
  return null;
}

export function createJobRunner(opts: {
  db: AppDatabase;
  clock: Clock;
  ids: IdGen;
  events: EventBus;
  pipelines: readonly Pipeline[];
  handlers: Readonly<Record<string, StepHandler>>;
  cpuCores?: number | undefined;
}): JobRunner {
  const limits = defaultLimits(opts.cpuCores ?? 4);
  const inflight = new Map<string, AbortController>();

  function persist(job: Job): void {
    saveJob(opts.db, job);
  }

  function completeJob(job: Job, status: Job['status'], error: string | null): void {
    job.status = status;
    job.finishedAt = opts.clock.nowIso();
    job.error = error;
    job.progress = status === 'succeeded' ? 1 : stepProgress(job.steps);
    persist(job);
    opts.events.publish({
      type: status === 'succeeded' ? 'job.completed' : 'job.failed',
      jobId: job.id,
      jobType: job.type,
      ...(error === null ? { result: job.result } : { error }),
    });
  }

  return {
    enqueue(type, payload) {
      const pipeline = findPipeline(opts.pipelines, type);
      const now = opts.clock.nowIso();
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
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      };
      insertJob(opts.db, job);
      return job;
    },
    list: (query) => listJobs(opts.db, query),
    get: (id) => getJob(opts.db, id),
    cancel(id) {
      const job = getJob(opts.db, id);
      inflight.get(id)?.abort();
      for (const step of job.steps) {
        if (step.status === 'queued' || step.status === 'running') {
          step.status = 'cancelled';
        }
      }
      completeJob(job, 'cancelled', null);
    },
    retry(id) {
      const job = getJob(opts.db, id);
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
      persist(job);
      return { jobId: job.id };
    },
    async tick() {
      const open = incompleteJobs(opts.db);
      const runningResources = countRunning(
        open.flatMap((job) => job.steps.filter((step) => step.status === 'running').map((step) => step.resource)),
      );
      for (const job of open) {
        const step = runnableStep(job, limits, runningResources);
        if (!step) continue;
        const handler = opts.handlers[`${job.type}.${step.name}`] ?? opts.handlers[step.name];
        if (!handler) {
          step.status = 'failed';
          step.error = `no handler for ${job.type}.${step.name}`;
          completeJob(job, 'failed', step.error);
          continue;
        }
        if (job.startedAt === null) {
          job.startedAt = opts.clock.nowIso();
          job.status = 'running';
        }
        step.status = 'running';
        runningResources[step.resource] += 1;
        persist(job);
        const controller = new AbortController();
        inflight.set(job.id, controller);
        try {
          const result = await handler({ job, step, signal: controller.signal });
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
          if (job.steps.every((item) => item.status === 'succeeded')) {
            completeJob(job, 'succeeded', null);
          } else {
            persist(job);
          }
        } catch (error) {
          step.status = 'failed';
          step.error = error instanceof Error ? error.message : String(error);
          completeJob(job, 'failed', step.error);
        } finally {
          inflight.delete(job.id);
        }
        return;
      }
    },
  };
}
