import type { Job, JobStatus } from '@climbing-coach/api';

import { getJob } from '../db/repos/jobs.js';
import type { AppDatabase } from '../ports/sql.js';

export function jobOf(db: AppDatabase, id: string | null): Job | null {
  if (!id) return null;
  try {
    return getJob(db, id);
  } catch {
    return null;
  }
}

/** Queued or running: processing may still change this recording. */
export function jobActive(status: JobStatus | null | undefined): boolean {
  return status === 'queued' || status === 'running';
}
