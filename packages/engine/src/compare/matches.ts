import type { MoveSegment } from '../moves/segment.js';
import type { MoveSummary } from './summary.js';

export type MoveMatch = { a: number; b: number | null; cost?: number };

export type Span = { startUs: number; endUs: number };

/** B's clip-time span that the warp maps a move of A onto, or null when no step falls in it. */
export function mappedSpanB(
  warp: Int32Array,
  tUsA: Float64Array,
  tUsB: Float64Array,
  move: Span,
): Span | null {
  let startUs = Number.POSITIVE_INFINITY;
  let endUs = Number.NEGATIVE_INFINITY;
  for (let step = 0; step < warp.length / 2; step += 1) {
    const tA = tUsA[warp[step * 2] ?? -1] ?? Number.NaN;
    if (!(tA >= move.startUs && tA < move.endUs)) continue;
    const tB = tUsB[warp[step * 2 + 1] ?? -1] ?? Number.NaN;
    if (!Number.isFinite(tB)) continue;
    startUs = Math.min(startUs, tB);
    endUs = Math.max(endUs, tB);
  }
  return startUs <= endUs ? { startUs, endUs } : null;
}

/** Overlap of a move with a mapped span; a single-instant span counts when it lies inside. */
function overlapUs(move: Span, span: Span): number {
  const overlap = Math.min(move.endUs, span.endUs) - Math.max(move.startUs, span.startUs);
  if (overlap > 0) return overlap;
  return span.startUs >= move.startUs && span.startUs < move.endUs ? 0 : Number.NEGATIVE_INFINITY;
}

/** The same-limb move of B that overlaps `span` most, or null. */
export function counterpartOf(
  limb: MoveSegment['limb'],
  span: Span,
  movesB: readonly MoveSegment[],
): MoveSegment | null {
  let best: MoveSegment | null = null;
  let bestOverlap = Number.NEGATIVE_INFINITY;
  for (const move of movesB) {
    if (move.limb !== limb) continue;
    const overlap = overlapUs(move, span);
    if (overlap > bestOverlap) {
      best = move;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * Move pairs read off the warp path, so they agree with the synced playback: each move of A
 * pairs with the same-limb move of B it is aligned onto. A move the warp never reaches (the
 * remainder after an open-ended fall) or that lands on no such move has no counterpart.
 * `cost` is A's mean divergence over the move.
 */
export function warpMoveMatches(
  movesA: readonly MoveSegment[],
  movesB: readonly MoveSegment[],
  warp: { indices: Int32Array; tUsA: Float64Array; tUsB: Float64Array },
  perMove: readonly MoveSummary[],
): MoveMatch[] {
  return movesA.map((move, position) => {
    const span = mappedSpanB(warp.indices, warp.tUsA, warp.tUsB, move);
    const b = span ? counterpartOf(move.limb, span, movesB) : null;
    if (!b) return { a: move.index, b: null };
    const cost = perMove[position]?.meanScore ?? Number.NaN;
    return Number.isFinite(cost)
      ? { a: move.index, b: b.index, cost }
      : { a: move.index, b: b.index };
  });
}
