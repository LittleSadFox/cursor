import type { BlazePoseLandmark } from '@climbing-coach/schema';

import { jointAngle } from '../features/angles.js';
import { landmark, midHip, midpoint, torsoLength } from '../pose/access.js';
import type { PoseSample, XyzV } from '../pose/types.js';
import { COMPARE_JOINTS, JOINT_TRIPLETS } from './channels.js';

const RAD_TO_DEG = 180 / Math.PI;

/** The 8 compared joint angles in degrees, in `COMPARE_JOINTS` order. NaN when a point is missing. */
export function jointAnglesDeg(sample: PoseSample): Float64Array {
  const out = new Float64Array(COMPARE_JOINTS.length);
  COMPARE_JOINTS.forEach((joint, index) => {
    const { from, pivot, to } = JOINT_TRIPLETS[joint];
    out[index] =
      jointAngle(landmark(sample, from), landmark(sample, pivot), landmark(sample, to)) *
      RAD_TO_DEG;
  });
  return out;
}

/** Distance from mid-hip to the wrist centroid, in torso lengths. */
export function hipToHands(sample: PoseSample): number {
  const hands = midpoint(landmark(sample, 'leftWrist'), landmark(sample, 'rightWrist'));
  const hip = midHip(sample);
  return Math.hypot(hip.x - hands.x, hip.y - hands.y) / Math.max(torsoLength(sample), 1e-6);
}

type Segment = { from: BlazePoseLandmark; to: BlazePoseLandmark; mass: number };

/**
 * Simplified Dempster segment masses (fractions of body mass, sum 1). Each segment's
 * center sits at the midpoint of its end points. The head uses the nose alone.
 */
const SEGMENTS: readonly Segment[] = [
  { from: 'nose', to: 'nose', mass: 0.081 },
  { from: 'leftShoulder', to: 'leftHip', mass: 0.2485 },
  { from: 'rightShoulder', to: 'rightHip', mass: 0.2485 },
  { from: 'leftShoulder', to: 'leftElbow', mass: 0.028 },
  { from: 'rightShoulder', to: 'rightElbow', mass: 0.028 },
  { from: 'leftElbow', to: 'leftWrist', mass: 0.022 },
  { from: 'rightElbow', to: 'rightWrist', mass: 0.022 },
  { from: 'leftHip', to: 'leftKnee', mass: 0.1 },
  { from: 'rightHip', to: 'rightKnee', mass: 0.1 },
  { from: 'leftKnee', to: 'leftAnkle', mass: 0.061 },
  { from: 'rightKnee', to: 'rightAnkle', mass: 0.061 },
];

/** Segment-weighted center of mass in the sample's coordinates. */
export function centerOfMass(sample: PoseSample): XyzV {
  let x = 0;
  let y = 0;
  let visibility = 1;
  for (const segment of SEGMENTS) {
    const center = midpoint(landmark(sample, segment.from), landmark(sample, segment.to));
    x += center.x * segment.mass;
    y += center.y * segment.mass;
    visibility = Math.min(visibility, center.visibility);
  }
  return { x, y, z: 0, visibility };
}
