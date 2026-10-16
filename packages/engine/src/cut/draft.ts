import type { AttemptOutcome } from '@climbing-coach/schema';

import { rangesOverlap, type ClimbRange } from '../eval/ranges.js';
import { at } from '../math.js';
import type { AttemptDetection } from '../detect/types.js';
import type { DraftItem } from './types.js';

export function proposeItems(
  attempts: readonly AttemptDetection[],
  ids: readonly string[],
): DraftItem[] {
  if (ids.length !== attempts.length) {
    throw new Error('proposeItems: one id is required per attempt');
  }
  return attempts.map((attempt, index) => ({
    id: at(ids, index),
    climb: { startUs: attempt.startUs, endUs: Math.max(attempt.endUs, attempt.startUs) },
    outcome: attempt.outcome,
    touched: false,
    rejected: false,
    source: 'detector' as const,
    parentIds: [at(ids, index)],
  }));
}

/** Padding applied only at clip time, clamped to the video. */
export function clipRangeOf(
  item: DraftItem,
  padding: { preUs: number; postUs: number },
  video: ClimbRange,
): ClimbRange {
  const startUs = Math.max(video.startUs, item.climb.startUs - padding.preUs);
  const endUs = Math.min(video.endUs, item.climb.endUs + padding.postUs);
  return { startUs, endUs: Math.max(startUs, endUs) };
}

export function splitItem(
  item: DraftItem,
  atUs: number,
  ids: { left: string; right: string },
): [DraftItem, DraftItem] {
  if (atUs <= item.climb.startUs || atUs >= item.climb.endUs) {
    throw new Error('splitItem: cut must lie inside the climb range');
  }
  const base = {
    outcome: item.outcome,
    touched: true,
    rejected: false as const,
    source: 'split' as const,
    parentIds: item.parentIds,
  };
  return [
    { ...base, id: ids.left, climb: { startUs: item.climb.startUs, endUs: atUs } },
    { ...base, id: ids.right, climb: { startUs: atUs, endUs: item.climb.endUs } },
  ];
}

/** Merged climb spans both items. Its outcome is the later item's, whatever the argument order. */
export function mergeItems(left: DraftItem, right: DraftItem, id: string): DraftItem {
  if (rangesOverlap(left.climb, right.climb)) {
    throw new Error('mergeItems: climb ranges overlap');
  }
  const later = right.climb.endUs >= left.climb.endUs ? right : left;
  return {
    id,
    climb: {
      startUs: Math.min(left.climb.startUs, right.climb.startUs),
      endUs: Math.max(left.climb.endUs, right.climb.endUs),
    },
    outcome: later.outcome,
    touched: true,
    rejected: false,
    source: 'merge',
    parentIds: [...new Set([...left.parentIds, ...right.parentIds])],
  };
}

export function validateDraft(items: readonly DraftItem[]): {
  ok: boolean;
  conflicts: [string, string][];
} {
  const live = items.filter((item) => !item.rejected && item.climb.endUs > item.climb.startUs);
  const conflicts: [string, string][] = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = at(live, i);
      const b = at(live, j);
      if (rangesOverlap(a.climb, b.climb)) conflicts.push([a.id, b.id]);
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

/**
 * Incoming detector rows replace untouched proposals.
 * Touched and rejected items are returned unchanged, by reference.
 */
export function mergeDetectorUpdate(
  current: readonly DraftItem[],
  incoming: readonly DraftItem[],
): DraftItem[] {
  const kept = current.filter((item) => item.touched || item.rejected);
  const keptLive = kept.filter((item) => !item.rejected);
  const fresh = incoming.filter(
    (item) => !keptLive.some((held) => rangesOverlap(held.climb, item.climb)),
  );
  return [...kept, ...fresh].sort((a, b) => a.climb.startUs - b.climb.startUs);
}

export function manualItem(
  id: string,
  climb: ClimbRange,
  outcome: AttemptOutcome = 'unknown',
): DraftItem {
  return {
    id,
    climb,
    outcome,
    touched: true,
    rejected: false,
    source: 'manual',
    parentIds: [],
  };
}
