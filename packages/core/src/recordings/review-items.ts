import type { ReviewItem } from '@climbing-coach/api';
import { clipRangeOf } from '@climbing-coach/engine';
import { AttemptOutcomeSchema } from '@climbing-coach/schema';

import type { ReviewItemRow } from '../db/repos/review.js';

const STATUSES = ['draft', 'committed', 'rejected'] as const;

function statusOf(value: string): ReviewItem['status'] | null {
  return STATUSES.find((status) => status === value) ?? null;
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
  const clip = clipRangeOf(
    {
      id: row.id,
      climb,
      outcome: outcome.data,
      touched: row.touched,
      rejected: status === 'rejected',
      source: 'detector',
      parentIds: [row.id],
    },
    { preUs: row.prePadUs, postUs: row.postPadUs },
    { startUs: 0, endUs: durationUs > 0 ? durationUs : climb.endUs + row.postPadUs },
  );
  return {
    id: row.id,
    videoId: row.videoId,
    outcome: outcome.data,
    climbStartUs: climb.startUs,
    climbEndUs: climb.endUs,
    clipStartUs: clip.startUs,
    clipEndUs: clip.endUs,
    confidence: row.confidence,
    status,
  };
}
