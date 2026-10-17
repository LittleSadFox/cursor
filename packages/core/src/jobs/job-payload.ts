import type { Job } from '@climbing-coach/api';

export function videoIdOf(job: Job): string {
  const id = (job.payload as { videoId?: unknown }).videoId;
  if (typeof id !== 'string' || id === '') throw new Error('job missing videoId');
  return id;
}

/** `reprocess-recording` scope; import jobs carry none. */
export function reprocessScopeOf(job: Job): 'active' | 'full' | null {
  const scope = (job.payload as { scope?: unknown }).scope;
  return scope === 'active' || scope === 'full' ? scope : null;
}
