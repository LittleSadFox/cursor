import { describe, expect, it } from 'vitest';

import type { ReviewItemRow } from '../db/repos/review.js';
import { toReviewItem } from './items.js';

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function row(extra: Partial<ReviewItemRow> = {}): ReviewItemRow {
  return {
    id: ID,
    videoId: ID,
    origin: 'detector',
    parentIds: [ID],
    outcome: 'top',
    climbStartUs: 1_000_000,
    climbEndUs: 5_000_000,
    prePadUs: 2_000_000,
    postPadUs: 1_500_000,
    confidence: null,
    status: 'draft',
    touched: false,
    ...extra,
  };
}

describe('toReviewItem', () => {
  it('pads the clip range and clamps it to the recording', () => {
    const item = toReviewItem(row(), 6_000_000);
    expect(item?.clip).toEqual({ startUs: 0, endUs: 6_000_000 });
    expect(item?.climb).toEqual({ startUs: 1_000_000, endUs: 5_000_000 });
    expect(item?.padding).toEqual({ preUs: 2_000_000, postUs: 1_500_000 });
    expect(item?.outcome).toBe('top');
    expect(item?.parentIds).toEqual([ID]);
  });

  it('lets the padding run past the climb when the duration is unknown', () => {
    expect(toReviewItem(row(), 0)?.clip.endUs).toBe(6_500_000);
  });

  it('maps a manual row and drops rows with an unknown outcome or status', () => {
    expect(toReviewItem(row({ origin: 'manual', parentIds: [] }), 6_000_000)?.origin).toBe(
      'manual',
    );
    expect(toReviewItem(row({ outcome: 'flash' }), 6_000_000)).toBeNull();
    expect(toReviewItem(row({ status: 'archived' }), 6_000_000)).toBeNull();
  });
});
