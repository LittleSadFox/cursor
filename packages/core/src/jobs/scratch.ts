import type { EventBus } from '../ports/events.js';

export type JobScratch<T> = {
  /** The job's state, created empty on first use. */
  of(jobId: string): T;
  drop(jobId: string): void;
  size(): number;
};

/**
 * In-memory state shared by the steps of one job. It is dropped when the job reaches a terminal
 * state, including a cancel between steps, when no handler runs to clean up after itself.
 */
export function jobScratch<T>(
  events: Pick<EventBus, 'subscribe'>,
  jobType: string,
  empty: () => T,
): JobScratch<T> {
  const states = new Map<string, T>();
  events.subscribe((event) => {
    if (
      (event.type === 'job.completed' || event.type === 'job.failed') &&
      event.jobType === jobType
    ) {
      states.delete(event.jobId);
    }
  });
  return {
    of(jobId) {
      let state = states.get(jobId);
      if (state === undefined) {
        state = empty();
        states.set(jobId, state);
      }
      return state;
    },
    drop: (jobId) => {
      states.delete(jobId);
    },
    size: () => states.size,
  };
}
