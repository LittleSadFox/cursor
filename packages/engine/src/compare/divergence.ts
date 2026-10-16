import type { MoveLimb } from '../moves/segment.js';
import type { PoseSample } from '../pose/types.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';
import {
  CHANNEL_COUNT,
  COMPARE_JOINTS,
  DIVERGENCE_CHANNELS,
  channelMetric,
  type CompareJoint,
} from './channels.js';
import { hipToHands, jointAnglesDeg } from './posture.js';
import { comSupportOffset } from './support.js';

export type CompareParams = StartingParams['compare'];

/** Posture rows for one track: `rows` is `[N × CHANNEL_COUNT]`, row-major. */
export type PostureRows = {
  tUs: Float64Array;
  rows: Float64Array;
};

/** Signed deltas (A − B) `[L × CHANNEL_COUNT]` and one divergence score per warp step. */
export type DivergenceSeries = {
  deltas: Float32Array;
  score: Float32Array;
};

/** One row in `DIVERGENCE_CHANNELS` order: 8 angles (deg), hip-to-hands, COM support dx. */
export function postureRow(sample: PoseSample, contacts?: readonly MoveLimb[]): Float64Array {
  const row = new Float64Array(CHANNEL_COUNT);
  row.set(jointAnglesDeg(sample), 0);
  row[COMPARE_JOINTS.length] = hipToHands(sample);
  row[COMPARE_JOINTS.length + 1] = comSupportOffset(sample, contacts).dx;
  return row;
}

export function postureRows(
  samples: readonly PoseSample[],
  contactsAt?: (tUs: number) => readonly MoveLimb[],
): PostureRows {
  const tUs = new Float64Array(samples.length);
  const rows = new Float64Array(samples.length * CHANNEL_COUNT);
  samples.forEach((sample, index) => {
    tUs[index] = sample.tUs;
    rows.set(postureRow(sample, contactsAt?.(sample.tUs)), index * CHANNEL_COUNT);
  });
  return { tUs, rows };
}

/** Joint-angle deltas A − B in degrees, `COMPARE_JOINTS` order. */
export function jointAngleDeltas(a: PoseSample, b: PoseSample): Float64Array {
  const left = jointAnglesDeg(a);
  const right = jointAnglesDeg(b);
  return left.map((value, index) => value - (right[index] ?? Number.NaN));
}

/** Index of the timestamp closest to `t` in ascending `tUs`. Empty input returns -1. */
export function nearestIndex(tUs: Float64Array, t: number): number {
  if (tUs.length === 0) return -1;
  let lo = 0;
  let hi = tUs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((tUs[mid] ?? 0) < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs((tUs[lo - 1] ?? 0) - t) <= Math.abs((tUs[lo] ?? 0) - t)) return lo - 1;
  return lo;
}

/** Warp path as Int32 frame-index pairs `[L × 2]` into the original tracks. */
export function warpIndices(
  path: readonly { tUsA: number; tUsB: number }[],
  tUsA: Float64Array,
  tUsB: Float64Array,
): Int32Array {
  const warp = new Int32Array(path.length * 2);
  path.forEach((step, index) => {
    warp[index * 2] = nearestIndex(tUsA, step.tUsA);
    warp[index * 2 + 1] = nearestIndex(tUsB, step.tUsB);
  });
  return warp;
}

export function channelScale(
  index: number,
  params: CompareParams = STARTING_PARAMS.compare,
): number {
  const channel = DIVERGENCE_CHANNELS[index];
  if (channel === undefined) return 1;
  return channelMetric(channel) === 'angleDeg' ? params.angleScaleDeg : params.torsoScale;
}

/** Mean of |delta| / scale over finite channels. NaN when no channel is finite. */
export function divergenceScore(
  deltas: ArrayLike<number>,
  offset = 0,
  params: CompareParams = STARTING_PARAMS.compare,
): number {
  let sum = 0;
  let count = 0;
  for (let channel = 0; channel < CHANNEL_COUNT; channel += 1) {
    const value = deltas[offset + channel] ?? Number.NaN;
    if (!Number.isFinite(value)) continue;
    sum += Math.abs(value) / channelScale(channel, params);
    count += 1;
  }
  return count === 0 ? Number.NaN : sum / count;
}

export function divergenceSeries(
  a: PostureRows,
  b: PostureRows,
  warp: Int32Array,
  params: CompareParams = STARTING_PARAMS.compare,
): DivergenceSeries {
  const steps = warp.length / 2;
  const deltas = new Float32Array(steps * CHANNEL_COUNT);
  const score = new Float32Array(steps);
  for (let step = 0; step < steps; step += 1) {
    const rowA = (warp[step * 2] ?? 0) * CHANNEL_COUNT;
    const rowB = (warp[step * 2 + 1] ?? 0) * CHANNEL_COUNT;
    for (let channel = 0; channel < CHANNEL_COUNT; channel += 1) {
      deltas[step * CHANNEL_COUNT + channel] =
        (a.rows[rowA + channel] ?? Number.NaN) - (b.rows[rowB + channel] ?? Number.NaN);
    }
    score[step] = divergenceScore(deltas, step * CHANNEL_COUNT, params);
  }
  return { deltas, score };
}

/** Joints whose angle delta on warp step `step` reaches the highlight score. */
export function highlightedJoints(
  deltas: Float32Array,
  step: number,
  params: CompareParams = STARTING_PARAMS.compare,
): CompareJoint[] {
  return COMPARE_JOINTS.filter((_, index) => {
    const value = deltas[step * CHANNEL_COUNT + index] ?? Number.NaN;
    return Math.abs(value) / params.angleScaleDeg >= params.highlightScore;
  });
}
