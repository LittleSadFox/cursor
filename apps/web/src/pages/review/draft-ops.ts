import type { ReviewRange } from '@climbing-coach/api';
import { manualItem, mergeItems, splitItem } from '@climbing-coach/engine';
import type { AttemptOutcome } from '@climbing-coach/schema';

import {
  DEFAULT_PADDING,
  fromDraftItem,
  isEditable,
  isLive,
  sortRows,
  toDraftItem,
  type DraftRow,
} from './draft.js';

/** Shortest climb a handle drag, split, or add may leave. */
export const MIN_CLIMB_US = 100_000;
/** Length of a climb added at the playhead, before it is trimmed to the next climb. */
export const ADD_CLIMB_US = 5_000_000;

export type Edge = 'start' | 'end';
export type NewId = () => string;

function replaceRow(rows: readonly DraftRow[], id: string, next: DraftRow[]): DraftRow[] {
  return sortRows(rows.flatMap((row) => (row.id === id ? next : [row])));
}

function editableRow(rows: readonly DraftRow[], id: string): DraftRow | undefined {
  const row = rows.find((candidate) => candidate.id === id);
  return row && isEditable(row) ? row : undefined;
}

/** Live climbs other than `id`, in time order. */
function otherLive(rows: readonly DraftRow[], id: string | null): DraftRow[] {
  return sortRows(rows.filter((row) => row.id !== id && isLive(row)));
}

/** The free span a climb may grow into: from the previous live climb to the next one. */
export function freeSpan(
  rows: readonly DraftRow[],
  around: ReviewRange,
  id: string | null,
  durationUs: number,
): ReviewRange {
  let startUs = 0;
  let endUs = durationUs;
  for (const row of otherLive(rows, id)) {
    if (row.climb.endUs <= around.startUs) startUs = Math.max(startUs, row.climb.endUs);
    if (row.climb.startUs >= around.endUs) endUs = Math.min(endUs, row.climb.startUs);
  }
  return { startUs, endUs };
}

/** Where a dragged handle may land: inside its free span, keeping the climb at least `MIN_CLIMB_US`. */
export function clampEdge(
  rows: readonly DraftRow[],
  id: string,
  edge: Edge,
  tUs: number,
  durationUs: number,
): number {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return tUs;
  const span = freeSpan(rows, row.climb, id, durationUs);
  const target = Math.round(tUs);
  if (edge === 'start') {
    return Math.min(Math.max(target, span.startUs), row.climb.endUs - MIN_CLIMB_US);
  }
  return Math.max(Math.min(target, span.endUs), row.climb.startUs + MIN_CLIMB_US);
}

export function moveEdge(
  rows: readonly DraftRow[],
  id: string,
  edge: Edge,
  tUs: number,
  durationUs: number,
): readonly DraftRow[] {
  const row = editableRow(rows, id);
  if (!row || !isLive(row)) return rows;
  const at = clampEdge(rows, id, edge, tUs, durationUs);
  const climb = edge === 'start' ? { ...row.climb, startUs: at } : { ...row.climb, endUs: at };
  if (climb.startUs === row.climb.startUs && climb.endUs === row.climb.endUs) return rows;
  return replaceRow(rows, id, [{ ...row, climb, touched: true }]);
}

/** The live climb under the playhead (half-open). */
export function itemAt(rows: readonly DraftRow[], tUs: number): DraftRow | undefined {
  return rows.find((row) => isLive(row) && row.climb.startUs <= tUs && tUs < row.climb.endUs);
}

export function canSplitAt(rows: readonly DraftRow[], tUs: number): boolean {
  const row = itemAt(rows, tUs);
  return Boolean(
    row &&
    isEditable(row) &&
    tUs - row.climb.startUs >= MIN_CLIMB_US &&
    row.climb.endUs - tUs >= MIN_CLIMB_US,
  );
}

/** Split the climb under the playhead into two (engine `splitItem`). */
export function splitAt(rows: readonly DraftRow[], tUs: number, newId: NewId): readonly DraftRow[] {
  if (!canSplitAt(rows, tUs)) return rows;
  const row = itemAt(rows, tUs);
  if (!row) return rows;
  const [left, right] = splitItem(toDraftItem(row), Math.round(tUs), {
    left: newId(),
    right: newId(),
  });
  return replaceRow(rows, row.id, [
    fromDraftItem(left, row.padding),
    fromDraftItem(right, row.padding),
  ]);
}

/** The next live climb after `id`, if it can merge with it. */
export function mergePartner(rows: readonly DraftRow[], id: string): DraftRow | undefined {
  const row = editableRow(rows, id);
  if (!row || !isLive(row)) return undefined;
  const next = otherLive(rows, id).find((other) => other.climb.startUs >= row.climb.endUs);
  return next && isEditable(next) ? next : undefined;
}

/** Merge a climb with the next live climb (engine `mergeItems`); rejected rows between stay. */
export function mergeWithNext(
  rows: readonly DraftRow[],
  id: string,
  newId: NewId,
): readonly DraftRow[] {
  const row = editableRow(rows, id);
  const next = mergePartner(rows, id);
  if (!row || !next) return rows;
  const merged = fromDraftItem(
    mergeItems(toDraftItem(row), toDraftItem(next), newId()),
    row.padding,
  );
  return sortRows([...rows.filter((other) => other.id !== row.id && other.id !== next.id), merged]);
}

export function rejectItem(rows: readonly DraftRow[], id: string): readonly DraftRow[] {
  const row = editableRow(rows, id);
  if (!row || row.status === 'rejected') return rows;
  return replaceRow(rows, id, [{ ...row, status: 'rejected', touched: true }]);
}

/** A rejected climb comes back only if nothing live took its range meanwhile. */
export function canRestore(rows: readonly DraftRow[], id: string): boolean {
  const row = editableRow(rows, id);
  if (!row || row.status !== 'rejected') return false;
  return otherLive(rows, id).every(
    (other) => other.climb.endUs <= row.climb.startUs || other.climb.startUs >= row.climb.endUs,
  );
}

export function restoreItem(rows: readonly DraftRow[], id: string): readonly DraftRow[] {
  const row = editableRow(rows, id);
  if (!row || !canRestore(rows, id)) return rows;
  return replaceRow(rows, id, [{ ...row, status: 'draft', touched: true }]);
}

/** Range a climb added at the playhead would take, or null when the playhead is on a climb. */
export function addRange(
  rows: readonly DraftRow[],
  tUs: number,
  durationUs: number,
): ReviewRange | null {
  const startUs = Math.max(0, Math.round(tUs));
  if (itemAt(rows, startUs)) return null;
  const span = freeSpan(rows, { startUs, endUs: startUs }, null, durationUs);
  const endUs = Math.min(startUs + ADD_CLIMB_US, span.endUs);
  return endUs - startUs >= MIN_CLIMB_US ? { startUs, endUs } : null;
}

export function addAt(
  rows: readonly DraftRow[],
  tUs: number,
  durationUs: number,
  newId: NewId,
): readonly DraftRow[] {
  const range = addRange(rows, tUs, durationUs);
  if (!range) return rows;
  return sortRows([...rows, fromDraftItem(manualItem(newId(), range), DEFAULT_PADDING)]);
}

export function setOutcome(
  rows: readonly DraftRow[],
  id: string,
  outcome: AttemptOutcome,
): readonly DraftRow[] {
  const row = editableRow(rows, id);
  if (!row || row.outcome === outcome) return rows;
  return replaceRow(rows, id, [{ ...row, outcome, touched: true }]);
}

/** Next (or previous) item for Tab navigation, wrapping around. */
export function stepItem(
  rows: readonly DraftRow[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.id === currentId);
  if (index < 0) return (direction === 1 ? rows[0] : rows[rows.length - 1])?.id ?? null;
  return rows[(index + direction + rows.length) % rows.length]?.id ?? null;
}
