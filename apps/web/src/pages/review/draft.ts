import type {
  ReviewItem,
  ReviewItemInput,
  ReviewOrigin,
  ReviewPadding,
  ReviewRange,
  ReviewStatus,
} from '@climbing-coach/api';
import {
  STARTING_PARAMS,
  clipRangeOf,
  type DraftItem,
  type DraftSource,
} from '@climbing-coach/engine';
import type { AttemptOutcome } from '@climbing-coach/schema';

/** One review item as the editor holds it. `id` may be a temporary `new-*` id until saved. */
export type DraftRow = {
  id: string;
  origin: ReviewOrigin;
  parentIds: readonly string[];
  climb: ReviewRange;
  padding: ReviewPadding;
  outcome: AttemptOutcome;
  touched: boolean;
  status: ReviewStatus;
};

export const DEFAULT_PADDING: ReviewPadding = {
  preUs: STARTING_PARAMS.padding.preUs,
  postUs: STARTING_PARAMS.padding.postUs,
};

export function fromServer(item: ReviewItem): DraftRow {
  return {
    id: item.id,
    origin: item.origin,
    parentIds: item.parentIds,
    climb: item.climb,
    padding: item.padding,
    outcome: item.outcome,
    touched: item.touched,
    status: item.status,
  };
}

export function sortRows(rows: readonly DraftRow[]): DraftRow[] {
  return [...rows].sort((a, b) => a.climb.startUs - b.climb.startUs || a.id.localeCompare(b.id));
}

/** Rejected rows stay in the draft (so undo and labels work) but no longer hold a range. */
export function isLive(row: DraftRow): boolean {
  return row.status !== 'rejected';
}

export function isEditable(row: DraftRow): boolean {
  return row.status !== 'committed';
}

/** Autosave body. Committed rows never change, so they are not sent. */
export function toSaveItems(rows: readonly DraftRow[]): ReviewItemInput[] {
  return rows.filter(isEditable).map((row) => ({
    id: row.id,
    origin: row.origin,
    parentIds: [...row.parentIds],
    climb: row.climb,
    outcome: row.outcome,
    touched: row.touched,
    status: row.status === 'rejected' ? 'rejected' : 'draft',
  }));
}

/** Engine source, inferred from lineage: a detector row lists only itself. */
export function sourceOf(row: DraftRow): DraftSource {
  if (row.parentIds.length === 0) return 'manual';
  if (row.parentIds.length === 1 && row.parentIds[0] === row.id) return 'detector';
  return row.parentIds.length > 1 ? 'merge' : 'split';
}

export function toDraftItem(row: DraftRow): DraftItem {
  return {
    id: row.id,
    climb: row.climb,
    outcome: row.outcome,
    touched: row.touched,
    rejected: row.status === 'rejected',
    source: sourceOf(row),
    parentIds: row.parentIds,
  };
}

/** Engine result back into a row; padding comes from the row it replaced. */
export function fromDraftItem(item: DraftItem, padding: ReviewPadding): DraftRow {
  return {
    id: item.id,
    origin: item.parentIds.length === 0 ? 'manual' : 'detector',
    parentIds: item.parentIds,
    climb: item.climb,
    padding,
    outcome: item.outcome,
    touched: item.touched,
    status: item.rejected ? 'rejected' : 'draft',
  };
}

/** The padded range a cut would use, clamped to the recording. */
export function clipOf(row: DraftRow, durationUs: number): ReviewRange {
  return clipRangeOf(toDraftItem(row), row.padding, { startUs: 0, endUs: durationUs });
}
