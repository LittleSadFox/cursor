import type { AlignResult } from '../align/align.js';
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
import { warpMoveMatches, type MoveMatch } from './matches.js';
import {
  meanFinite,
  moveDifferences,
  summarizeByMove,
  topDifferences,
  type ComparisonSummary,
  type Difference,
  type MoveSummary,
} from './summary.js';
import { contactsAt } from './support.js';

export type CompareSide = {
  samples: readonly PoseSample[];
  moves: readonly MoveSegment[];
  /** Limb stationary periods; when present they define the support polygon per frame. */
  contacts?: readonly StationaryPeriod[];
};

export type { MoveMatch };

export type MoveResult = MoveSummary & { differences: Difference[] };

export type ComparisonResult = {
  /** Int32 frame-index pairs `[L × 2]` into A's and B's samples. */
  warp: Int32Array;
  /** Signed deltas A − B, `[L × CHANNEL_COUNT]`. */
  deltas: Float32Array;
  /** One divergence score per warp step. */
  score: Float32Array;
  moveMatches: MoveMatch[];
  perMove: MoveResult[];
  summary: ComparisonSummary;
};

function rowsFor(side: CompareSide): PostureRows {
  const periods = side.contacts;
  return postureRows(side.samples, periods ? (tUs) => contactsAt(tUs, periods) : undefined);
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
  const indexed = { indices: warp, tUsA: rowsA.tUs, tUsB: rowsB.tUs };
  return {
    warp,
    deltas: series.deltas,
    score: series.score,
    moveMatches: warpMoveMatches(a.moves, b.moves, indexed, perMove),
    perMove: perMove.map((move) => ({ ...move, differences: moveDifferences(move, params) })),
    summary: {
      meanDivergence: meanFinite(series.score),
      topDifferences: topDifferences(perMove, params),
    },
  };
}
