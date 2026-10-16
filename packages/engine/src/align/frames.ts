import { FEATURE_NAMES } from '../features/spec.js';
import { frameFeatures } from '../features/frame.js';
import type { PoseSample } from '../pose/types.js';
import type { AlignFrame } from './align.js';

const SPEED_PAIRS = [
  ['velLeftWristX', 'velLeftWristY'],
  ['velRightWristX', 'velRightWristY'],
  ['velLeftAnkleX', 'velLeftAnkleY'],
  ['velRightAnkleX', 'velRightAnkleY'],
  ['velHipX', 'velHipY'],
] as const;

const SPEED_COLUMNS = SPEED_PAIRS.map(
  ([x, y]) => [FEATURE_NAMES.indexOf(x), FEATURE_NAMES.indexOf(y)] as const,
);

function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/**
 * DTW input from a pose track: `FEATURE_SPEC` rows, with the fastest limb (or hip) as the
 * rest speed. Missing values become 0 so one gap does not poison the cost matrix.
 */
export function alignFrames(samples: readonly PoseSample[]): AlignFrame[] {
  return frameFeatures(samples).map((row) => {
    const values = row.values.map(finite);
    let speed = 0;
    for (const [x, y] of SPEED_COLUMNS) {
      speed = Math.max(speed, Math.hypot(finite(values[x]), finite(values[y])));
    }
    return { tUs: row.tUs, values, speed };
  });
}
