import { ProblemError, type ComparisonOptions } from '@climbing-coach/api';
import { ENGINE_VERSION, PARAMS_VERSION } from '@climbing-coach/engine';
import { sha256Hex } from '@climbing-coach/schema';

import type { ComparisonKey } from '../db/repos/comparisons.js';

/** Stable hash of the options plus the parameter table they run with. */
export function optionsHash(options: ComparisonOptions): string {
  const canonical = JSON.stringify({
    collapseRests: options.collapseRests,
    spatialMode: options.spatialMode,
    params: PARAMS_VERSION,
  });
  return sha256Hex(canonical).slice(0, 16);
}

/** Wall-space alignment needs a homography from video frames (PLAN 2.7 stretch, ffmpeg). */
export function assertSupportedOptions(options: ComparisonOptions): void {
  if (options.spatialMode === 'wall') {
    throw new ProblemError(
      'NOT_IMPLEMENTED',
      'wall-space comparison needs frame decoding (ADR-002); use spatialMode "body"',
    );
  }
}

export function comparisonKey(
  attemptAId: string,
  attemptBId: string,
  poseModel: string,
  options: ComparisonOptions,
): ComparisonKey {
  return {
    attemptAId,
    attemptBId,
    poseModel,
    engineVersion: ENGINE_VERSION,
    optionsHash: optionsHash(options),
  };
}
