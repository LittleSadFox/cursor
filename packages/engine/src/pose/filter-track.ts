import { LANDMARK_COUNT } from '@climbing-coach/schema';

import type { OneEuroParams } from './one-euro.js';
import { oneEuroInto } from './one-euro.js';
import type { PoseSample, XyzV } from './types.js';

const AXES = ['x', 'y', 'z'] as const;

/** One Euro filter on x, y, and z of every landmark. Visibility is unchanged. */
export function filterTrack(samples: readonly PoseSample[], params: OneEuroParams): PoseSample[] {
  const frames = samples.length;
  if (frames === 0) return [];
  const tUs = Float64Array.from(samples, (sample) => sample.tUs);
  const filtered: XyzV[][] = samples.map((sample) =>
    sample.landmarks.map((point) => ({ ...point })),
  );
  const series = new Float64Array(frames);
  const smoothed = new Float64Array(frames);
  for (let landmarkIndex = 0; landmarkIndex < LANDMARK_COUNT; landmarkIndex += 1) {
    for (const axis of AXES) {
      for (let frame = 0; frame < frames; frame += 1) {
        series[frame] = filtered[frame]?.[landmarkIndex]?.[axis] ?? Number.NaN;
      }
      oneEuroInto(smoothed, tUs, series, params);
      for (let frame = 0; frame < frames; frame += 1) {
        const point = filtered[frame]?.[landmarkIndex];
        if (point) point[axis] = smoothed[frame] ?? Number.NaN;
      }
    }
  }
  return samples.map((sample, index) => ({
    tUs: sample.tUs,
    landmarks: filtered[index] ?? [],
  }));
}
