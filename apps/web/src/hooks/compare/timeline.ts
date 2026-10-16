/**
 * Comparison playback timeline (BUILD_PLAN §3.7 "Comparison playback controller").
 *
 * Movement-synced mode walks the warp path. Each step lasts as long as the side that moves
 * more in it, so that side plays at 1× and the other slows down or holds on its frame (a
 * collapsed rest). Real-time mode plays both climbs from their starts at 1×.
 */
export type Timeline = {
  /** Timeline position of each warp step, µs from 0. */
  u: Float64Array;
  /** Clip time of A and B at each step, µs. */
  a: Float64Array;
  b: Float64Array;
  durationUs: number;
};

export type SyncMode = 'synced' | 'realtime';

export type Positions = {
  tA: number;
  tB: number;
  /** Local playback rates (0 = hold on the current frame). */
  rateA: number;
  rateB: number;
  /** Warp step shown at this position (-1 when unknown). */
  step: number;
};

export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

export function buildTimeline(warpUs: Int32Array): Timeline {
  const steps = Math.floor(warpUs.length / 2);
  const u = new Float64Array(steps);
  const a = new Float64Array(steps);
  const b = new Float64Array(steps);
  for (let i = 0; i < steps; i += 1) {
    a[i] = warpUs[i * 2] ?? 0;
    b[i] = warpUs[i * 2 + 1] ?? 0;
    if (i === 0) continue;
    const da = Math.max(0, (a[i] ?? 0) - (a[i - 1] ?? 0));
    const db = Math.max(0, (b[i] ?? 0) - (b[i - 1] ?? 0));
    u[i] = (u[i - 1] ?? 0) + Math.max(da, db);
  }
  return { u, a, b, durationUs: steps > 0 ? (u[steps - 1] ?? 0) : 0 };
}

/** Last step whose position is ≤ `position` (binary search). */
export function stepAt(timeline: Timeline, position: number): number {
  const { u } = timeline;
  if (u.length === 0) return -1;
  let lo = 0;
  let hi = u.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((u[mid] ?? 0) <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A rate below `MIN_RATE` holds the frame; above `MAX_RATE` it is capped. */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < MIN_RATE) return 0;
  return Math.min(MAX_RATE, rate);
}

export function syncedPositions(timeline: Timeline, position: number): Positions {
  const step = stepAt(timeline, position);
  if (step < 0) return { tA: 0, tB: 0, rateA: 0, rateB: 0, step };
  const next = Math.min(step + 1, timeline.u.length - 1);
  const u0 = timeline.u[step] ?? 0;
  const span = (timeline.u[next] ?? u0) - u0;
  const f = span > 0 ? Math.min(1, Math.max(0, (position - u0) / span)) : 0;
  const a0 = timeline.a[step] ?? 0;
  const b0 = timeline.b[step] ?? 0;
  const da = (timeline.a[next] ?? a0) - a0;
  const db = (timeline.b[next] ?? b0) - b0;
  return {
    tA: a0 + f * da,
    tB: b0 + f * db,
    rateA: span > 0 ? clampRate(da / span) : 0,
    rateB: span > 0 ? clampRate(db / span) : 0,
    step,
  };
}

export type ClimbRange = { startUs: number; endUs: number };

/** Both climbs from their starts at 1×; a finished climb holds on its last frame. */
export function realTimePositions(a: ClimbRange, b: ClimbRange, position: number): Positions {
  const tA = Math.min(a.endUs, a.startUs + position);
  const tB = Math.min(b.endUs, b.startUs + position);
  return {
    tA,
    tB,
    rateA: tA < a.endUs ? 1 : 0,
    rateB: tB < b.endUs ? 1 : 0,
    step: -1,
  };
}

export function realTimeDuration(a: ClimbRange, b: ClimbRange): number {
  return Math.max(a.endUs - a.startUs, b.endUs - b.startUs);
}

/** Warp step whose A time is closest to `tA`; the first such step when A holds. */
export function stepForA(timeline: Timeline, tA: number): number {
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  timeline.a.forEach((value, index) => {
    const gap = Math.abs(value - tA);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

/** Movement-synced position of the step closest to A's time `tA` (to resume after a mode switch). */
export function positionForA(timeline: Timeline, tA: number): number {
  return timeline.u[stepForA(timeline, tA)] ?? 0;
}

/** Playback position that shows warp step `step` in the given mode. */
export function positionForStep(
  timeline: Timeline,
  step: number,
  mode: SyncMode,
  climbA: ClimbRange,
): number {
  if (mode === 'synced') return timeline.u[step] ?? 0;
  return Math.max(0, (timeline.a[step] ?? climbA.startUs) - climbA.startUs);
}

/** Timeline position of every warp step in the given mode. */
export function stepPositions(timeline: Timeline, mode: SyncMode, climbA: ClimbRange): number[] {
  return Array.from(timeline.u, (_, step) => positionForStep(timeline, step, mode, climbA));
}

export function positionsAt(
  timeline: Timeline,
  mode: SyncMode,
  climbs: { a: ClimbRange; b: ClimbRange },
  position: number,
): Positions {
  if (mode === 'synced') return syncedPositions(timeline, position);
  const positions = realTimePositions(climbs.a, climbs.b, position);
  return { ...positions, step: stepForA(timeline, positions.tA) };
}

export function durationOf(
  timeline: Timeline,
  mode: SyncMode,
  climbs: { a: ClimbRange; b: ClimbRange },
): number {
  return mode === 'synced' ? timeline.durationUs : realTimeDuration(climbs.a, climbs.b);
}
