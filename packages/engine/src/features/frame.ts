import type { ClimbRange } from '../eval/ranges.js';
import { at } from '../math.js';
import { landmark, midHip, torsoLength } from '../pose/access.js';
import type { PoseSample, XyzV } from '../pose/types.js';
import { jointAngle, trunkInclination } from './angles.js';
import { FEATURE_NAMES } from './spec.js';

export type FrameFeatures = {
  tUs: number;
  values: number[];
};

function velocity(
  current: XyzV,
  previous: XyzV | undefined,
  dtSec: number,
  torso: number,
): [number, number] {
  if (!previous || dtSec <= 0 || torso <= 1e-6) return [0, 0];
  return [(current.x - previous.x) / dtSec / torso, (current.y - previous.y) / dtSec / torso];
}

/** One row of `FEATURE_SPEC` for a display-space or normalized sample. */
export function frameFeatureRow(
  sample: PoseSample,
  previous: PoseSample | undefined,
): FrameFeatures {
  const torso = Math.max(torsoLength(sample), 1e-6);
  const dt = previous ? (sample.tUs - previous.tUs) / 1_000_000 : 0;
  const hip = midHip(sample);
  const leftShoulder = landmark(sample, 'leftShoulder');
  const rightShoulder = landmark(sample, 'rightShoulder');
  const midShoulder = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: 0,
    visibility: Math.min(leftShoulder.visibility, rightShoulder.visibility),
  };
  const leftWrist = landmark(sample, 'leftWrist');
  const rightWrist = landmark(sample, 'rightWrist');
  const handX = (leftWrist.x + rightWrist.x) / 2;
  const handY = (leftWrist.y + rightWrist.y) / 2;
  const prevHip = previous ? midHip(previous) : undefined;
  const [hipVx, hipVy] = velocity(hip, prevHip, dt, torso);
  const [lwVx, lwVy] = velocity(leftWrist, previous && landmark(previous, 'leftWrist'), dt, torso);
  const [rwVx, rwVy] = velocity(
    rightWrist,
    previous && landmark(previous, 'rightWrist'),
    dt,
    torso,
  );
  const leftAnkle = landmark(sample, 'leftAnkle');
  const rightAnkle = landmark(sample, 'rightAnkle');
  const [laVx, laVy] = velocity(leftAnkle, previous && landmark(previous, 'leftAnkle'), dt, torso);
  const [raVx, raVy] = velocity(
    rightAnkle,
    previous && landmark(previous, 'rightAnkle'),
    dt,
    torso,
  );
  const values = [
    jointAngle(landmark(sample, 'leftShoulder'), landmark(sample, 'leftElbow'), leftWrist),
    jointAngle(landmark(sample, 'rightShoulder'), landmark(sample, 'rightElbow'), rightWrist),
    jointAngle(landmark(sample, 'leftElbow'), leftShoulder, landmark(sample, 'leftHip')),
    jointAngle(landmark(sample, 'rightElbow'), rightShoulder, landmark(sample, 'rightHip')),
    jointAngle(
      landmark(sample, 'leftShoulder'),
      landmark(sample, 'leftHip'),
      landmark(sample, 'leftKnee'),
    ),
    jointAngle(
      landmark(sample, 'rightShoulder'),
      landmark(sample, 'rightHip'),
      landmark(sample, 'rightKnee'),
    ),
    jointAngle(landmark(sample, 'leftHip'), landmark(sample, 'leftKnee'), leftAnkle),
    jointAngle(landmark(sample, 'rightHip'), landmark(sample, 'rightKnee'), rightAnkle),
    trunkInclination(hip, midShoulder),
    (hip.x - handX) / torso,
    (hip.y - handY) / torso,
    lwVx,
    lwVy,
    rwVx,
    rwVy,
    laVx,
    laVy,
    raVx,
    raVy,
    hipVx,
    hipVy,
  ];
  if (values.length !== FEATURE_NAMES.length) {
    throw new Error(`feature width ${values.length} != spec ${FEATURE_NAMES.length}`);
  }
  return { tUs: sample.tUs, values };
}

export function frameFeatures(samples: readonly PoseSample[]): FrameFeatures[] {
  return samples.map((sample, index) =>
    frameFeatureRow(sample, index > 0 ? samples[index - 1] : undefined),
  );
}

function meanRows(rows: readonly FrameFeatures[]): number[] {
  if (rows.length === 0) return FEATURE_NAMES.map(() => 0);
  const width = at(rows, 0).values.length;
  const sums = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    row.values.forEach((value, index) => {
      sums[index] = (sums[index] ?? 0) + value;
    });
  }
  return sums.map((sum) => sum / rows.length);
}

export function attemptFeatures(rows: readonly FrameFeatures[], range: ClimbRange): number[] {
  return meanRows(rows.filter((row) => row.tUs >= range.startUs && row.tUs < range.endUs));
}

export function moveFeatures(rows: readonly FrameFeatures[], range: ClimbRange): number[] {
  return attemptFeatures(rows, range);
}
