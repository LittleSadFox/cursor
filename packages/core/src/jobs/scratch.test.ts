import { describe, expect, it } from 'vitest';

import { createEventBus } from '../ports/events.js';
import { jobScratch } from './scratch.js';

const JOB = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

describe('jobScratch', () => {
  it('keeps one state per job until that job ends, including a cancel between steps', () => {
    const events = createEventBus(() => 0);
    const scratch = jobScratch(events, 'compare', () => ({ steps: 0 }));
    scratch.of(JOB).steps += 1;
    scratch.of(JOB).steps += 1;
    scratch.of(OTHER);
    expect(scratch.of(JOB).steps).toBe(2);
    expect(scratch.size()).toBe(2);

    events.publish({
      type: 'job.progress',
      jobId: JOB,
      jobType: 'compare',
      step: 'align',
      progress: 0.5,
    });
    events.publish({ type: 'job.failed', jobId: JOB, jobType: 'backup-db', error: 'x' });
    expect(scratch.size()).toBe(2);

    // `cancel` publishes `job.failed` without an error once no step is running.
    events.publish({ type: 'job.failed', jobId: JOB, jobType: 'compare' });
    events.publish({ type: 'job.completed', jobId: OTHER, jobType: 'compare' });
    expect(scratch.size()).toBe(0);
    expect(scratch.of(JOB).steps).toBe(0);
  });
});
