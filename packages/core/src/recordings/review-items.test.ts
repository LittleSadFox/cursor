import { describe, expect, it } from 'vitest';

import type { ReviewItemRow } from '../db/repos/review.js';
import { toReviewItem } from './review-items.js';

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function row(extra: Partial<ReviewItemRow> = {}): ReviewItemRow {
  return {
    id: ID,
    videoId: ID,
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
    expect(item?.clipStartUs).toBe(0);
    expect(item?.clipEndUs).toBe(6_000_000);
    expect(item?.outcome).toBe('top');
  });

  it('drops rows with an unknown outcome or status', () => {
    expect(toReviewItem(row({ outcome: 'flash' }), 6_000_000)).toBeNull();
    expect(toReviewItem(row({ status: 'archived' }), 6_000_000)).toBeNull();
  });
});
