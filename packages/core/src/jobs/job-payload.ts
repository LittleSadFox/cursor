import type { Job } from '@climbing-coach/api';

export function videoIdOf(job: Job): string {
  const id = (job.payload as { videoId?: unknown }).videoId;
  if (typeof id !== 'string' || id === '') throw new Error('job missing videoId');
  return id;
}
