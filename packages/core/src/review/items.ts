import type { ReviewItem } from '@climbing-coach/api';
import { clipRangeOf } from '@climbing-coach/engine';
import { AttemptOutcomeSchema } from '@climbing-coach/schema';

import type { ReviewItemRow } from '../db/repos/review.js';

const STATUSES = ['draft', 'committed', 'rejected'] as const;

function statusOf(value: string): ReviewItem['status'] | null {
  return STATUSES.find((status) => status === value) ?? null;
}

/** Recording range used to clamp clips; an unknown duration lets the padding run past the climb. */
function videoRange(row: ReviewItemRow, durationUs: number): { startUs: number; endUs: number } {
  return { startUs: 0, endUs: durationUs > 0 ? durationUs : row.climbEndUs + row.postPadUs };
}

/**
 * API view of a stored review row. The clip range is the climb plus its padding, clamped
 * to the recording (engine `clipRangeOf`). Rows with an unknown outcome or status are dropped.
 */
export function toReviewItem(row: ReviewItemRow, durationUs: number): ReviewItem | null {
  const outcome = AttemptOutcomeSchema.safeParse(row.outcome);
  const status = statusOf(row.status);
  if (!outcome.success || !status) return null;
  const climb = { startUs: row.climbStartUs, endUs: row.climbEndUs };
  const padding = { preUs: row.prePadUs, postUs: row.postPadUs };
  const clip = clipRangeOf(
    {
      id: row.id,
      climb,
      outcome: outcome.data,
      touched: row.touched,
      rejected: status === 'rejected',
      source: 'detector',
      parentIds: row.parentIds,
    },
    padding,
    videoRange(row, durationUs),
  );
  return {
    id: row.id,
    origin: row.origin === 'manual' ? 'manual' : 'detector',
    parentIds: row.parentIds,
    climb,
    padding,
    clip,
    outcome: outcome.data,
    confidence: row.confidence,
    touched: row.touched,
    status,
    boulderId: row.boulderId,
    proximity: row.proximity,
    exertion: row.exertion,
    tags: row.tags,
  };
}
