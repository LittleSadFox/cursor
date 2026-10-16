import { LANDMARK_COUNT, LANDMARK_STRIDE, type PoseTrack } from '@climbing-coach/schema';

import type { ClimbRange } from '../eval/ranges.js';
import type { PoseSample, XyzV } from './types.js';

/**
 * Samples of one person track (default: the selected one), optionally limited to
 * `[range.startUs, range.endUs)`. Frames before that person's first frame are skipped.
 */
export function trackSamples(
  track: PoseTrack,
  range?: ClimbRange,
  trackId: string = track.header.selectedTrackId,
): PoseSample[] {
  const buffer = track.landmarksByTrack.get(trackId);
  const ref = track.header.tracks.find((item) => item.trackId === trackId);
  if (!buffer || !ref) throw new Error(`pose track has no person track ${trackId}`);
  const samples: PoseSample[] = [];
  for (let frame = ref.firstFrame; frame <= ref.lastFrame; frame += 1) {
    const tUs = track.tUs[frame] ?? Number.NaN;
    if (range && (tUs < range.startUs || tUs >= range.endUs)) continue;
    const landmarks: XyzV[] = [];
    for (let point = 0; point < LANDMARK_COUNT; point += 1) {
      const offset = (frame * LANDMARK_COUNT + point) * LANDMARK_STRIDE;
      landmarks.push({
        x: buffer[offset] ?? Number.NaN,
        y: buffer[offset + 1] ?? Number.NaN,
        z: buffer[offset + 2] ?? Number.NaN,
        visibility: buffer[offset + 3] ?? Number.NaN,
      });
    }
    samples.push({ tUs, landmarks });
  }
  return samples;
}
