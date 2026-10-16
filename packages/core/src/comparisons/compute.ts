import type { ComparisonOptions, ComparisonSide, MoveComparison } from '@climbing-coach/api';
import {
  CHANNEL_COUNT,
  DIVERGENCE_CHANNELS,
  alignAttempts,
  comparePostures,
  compareSideOf,
  openEndSide,
  preprocess,
  trackSamples,
  type AlignResult,
  type ComparisonResult,
  type MoveSegment,
  type PoseSample,
  type StationaryPeriod,
} from '@climbing-coach/engine';
import { readPosebin, warpTimeUs, type ComparisonBin } from '@climbing-coach/schema';

import type { ComparisonResultJson } from '../db/repos/comparisons.js';

export type LoadedSide = {
  side: ComparisonSide;
  samples: PoseSample[];
  moves: MoveSegment[];
  contacts: StationaryPeriod[];
};

/** Columns of the stored divergence rows: signed deltas, then the divergence score. */
export const RESULT_CHANNELS: readonly string[] = [...DIVERGENCE_CHANNELS, 'score'];

function climbOf(side: ComparisonSide): { startUs: number; endUs: number } {
  return { startUs: side.climbStartUs, endUs: side.climbEndUs };
}

/** Climb-range samples (gap-filled, smoothed), moves (stored or segmented), and limb contacts. */
export function loadSide(
  side: ComparisonSide,
  posebin: Uint8Array,
  storedMoves: readonly MoveSegment[],
): LoadedSide {
  const climb = climbOf(side);
  const samples = preprocess(trackSamples(readPosebin(posebin), climb)).image;
  return { side, ...compareSideOf(samples, climb, storedMoves), samples };
}

export function alignSides(a: LoadedSide, b: LoadedSide, options: ComparisonOptions): AlignResult {
  return alignAttempts(a.samples, b.samples, {
    collapseRests: options.collapseRests,
    openEnd: openEndSide(a.side.outcome, b.side.outcome),
  });
}

export function compareSides(
  a: LoadedSide,
  b: LoadedSide,
  alignment: AlignResult,
): ComparisonResult {
  return comparePostures(a, b, alignment);
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

/** Index warp → clip-time warp; deltas plus score per row. */
export function resultBin(
  a: Pick<LoadedSide, 'samples'>,
  b: Pick<LoadedSide, 'samples'>,
  result: Pick<ComparisonResult, 'warp' | 'deltas' | 'score'>,
): ComparisonBin {
  const steps = result.score.length;
  const warpUs = new Int32Array(steps * 2);
  const width = CHANNEL_COUNT + 1;
  const divergence = new Float32Array(steps * width);
  for (let step = 0; step < steps; step += 1) {
    warpUs[step * 2] = warpTimeUs(a.samples[result.warp[step * 2] ?? -1]?.tUs ?? Number.NaN);
    warpUs[step * 2 + 1] = warpTimeUs(
      b.samples[result.warp[step * 2 + 1] ?? -1]?.tUs ?? Number.NaN,
    );
    divergence.set(
      result.deltas.subarray(step * CHANNEL_COUNT, (step + 1) * CHANNEL_COUNT),
      step * width,
    );
    divergence[step * width + CHANNEL_COUNT] = result.score[step] ?? Number.NaN;
  }
  return { warpUs, divergence, channels: width };
}

export function resultJson(a: LoadedSide, result: ComparisonResult): ComparisonResultJson {
  const moveById = new Map(a.moves.map((move) => [move.index, move]));
  const perMove: MoveComparison[] = result.perMove.map((move) => ({
    moveIndexA: move.moveIndexA,
    startUs: moveById.get(move.moveIndexA)?.startUs ?? 0,
    endUs: moveById.get(move.moveIndexA)?.endUs ?? 0,
    steps: move.steps,
    meanScore: finiteOrNull(move.meanScore),
    meanDeltas: move.meanDeltas.map(finiteOrNull),
    differences: move.differences.map((difference) => ({ ...difference })),
  }));
  return {
    steps: result.score.length,
    channels: [...RESULT_CHANNELS],
    moveMatches: result.moveMatches,
    perMove,
    summary: {
      meanDivergence: finiteOrNull(result.summary.meanDivergence),
      topDifferences: result.summary.topDifferences.map((difference) => ({ ...difference })),
    },
  };
}
