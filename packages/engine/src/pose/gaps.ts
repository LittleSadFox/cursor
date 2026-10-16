import { LANDMARK_COUNT } from '@climbing-coach/schema';

import { at } from '../math.js';
import type { PoseSample, XyzV } from './types.js';

export type GapFillParams = {
  minVisibility: number;
  maxGapFrames: number;
};

function lerpPoint(left: XyzV, right: XyzV, t: number): XyzV {
  return {
    x: left.x + (right.x - left.x) * t,
    y: left.y + (right.y - left.y) * t,
    z: left.z + (right.z - left.z) * t,
    visibility: Math.min(left.visibility, right.visibility),
  };
}

function clone(sample: PoseSample): { tUs: number; landmarks: XyzV[] } {
  return {
    tUs: sample.tUs,
    landmarks: sample.landmarks.map((point) => ({ ...point })),
  };
}

/**
 * Linearly fill landmark gaps no longer than `maxGapFrames`.
 * Longer gaps and gaps at either end stay low-visibility.
 */
export function fillGaps(samples: readonly PoseSample[], params: GapFillParams): PoseSample[] {
  const frames = samples.map(clone);
  for (let landmarkIndex = 0; landmarkIndex < LANDMARK_COUNT; landmarkIndex += 1) {
    let index = 0;
    while (index < frames.length) {
      const current = at(frames, index);
      const point = at(current.landmarks, landmarkIndex);
      if (point.visibility >= params.minVisibility) {
        index += 1;
        continue;
      }
      const gapStart = index;
      while (index < frames.length) {
        const next = at(at(frames, index).landmarks, landmarkIndex);
        if (next.visibility >= params.minVisibility) break;
        index += 1;
      }
      const gapEnd = index;
      const gapLength = gapEnd - gapStart;
      const leftIndex = gapStart - 1;
      const rightIndex = gapEnd;
      if (
        gapLength > 0 &&
        gapLength <= params.maxGapFrames &&
        leftIndex >= 0 &&
        rightIndex < frames.length
      ) {
        const left = at(at(frames, leftIndex).landmarks, landmarkIndex);
        const right = at(at(frames, rightIndex).landmarks, landmarkIndex);
        for (let gap = 0; gap < gapLength; gap += 1) {
          const t = (gap + 1) / (gapLength + 1);
          at(frames, gapStart + gap).landmarks[landmarkIndex] = lerpPoint(left, right, t);
        }
      }
    }
  }
  return frames;
}
