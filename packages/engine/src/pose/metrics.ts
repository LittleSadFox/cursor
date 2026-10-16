import { median } from '../math.js';
import { coreVisible, distance2d, landmark, midHip, midShoulder, torsoLength } from './access.js';
import type { PoseSample } from './types.js';

export type BodyMetrics = {
  midHipX: number;
  midHipY: number;
  midShoulderX: number;
  midShoulderY: number;
  torsoLength: number;
  /** Vertical shoulder-to-lower-ankle span in display pixels (y-down). */
  standingSpan: number;
  lowerAnkleY: number;
};

export function bodyMetrics(sample: PoseSample): BodyMetrics {
  const hip = midHip(sample);
  const shoulder = midShoulder(sample);
  const leftAnkle = landmark(sample, 'leftAnkle');
  const rightAnkle = landmark(sample, 'rightAnkle');
  const lowerAnkleY = Math.max(leftAnkle.y, rightAnkle.y);
  return {
    midHipX: hip.x,
    midHipY: hip.y,
    midShoulderX: shoulder.x,
    midShoulderY: shoulder.y,
    torsoLength: distance2d(shoulder, hip),
    standingSpan: lowerAnkleY - shoulder.y,
    lowerAnkleY,
  };
}

/** Stable body height from in-frame torsos × `torsoToBodyHeight`. */
export function estimateBodyHeight(
  samples: readonly PoseSample[],
  minVisibility: number,
  torsoToBodyHeight: number,
): number {
  const torsos: number[] = [];
  for (const sample of samples) {
    if (!coreVisible(sample, minVisibility)) continue;
    const torso = torsoLength(sample);
    if (torso > 1e-4) torsos.push(torso);
  }
  const mid = median(torsos);
  return mid > 0 ? mid * torsoToBodyHeight : 1;
}
