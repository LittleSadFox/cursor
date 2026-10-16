import type { ComparisonDifference, MoveComparison, MoveMatch } from '@climbing-coach/api';

import {
  positionForStep,
  stepForA,
  type ClimbRange,
  type SyncMode,
  type Timeline,
} from './timeline.js';

export type MoveView = {
  moveIndexA: number;
  moveIndexB: number | null;
  startUs: number;
  endUs: number;
  meanScore: number | null;
  differences: ComparisonDifference[];
};

/** Per-move rows for the difference panel, in A's move order. */
export function moveViews(
  perMove: readonly MoveComparison[],
  matches: readonly MoveMatch[],
): MoveView[] {
  const matchOf = new Map(matches.map((match) => [match.a, match.b]));
  return perMove.map((move) => ({
    moveIndexA: move.moveIndexA,
    moveIndexB: matchOf.get(move.moveIndexA) ?? null,
    startUs: move.startUs,
    endUs: move.endUs,
    meanScore: move.meanScore,
    differences: move.differences,
  }));
}

export type MoveSpan = { move: MoveView; from: number; to: number };

/** Timeline span of each move of A in the given mode. */
export function moveSpans(
  moves: readonly MoveView[],
  timeline: Timeline,
  mode: SyncMode,
  climbA: ClimbRange,
): MoveSpan[] {
  const at = (tA: number) => positionForStep(timeline, stepForA(timeline, tA), mode, climbA);
  return moves.map((move) => ({ move, from: at(move.startUs), to: at(move.endUs) }));
}

/** The move of A being played at `tA`, or null between moves. */
export function moveAt(moves: readonly MoveView[], tA: number): MoveView | null {
  return moves.find((move) => tA >= move.startUs && tA < move.endUs) ?? null;
}
