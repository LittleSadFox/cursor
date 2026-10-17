import type { HealthResponse, ReviewProcessing } from '@climbing-coach/api';

export type ReprocessGate = 'ready' | 'busy' | 'ffmpeg-missing' | 'pose-missing';

/** "Process whole recording" needs ffmpeg to decode and the pose runtime to run, and no job in flight. */
export function reprocessGate(
  health: Pick<HealthResponse, 'ffmpeg' | 'pose'> | undefined,
  processing: ReviewProcessing,
): ReprocessGate {
  if (!processing.complete) return 'busy';
  if (health?.ffmpeg.available !== true) return 'ffmpeg-missing';
  if (health.pose.available !== true) return 'pose-missing';
  return 'ready';
}

export type ReviewNotice = 'review.processing' | 'review.noProposals' | null;

/** Status line above the timeline. */
export function reviewNotice(processing: ReviewProcessing, liveCount: number): ReviewNotice {
  if (!processing.complete) return 'review.processing';
  return liveCount === 0 ? 'review.noProposals' : null;
}
