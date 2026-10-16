import {
  BLAZEPOSE_LANDMARKS,
  LANDMARK_COUNT,
  type BlazePoseLandmark,
} from '@climbing-coach/schema';

import { at } from '../math.js';
import type { PoseSample, XyzV } from './types.js';

export const LANDMARK_INDEX: Record<BlazePoseLandmark, number> = Object.fromEntries(
  BLAZEPOSE_LANDMARKS.map((name, index) => [name, index]),
) as Record<BlazePoseLandmark, number>;

export function landmark(sample: PoseSample, name: BlazePoseLandmark): XyzV {
  return at(sample.landmarks, LANDMARK_INDEX[name]);
}

export function midpoint(a: XyzV, b: XyzV): XyzV {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

export function midHip(sample: PoseSample): XyzV {
  return midpoint(landmark(sample, 'leftHip'), landmark(sample, 'rightHip'));
}

export function midShoulder(sample: PoseSample): XyzV {
  return midpoint(landmark(sample, 'leftShoulder'), landmark(sample, 'rightShoulder'));
}

export function distance2d(a: XyzV, b: XyzV): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function torsoLength(sample: PoseSample): number {
  return distance2d(midShoulder(sample), midHip(sample));
}

export function assertLandmarkCount(sample: PoseSample): void {
  if (sample.landmarks.length !== LANDMARK_COUNT) {
    throw new Error(`expected ${LANDMARK_COUNT} landmarks, got ${sample.landmarks.length}`);
  }
}

export function coreVisible(sample: PoseSample, minVisibility: number): boolean {
  const names = [
    'leftShoulder',
    'rightShoulder',
    'leftHip',
    'rightHip',
    'leftAnkle',
    'rightAnkle',
    'leftWrist',
    'rightWrist',
  ] as const;
  return names.every((name) => landmark(sample, name).visibility >= minVisibility);
}
