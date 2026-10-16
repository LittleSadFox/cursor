import { STARTING_PARAMS } from '../params.js';
import { fillGaps } from './gaps.js';
import { filterTrack } from './filter-track.js';
import { normalize } from './normalize.js';
import type { OneEuroParams } from './one-euro.js';
import type { PoseSample } from './types.js';

export type PreprocessParams = {
  minVisibility: number;
  maxGapFrames: number;
  oneEuro: OneEuroParams;
};

/**
 * Gap-fill then smooth in display space.
 * `normalized` is the comparison view (mid-hip origin, torso scale).
 */
export function preprocess(
  samples: readonly PoseSample[],
  params: PreprocessParams = STARTING_PARAMS.pose,
): { image: PoseSample[]; normalized: PoseSample[] } {
  const filled = fillGaps(samples, params);
  const image = filterTrack(filled, params.oneEuro);
  return { image, normalized: image.map(normalize) };
}
