import { NEW_REVIEW_ITEM_ID, ProblemError, type ReviewItemInput } from '@climbing-coach/api';
import { validateDraft, type DraftItem } from '@climbing-coach/engine';

import type {
  InsertUserReviewItemInput,
  ReviewItemPatch,
  ReviewItemRow,
} from '../db/repos/review.js';

export type SavePlan = {
  updates: { id: string; patch: ReviewItemPatch }[];
  inserts: InsertUserReviewItemInput[];
  /** Stored rows the draft no longer has (replaced by a split or merge, or removed). */
  retireIds: string[];
  idMap: Record<string, string>;
};

export type SavePlanInput = {
  videoId: string;
  existing: readonly ReviewItemRow[];
  items: readonly ReviewItemInput[];
  durationUs: number | null;
  padding: { preUs: number; postUs: number };
  newId: () => string;
};

function assertUniqueIds(items: readonly ReviewItemInput[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new ProblemError('VALIDATION_FAILED', `Review item ${item.id} appears twice.`);
    }
    seen.add(item.id);
  }
}

function assertInsideRecording(items: readonly ReviewItemInput[], durationUs: number | null) {
  for (const item of items) {
    const { startUs, endUs } = item.climb;
    if (endUs <= startUs || (durationUs !== null && endUs > durationUs)) {
      throw new ProblemError(
        'VALIDATION_FAILED',
        'Each climb must be a positive span inside the recording.',
      );
    }
  }
}

function assertKnownIds(
  items: readonly ReviewItemInput[],
  rows: ReadonlyMap<string, ReviewItemRow>,
): void {
  for (const item of items) {
    if (NEW_REVIEW_ITEM_ID.test(item.id)) continue;
    const row = rows.get(item.id);
    if (!row) throw new ProblemError('VALIDATION_FAILED', `Unknown review item ${item.id}.`);
    if (row.status === 'committed') {
      throw new ProblemError('ALREADY_COMMITTED', `Review item ${item.id} is already committed.`);
    }
  }
}

function asDraft(id: string, startUs: number, endUs: number, rejected: boolean): DraftItem {
  return {
    id,
    climb: { startUs, endUs },
    outcome: 'unknown',
    touched: true,
    rejected,
    source: 'manual',
    parentIds: [],
  };
}

/** Live climbs (draft or committed) may not overlap; rejected rows do not count. */
function assertNoOverlap(
  items: readonly ReviewItemInput[],
  existing: readonly ReviewItemRow[],
): void {
  const drafts = items.map((item) =>
    asDraft(item.id, item.climb.startUs, item.climb.endUs, item.status === 'rejected'),
  );
  const committed = existing
    .filter((row) => row.status === 'committed')
    .map((row) => asDraft(row.id, row.climbStartUs, row.climbEndUs, false));
  const result = validateDraft([...drafts, ...committed]);
  if (!result.ok) {
    throw new ProblemError('CLIMB_OVERLAP', 'Two climbs in the draft overlap.');
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Stored patch for an edited row, or null when nothing changed. Any change marks it touched. */
export function changedPatch(row: ReviewItemRow, item: ReviewItemInput): ReviewItemPatch | null {
  const edited =
    row.climbStartUs !== item.climb.startUs ||
    row.climbEndUs !== item.climb.endUs ||
    row.outcome !== item.outcome ||
    row.status !== item.status ||
    !sameIds(row.parentIds, item.parentIds);
  const touched = row.touched || item.touched || edited;
  if (!edited && touched === row.touched) return null;
  return {
    parentIds: item.parentIds,
    outcome: item.outcome,
    climbStartUs: item.climb.startUs,
    climbEndUs: item.climb.endUs,
    touched,
    status: item.status,
  };
}

function insertFor(
  input: SavePlanInput,
  item: ReviewItemInput,
  id: string,
): InsertUserReviewItemInput {
  return {
    id,
    videoId: input.videoId,
    origin: item.parentIds.length === 0 ? 'manual' : item.origin,
    parentIds: item.parentIds,
    outcome: item.outcome,
    climbStartUs: item.climb.startUs,
    climbEndUs: item.climb.endUs,
    prePadUs: input.padding.preUs,
    postPadUs: input.padding.postUs,
    status: item.status,
  };
}

/**
 * Turns an autosaved draft into row changes (BUILD_PLAN §4.2 `PUT /recordings/:id/review`).
 * Committed rows are never sent and never change. Throws a `ProblemError` for a draft the
 * server must not store.
 */
export function planReviewSave(input: SavePlanInput): SavePlan {
  const rows = new Map(input.existing.map((row) => [row.id, row]));
  assertUniqueIds(input.items);
  assertKnownIds(input.items, rows);
  assertInsideRecording(input.items, input.durationUs);
  assertNoOverlap(input.items, input.existing);

  const plan: SavePlan = { updates: [], inserts: [], retireIds: [], idMap: {} };
  for (const item of input.items) {
    const row = rows.get(item.id);
    if (!row) {
      const id = input.newId();
      plan.idMap[item.id] = id;
      plan.inserts.push(insertFor(input, item, id));
      continue;
    }
    const patch = changedPatch(row, item);
    if (patch) plan.updates.push({ id: row.id, patch });
  }
  const sent = new Set(input.items.map((item) => item.id));
  plan.retireIds = input.existing
    .filter((row) => row.status !== 'committed' && !sent.has(row.id))
    .map((row) => row.id);
  return plan;
}
