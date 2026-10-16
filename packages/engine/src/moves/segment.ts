import type { BlazePoseLandmark } from '@climbing-coach/schema';

import type { ClimbRange } from '../eval/ranges.js';
import { landmark, torsoLength } from '../pose/access.js';
import type { PoseSample } from '../pose/types.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';

export const MOVE_LIMBS = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as const;
export type MoveLimb = (typeof MOVE_LIMBS)[number];

export type StationaryPeriod = {
  limb: MoveLimb;
  startUs: number;
  endUs: number;
  x: number;
  y: number;
};

export type MoveSegment = {
  index: number;
  limb: MoveLimb;
  startUs: number;
  endUs: number;
};

type MoveParams = StartingParams['moves'];

function inRange(tUs: number, range: ClimbRange): boolean {
  return tUs >= range.startUs && tUs < range.endUs;
}

export function stationaryPeriods(
  samples: readonly PoseSample[],
  limb: MoveLimb,
  range: ClimbRange,
  params: MoveParams = STARTING_PARAMS.moves,
): StationaryPeriod[] {
  const inside = samples.filter((sample) => inRange(sample.tUs, range));
  const periods: StationaryPeriod[] = [];
  const close = (first: number, last: number): void => {
    const run = inside.slice(first, last + 1);
    const duration = (run[run.length - 1]?.tUs ?? 0) - (run[0]?.tUs ?? 0);
    if (duration >= params.stationaryMinUs) periods.push(periodFrom(run, limb));
  };
  // A run is frames joined by slow steps. It starts on the frame the limb arrived at.
  // A missing (NaN) position makes the step not slow, so it splits the run.
  let runStart = 0;
  for (let index = 1; index < inside.length; index += 1) {
    if (limbSpeed(inside, index, limb) < params.stationaryLimbTorsoPerSec) continue;
    close(runStart, index - 1);
    runStart = index;
  }
  if (inside.length > 0) close(runStart, inside.length - 1);
  return periods;
}

function periodFrom(run: readonly PoseSample[], limb: MoveLimb): StationaryPeriod {
  let x = 0;
  let y = 0;
  for (const sample of run) {
    const point = landmark(sample, limb as BlazePoseLandmark);
    x += point.x;
    y += point.y;
  }
  const first = run[0];
  const last = run[run.length - 1];
  return {
    limb,
    startUs: first?.tUs ?? 0,
    endUs: last?.tUs ?? 0,
    x: x / run.length,
    y: y / run.length,
  };
}

function limbSpeed(samples: readonly PoseSample[], index: number, limb: MoveLimb): number {
  const current = samples[index];
  const previous = samples[index - 1];
  if (!current || !previous) return Number.NaN;
  const dt = (current.tUs - previous.tUs) / 1_000_000;
  if (dt <= 0) return Number.NaN;
  const torso = Math.max(torsoLength(current), 1e-6);
  const a = landmark(current, limb as BlazePoseLandmark);
  const b = landmark(previous, limb as BlazePoseLandmark);
  return Math.hypot(a.x - b.x, a.y - b.y) / dt / torso;
}

export function segmentMoves(
  samples: readonly PoseSample[],
  range: ClimbRange,
  params: MoveParams = STARTING_PARAMS.moves,
): MoveSegment[] {
  const reference = samples.find((sample) => inRange(sample.tUs, range));
  if (!reference) return [];
  const torso = Math.max(torsoLength(reference), 1e-6);
  const moves: Omit<MoveSegment, 'index'>[] = [];
  for (const limb of MOVE_LIMBS) {
    const periods = stationaryPeriods(samples, limb, range, params);
    for (let i = 1; i < periods.length; i += 1) {
      const from = periods[i - 1];
      const to = periods[i];
      if (!from || !to) continue;
      const separation = Math.hypot(to.x - from.x, to.y - from.y) / torso;
      if (separation < params.holdSeparationTorso) continue;
      moves.push({ limb, startUs: from.endUs, endUs: to.startUs });
    }
  }
  moves.sort((a, b) => a.startUs - b.startUs || a.limb.localeCompare(b.limb));
  return moves.map((move, index) => ({ ...move, index }));
}

/** Move active at the fall, or the latest move that started at or before it. */
export function fallMoveIndex(moves: readonly MoveSegment[], fallUs: number): number | null {
  let latest: number | null = null;
  for (const move of moves) {
    if (move.startUs <= fallUs && fallUs <= move.endUs) return move.index;
    if (move.startUs <= fallUs) latest = move.index;
  }
  return latest;
}
