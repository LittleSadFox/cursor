import type { AlignResult } from '../align/align.js';
import { matchMoves } from '../align/nw.js';
import type { MoveSegment, StationaryPeriod } from '../moves/segment.js';
import type { PoseSample } from '../pose/types.js';
import { STARTING_PARAMS } from '../params.js';
import {
  divergenceSeries,
  postureRows,
  warpIndices,
  type CompareParams,
  type PostureRows,
} from './divergence.js';
import {
  meanFinite,
  summarizeByMove,
  topDifferences,
  type ComparisonSummary,
  type MoveSummary,
} from './summary.js';
import { contactsAt } from './support.js';

export type CompareSide = {
  samples: readonly PoseSample[];
  moves: readonly MoveSegment[];
  /** Limb stationary periods; when present they define the support polygon per frame. */
  contacts?: readonly StationaryPeriod[];
};

export type MoveMatch = { a: number; b: number | null; cost?: number };

export type ComparisonResult = {
  /** Int32 frame-index pairs `[L × 2]` into A's and B's samples. */
  warp: Int32Array;
  /** Signed deltas A − B, `[L × CHANNEL_COUNT]`. */
  deltas: Float32Array;
  /** One divergence score per warp step. */
  score: Float32Array;
  moveMatches: MoveMatch[];
  perMove: MoveSummary[];
  summary: ComparisonSummary;
};

function rowsFor(side: CompareSide): PostureRows {
  const periods = side.contacts;
  return postureRows(side.samples, periods ? (tUs) => contactsAt(tUs, periods) : undefined);
}

/** Move pairs from Needleman–Wunsch; `cost` is A's mean divergence over that move. */
export function moveMatchesOf(
  movesA: readonly MoveSegment[],
  movesB: readonly MoveSegment[],
  perMove: readonly MoveSummary[],
): MoveMatch[] {
  const pairs = new Map(matchMoves(movesA, movesB).map((pair) => [pair.aIndex, pair.bIndex]));
  return movesA.map((move, position) => {
    const bPosition = pairs.get(position);
    const b = bPosition === undefined ? undefined : movesB[bPosition];
    if (!b) return { a: move.index, b: null };
    const cost = perMove[position]?.meanScore ?? Number.NaN;
    return Number.isFinite(cost)
      ? { a: move.index, b: b.index, cost }
      : { a: move.index, b: b.index };
  });
}

/** Posture comparison along an alignment (PLAN 2.8, BUILD_PLAN `comparePostures`). */
export function comparePostures(
  a: CompareSide,
  b: CompareSide,
  alignment: AlignResult,
  params: CompareParams = STARTING_PARAMS.compare,
): ComparisonResult {
  const rowsA = rowsFor(a);
  const rowsB = rowsFor(b);
  const warp = warpIndices(alignment.path, rowsA.tUs, rowsB.tUs);
  const series = divergenceSeries(rowsA, rowsB, warp, params);
  const perMove = summarizeByMove(series, warp, rowsA.tUs, a.moves);
  return {
    warp,
    deltas: series.deltas,
    score: series.score,
    moveMatches: moveMatchesOf(a.moves, b.moves, perMove),
    perMove,
    summary: {
      meanDivergence: meanFinite(series.score),
      topDifferences: topDifferences(perMove, params),
    },
  };
}
