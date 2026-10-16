import { BLAZEPOSE_LANDMARKS, type BlazePoseLandmark } from '@climbing-coach/schema';

import type { PosePoint } from '../hooks/compare/pose.js';

import type { PoseStyle } from './skeleton.js';

/** Test helper: a 33-point pose with only `placed` landmarks visible. */
export function pointsOf(
  placed: Partial<Record<BlazePoseLandmark, [number, number]>>,
): PosePoint[] {
  return BLAZEPOSE_LANDMARKS.map((name) => {
    const at = placed[name];
    return at
      ? { x: at[0], y: at[1], visibility: 1 }
      : { x: Number.NaN, y: Number.NaN, visibility: 0 };
  });
}

export const STYLE: PoseStyle = {
  color: '#fff',
  highlightColor: '#f00',
  alpha: 1,
  lineWidth: 3,
  jointRadius: 2,
  highlights: new Set(),
};
