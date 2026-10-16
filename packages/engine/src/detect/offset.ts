import type { ClimbRange } from '../eval/ranges.js';
import { clamp, median } from '../math.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';

/**
 * Per-user boundary shift. Needs at least 20 deltas and 70% the same sign.
 * Result is the median of that sign, clamped to ±1 s. Zeros do not vote.
 */
export function boundaryOffsetUs(
  deltasUs: readonly number[],
  params: StartingParams['detect'] = STARTING_PARAMS.detect,
): number {
  if (deltasUs.length < params.boundaryOffsetMinLabels) return 0;
  const positive = deltasUs.filter((delta) => delta > 0);
  const negative = deltasUs.filter((delta) => delta < 0);
  const majority = Math.max(positive.length, negative.length) / deltasUs.length;
  if (majority < params.boundaryOffsetSameSignFraction) return 0;
  const chosen = positive.length >= negative.length ? positive : negative;
  const shift = median(chosen);
  return clamp(shift, -params.boundaryOffsetBoundUs, params.boundaryOffsetBoundUs);
}

export function applyBoundaryOffset(
  range: ClimbRange,
  offsetUs: number,
  boundUs: number = STARTING_PARAMS.detect.boundaryOffsetBoundUs,
): ClimbRange {
  const applied = clamp(offsetUs, -boundUs, boundUs);
  const startUs = Math.max(0, range.startUs + applied);
  const endUs = Math.max(startUs, range.endUs + applied);
  return { startUs, endUs };
}
