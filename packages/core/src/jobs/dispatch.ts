import type { Job, JobStatus, JobStep, ResourceClass } from '@climbing-coach/api';

import { hasCapacity, type ResourceLimits } from './resources.js';

export function isTerminal(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export function busyNonIdle(running: Readonly<Record<ResourceClass, number>>): boolean {
  return running.pose + running.ffmpeg + running.compute > 0;
}

/** First queued step whose dependencies succeeded and whose resource class has room. */
export function nextRunnableStep(
  job: Job,
  limits: ResourceLimits,
  running: Readonly<Record<ResourceClass, number>>,
): JobStep | null {
  if (isTerminal(job.status)) return null;
  for (const step of job.steps) {
    if (step.status !== 'queued') continue;
    const depsOk = step.dependsOn.every((name) =>
      job.steps.some((other) => other.name === name && other.status === 'succeeded'),
    );
    if (!depsOk) continue;
    if (!hasCapacity(limits, running, step.resource, busyNonIdle(running))) continue;
    return step;
  }
  return null;
}

/** After a crash, steps persisted as `running` have no worker; put them back in the queue. */
export function requeueOrphanedSteps(job: Job): boolean {
  let changed = false;
  for (const step of job.steps) {
    if (step.status === 'running') {
      step.status = 'queued';
      changed = true;
    }
  }
  if (changed && job.status === 'running' && job.steps.every((step) => step.status === 'queued')) {
    job.status = 'queued';
  }
  return changed;
}
