import { LANDMARK_COUNT } from '@climbing-coach/schema';

import { at } from '../math.js';
import type { OneEuroParams } from './one-euro.js';
import { oneEuroFilter } from './one-euro.js';
import type { PoseSample, XyzV } from './types.js';

/** One Euro filter on x, y, and z of every landmark. Visibility is unchanged. */
export function filterTrack(samples: readonly PoseSample[], params: OneEuroParams): PoseSample[] {
  if (samples.length === 0) return [];
  const tUs = samples.map((sample) => sample.tUs);
  const filtered: XyzV[][] = samples.map((sample) =>
    sample.landmarks.map((point) => ({ ...point })),
  );
  for (let landmarkIndex = 0; landmarkIndex < LANDMARK_COUNT; landmarkIndex += 1) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const series = samples.map((sample) => at(sample.landmarks, landmarkIndex)[axis]);
      const smoothed = oneEuroFilter(tUs, series, params);
      for (let frame = 0; frame < smoothed.length; frame += 1) {
        const value = smoothed[frame];
        const point = at(at(filtered, frame), landmarkIndex);
        if (value !== undefined) point[axis] = value;
      }
    }
  }
  return samples.map((sample, index) => ({
    tUs: sample.tUs,
    landmarks: at(filtered, index),
  }));
}
