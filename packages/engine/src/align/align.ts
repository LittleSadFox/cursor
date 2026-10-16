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

function zscore(rows: number[][]): number[][] {
  if (rows.length === 0) return [];
  const width = rows[0]?.length ?? 0;
  const mean = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) + (row[col] ?? 0);
  }
  for (let col = 0; col < width; col += 1) mean[col] = (mean[col] ?? 0) / rows.length;
  const variance = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) {
      const delta = (row[col] ?? 0) - (mean[col] ?? 0);
      variance[col] = (variance[col] ?? 0) + delta * delta;
    }
  }
  const scale = variance.map((value) => {
    const std = Math.sqrt(value / Math.max(1, rows.length));
    return std > 1e-8 ? std : 1;
  });
  return rows.map((row) => row.map((value, col) => (value - (mean[col] ?? 0)) / (scale[col] ?? 1)));
}

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
  const reduced = reducePair(
    a.map((frame) => frame.values),
    b.map((frame) => frame.values),
    components,
  );
  const za = zscore(reduced.left);
  const zb = zscore(reduced.right);
  const openEnd = options.openEnd ?? a.length <= b.length;
  const dtw = openEnd && a.length !== b.length ? openEndDtw(za, zb, band) : bandedDtw(za, zb, band);
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
