import { detectAttempts, trackSamples, type AttemptDetection } from '@climbing-coach/engine';
import type { PoseTrack } from '@climbing-coach/schema';

/**
 * Attempt detector on the stored detection track.
 * One Euro smoothing (preprocess) lags the short hip-still start the detector
 * was tuned on, so proposals read the track before that filter. Move segmentation
 * still preprocesses later.
 */
export function detectFromPoseTrack(track: PoseTrack): AttemptDetection[] {
  const samples = trackSamples(track);
  if (samples.length === 0) return [];
  return detectAttempts(samples).attempts;
}
