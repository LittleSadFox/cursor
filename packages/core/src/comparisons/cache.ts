import type { ComparisonSide } from '@climbing-coach/api';

import type { ComparisonRecord } from '../db/repos/comparisons.js';

const SIDE_FIELDS = [
  'attemptId',
  'clipVideoId',
  'poseTrackId',
  'climbStartUs',
  'climbEndUs',
  'outcome',
] as const satisfies readonly (keyof ComparisonSide)[];

/** Same inputs on both sides: pose track, climb range, and outcome (it picks open-end DTW). */
export function sameSides(
  stored: Partial<ComparisonRecord['sides']>,
  current: ComparisonRecord['sides'],
): boolean {
  return (['a', 'b'] as const).every((key) => {
    const side = stored[key];
    return side !== undefined && SIDE_FIELDS.every((field) => side[field] === current[key][field]);
  });
}

/** A failed row, or a pending one with no job (e.g. a row from before migration 0002). */
export function needsRequeue(record: ComparisonRecord): boolean {
  return record.status === 'failed' || (record.status === 'pending' && record.jobId === null);
}
