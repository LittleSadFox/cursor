import { STARTING_PARAMS } from '../params.js';
import { bandedDtw, openEndDtw, type DtwStep } from './dtw.js';
import { reducePair } from './pca.js';
import { collapseRests } from './rest.js';

export type AlignFrame = {
  tUs: number;
  values: readonly number[];
  /** Speed in torso lengths/s, used only to collapse rests. */
  speed: number;
};

export type AlignOptions = {
  /** `left` ended early (a fall): align all of it to a prefix of `right`. Default false. */
  openEnd?: boolean;
  bandFraction?: number;
  pcaComponents?: number;
  restSpeed?: number;
  restMinUs?: number;
  restKeepFrames?: number;
};

export type AlignResult = {
  path: { indexA: number; indexB: number; tUsA: number; tUsB: number }[];
  cost: number;
};

/**
 * Z-score each column with statistics pooled over both attempts, so a shared offset
 * stays visible and a prefix is scaled the same way as the full attempt.
 */
export function zscorePair(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
): { left: number[][]; right: number[][] } {
  const rows = [...left, ...right];
  const width = rows[0]?.length ?? 0;
  const mean = new Float64Array(width);
  const variance = new Float64Array(width);
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) + (row[col] ?? 0);
  }
  for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) / Math.max(1, rows.length);
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) {
      const delta = (row[col] ?? 0) - (mean[col] ?? 0);
      variance[col] = (variance[col] ?? 0) + delta * delta;
    }
  }
  const scale = Array.from(variance, (value) => {
    const std = Math.sqrt(value / Math.max(1, rows.length));
    return std > 1e-8 ? std : 1;
  });
  const apply = (row: readonly number[]): number[] =>
    Array.from(
      { length: width },
      (_, col) => ((row[col] ?? 0) - (mean[col] ?? 0)) / (scale[col] ?? 1),
    );
  return { left: left.map(apply), right: right.map(apply) };
}

/** Rest collapse, pooled z-score, shared PCA basis, then banded (or open-end) DTW. */
export function align(
  left: readonly AlignFrame[],
  right: readonly AlignFrame[],
  options: AlignOptions = {},
): AlignResult {
  const rest = {
    maxSpeed: options.restSpeed ?? STARTING_PARAMS.align.restSpeedTorsoPerSec,
    minDurationUs: options.restMinUs ?? STARTING_PARAMS.align.restMinUs,
    keep: options.restKeepFrames ?? STARTING_PARAMS.align.restKeepFrames,
  };
  const a = collapseRests(left, rest);
  const b = collapseRests(right, rest);
  const band = options.bandFraction ?? STARTING_PARAMS.align.dtwBandFraction;
  const components = options.pcaComponents ?? STARTING_PARAMS.align.pcaComponents;
  const scaled = zscorePair(
    a.map((frame) => frame.values),
    b.map((frame) => frame.values),
  );
  const reduced = reducePair(scaled.left, scaled.right, components);
  const dtw = options.openEnd
    ? openEndDtw(reduced.left, reduced.right, band)
    : bandedDtw(reduced.left, reduced.right, band);
  return {
    cost: dtw.cost,
    path: dtw.path.map((step: DtwStep) => ({
      indexA: step.indexA,
      indexB: step.indexB,
      tUsA: a[step.indexA]?.tUs ?? 0,
      tUsB: b[step.indexB]?.tUs ?? 0,
    })),
  };
}
