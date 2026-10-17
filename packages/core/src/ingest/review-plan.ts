import {
  mergeDetectorUpdate,
  proposeItems,
  rangesOverlap,
  type AttemptDetection,
  type DraftItem,
} from '@climbing-coach/engine';
import { AttemptOutcomeSchema } from '@climbing-coach/schema';

import type { ReviewItemRow } from '../db/repos/review.js';

export type DetectorPlan = {
  /** Untouched detector rows the new detection replaces. */
  retireIds: string[];
  insert: DraftItem[];
};

function sameProposal(row: ReviewItemRow, item: DraftItem): boolean {
  return (
    row.climbStartUs === item.climb.startUs &&
    row.climbEndUs === item.climb.endUs &&
    row.outcome === item.outcome
  );
}

/**
 * Rows the user touched, rejected, or committed are held as-is. An untouched draft that
 * matches a new detection exactly is held too, so re-running detection is a no-op.
 */
function heldDraft(row: ReviewItemRow, incoming: readonly DraftItem[]): DraftItem {
  const outcome = AttemptOutcomeSchema.catch('unknown').parse(row.outcome);
  const userOwned = row.touched || row.status !== 'draft';
  const unchanged = incoming.some((item) => sameProposal(row, item));
  return {
    id: row.id,
    climb: { startUs: row.climbStartUs, endUs: row.climbEndUs },
    outcome,
    touched: userOwned || unchanged,
    rejected: row.status === 'rejected',
    source: 'detector',
    parentIds: [row.id],
  };
}

/** A span the user rejected is not proposed again by a later detection pass. */
function outsideRejected(rows: readonly ReviewItemRow[], item: DraftItem): boolean {
  return !rows.some(
    (row) =>
      row.status === 'rejected' &&
      rangesOverlap({ startUs: row.climbStartUs, endUs: row.climbEndUs }, item.climb),
  );
}

/** What to retire and insert so the stored draft reflects `attempts` (engine `mergeDetectorUpdate`). */
export function planDetectorUpdate(
  existing: readonly ReviewItemRow[],
  attempts: readonly AttemptDetection[],
  newIds: readonly string[],
): DetectorPlan {
  const incoming = proposeItems(attempts, newIds).filter((item) => outsideRejected(existing, item));
  const current = existing.map((row) => heldDraft(row, incoming));
  const merged = mergeDetectorUpdate(current, incoming);
  const keptIds = new Set(merged.map((item) => item.id));
  const fresh = new Set(newIds);
  return {
    retireIds: existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id),
    insert: merged.filter((item) => fresh.has(item.id)),
  };
}
