import type { ClimbRange } from '../eval/ranges.js';
import {
  MOVE_LIMBS,
  segmentMoves,
  stationaryPeriods,
  type MoveSegment,
  type StationaryPeriod,
} from '../moves/segment.js';
import type { PoseSample } from '../pose/types.js';
import type { CompareSide } from './compare.js';

export type BuiltSide = CompareSide & {
  moves: MoveSegment[];
  contacts: StationaryPeriod[];
};

/**
 * One attempt's comparison input over its climb: the stored moves (segmented here when there
 * are none yet) and every limb's stationary periods as support contacts.
 */
export function compareSideOf(
  samples: readonly PoseSample[],
  climb: ClimbRange,
  storedMoves: readonly MoveSegment[] = [],
): BuiltSide {
  const moves = storedMoves.length > 0 ? [...storedMoves] : segmentMoves(samples, climb);
  const contacts = MOVE_LIMBS.flatMap((limb) => stationaryPeriods(samples, limb, climb));
  return { samples, moves, contacts };
}
