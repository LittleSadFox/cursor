import type { ReviewItem } from '@climbing-coach/api';

import { DEFAULT_PADDING, type DraftRow } from './draft.js';

export const A = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
export const B = '01ARZ3NDEKTSV4RRFFQ69G5FA2';
export const C = '01ARZ3NDEKTSV4RRFFQ69G5FA3';
export const DURATION_US = 60_000_000;

export function detector(
  id: string,
  startUs: number,
  endUs: number,
  extra: Partial<DraftRow> = {},
) {
  return {
    id,
    origin: 'detector',
    parentIds: [id],
    climb: { startUs, endUs },
    padding: DEFAULT_PADDING,
    outcome: 'unknown',
    touched: false,
    status: 'draft',
    ...extra,
  } satisfies DraftRow;
}

export function serverItem(row: DraftRow, extra: Partial<ReviewItem> = {}): ReviewItem {
  return {
    ...row,
    parentIds: [...row.parentIds],
    clip: row.climb,
    confidence: null,
    ...extra,
  };
}

/** Deterministic temporary ids for split / merge / add. */
export function ids(): () => string {
  let next = 0;
  return () => `new-${(next += 1).toString(36)}`;
}
