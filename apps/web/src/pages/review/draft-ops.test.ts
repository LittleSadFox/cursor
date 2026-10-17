import { describe, expect, it } from 'vitest';

import { toSaveItems } from './draft.js';
import {
  addAt,
  canRestore,
  canSplitAt,
  clampEdge,
  MIN_CLIMB_US,
  mergeWithNext,
  moveEdge,
  rejectItem,
  restoreItem,
  setOutcome,
  setRating,
  splitAt,
  stepItem,
} from './draft-ops.js';
import { A, B, C, detector, DURATION_US, ids } from './fixtures.test-util.js';

const rows = [detector(A, 10_000_000, 20_000_000), detector(B, 30_000_000, 40_000_000)];

describe('moveEdge', () => {
  it('moves a handle and marks the climb touched', () => {
    const next = moveEdge(rows, A, 'end', 22_000_000, DURATION_US);
    expect(next[0]).toMatchObject({
      climb: { startUs: 10_000_000, endUs: 22_000_000 },
      touched: true,
    });
  });

  it('stops at the neighbouring climb and at the minimum length', () => {
    expect(clampEdge(rows, A, 'end', 35_000_000, DURATION_US)).toBe(30_000_000);
    expect(clampEdge(rows, B, 'start', 5_000_000, DURATION_US)).toBe(20_000_000);
    expect(clampEdge(rows, A, 'start', 25_000_000, DURATION_US)).toBe(20_000_000 - MIN_CLIMB_US);
    expect(clampEdge(rows, B, 'end', 90_000_000, DURATION_US)).toBe(DURATION_US);
  });

  it('returns the same rows when nothing moves', () => {
    expect(moveEdge(rows, A, 'start', 10_000_000, DURATION_US)).toBe(rows);
    expect(moveEdge(rows, 'missing', 'start', 0, DURATION_US)).toBe(rows);
  });

  it('leaves committed climbs alone', () => {
    const committed = [detector(A, 0, 1_000_000, { status: 'committed' })];
    expect(moveEdge(committed, A, 'end', 2_000_000, DURATION_US)).toBe(committed);
  });
});

describe('split and merge', () => {
  it('splits the climb under the playhead into two rows that keep its lineage', () => {
    const next = splitAt(rows, 15_000_000, ids());
    expect(next.map((row) => [row.id, row.climb.startUs, row.climb.endUs, row.parentIds])).toEqual([
      ['new-1', 10_000_000, 15_000_000, [A]],
      ['new-2', 15_000_000, 20_000_000, [A]],
      [B, 30_000_000, 40_000_000, [B]],
    ]);
    expect(next[0]).toMatchObject({ origin: 'detector', touched: true });
  });

  it('will not split off a sliver or between climbs', () => {
    expect(canSplitAt(rows, 10_000_000 + MIN_CLIMB_US - 1)).toBe(false);
    expect(canSplitAt(rows, 25_000_000)).toBe(false);
    expect(splitAt(rows, 25_000_000, ids())).toBe(rows);
  });

  it('merges a climb with the next one and spans both', () => {
    const next = mergeWithNext(rows, A, ids());
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'new-1',
      climb: { startUs: 10_000_000, endUs: 40_000_000 },
      parentIds: [A, B],
    });
  });

  it('skips a rejected climb in between and keeps it', () => {
    const three = [...rows, detector(C, 50_000_000, 55_000_000)];
    const next = mergeWithNext(rejectItem(three, B), A, ids());
    expect(next.map((row) => [row.id, row.status])).toEqual([
      ['new-1', 'draft'],
      [B, 'rejected'],
    ]);
    expect(next[0]?.climb).toEqual({ startUs: 10_000_000, endUs: 55_000_000 });
  });

  it('round-trips a split back through merge', () => {
    const split = splitAt(rows, 15_000_000, ids());
    const merged = mergeWithNext(split, 'new-1', () => 'new-m');
    expect(merged[0]).toMatchObject({
      climb: { startUs: 10_000_000, endUs: 20_000_000 },
      parentIds: [A],
    });
  });
});

describe('reject, restore, add, outcome', () => {
  it('rejects and restores a climb', () => {
    const rejected = rejectItem(rows, A);
    expect(rejected[0]).toMatchObject({ status: 'rejected', touched: true });
    expect(restoreItem(rejected, A)[0]?.status).toBe('draft');
  });

  it('does not restore over a climb that took the range', () => {
    const rejected = rejectItem(rows, A);
    const grown = moveEdge(rejected, B, 'start', 15_000_000, DURATION_US);
    expect(canRestore(grown, A)).toBe(false);
    expect(restoreItem(grown, A)).toBe(grown);
  });

  it('adds a manual climb at the playhead, trimmed to the next climb', () => {
    const next = addAt(rows, 28_000_000, DURATION_US, ids());
    expect(next[1]).toMatchObject({
      id: 'new-1',
      origin: 'manual',
      parentIds: [],
      climb: { startUs: 28_000_000, endUs: 30_000_000 },
    });
    expect(addAt(rows, 12_000_000, DURATION_US, ids())).toBe(rows);
  });

  it('sets an outcome once', () => {
    const next = setOutcome(rows, A, 'top');
    expect(next[0]).toMatchObject({ outcome: 'top', touched: true });
    expect(setOutcome(next, A, 'top')).toBe(next);
  });

  it('copies a rating through a split and keeps the later climb on a merge', () => {
    const rated = [
      detector(A, 10_000_000, 20_000_000, { proximity: 2, boulderId: C }),
      detector(B, 30_000_000, 40_000_000, { proximity: 5, tags: ['crimp'] }),
    ];
    expect(splitAt(rated, 15_000_000, ids()).slice(0, 2)).toEqual([
      expect.objectContaining({ proximity: 2, boulderId: C }),
      expect.objectContaining({ proximity: 2, boulderId: C }),
    ]);
    expect(mergeWithNext(rated, A, ids())[0]).toMatchObject({ proximity: 5, tags: ['crimp'] });
  });

  it('gives an added climb the previous boulder and stores a rating on save', () => {
    const rated = [detector(A, 0, 5_000_000, { boulderId: C, proximity: 3 })];
    const added = addAt(rated, 8_000_000, DURATION_US, ids());
    expect(added[1]).toMatchObject({ boulderId: C, proximity: null, tags: [] });
    const saved = toSaveItems(setRating(added, A, { exertion: 6, tags: ['dyno'] }));
    expect(saved[0]).toMatchObject({ boulderId: C, proximity: 3, exertion: 6, tags: ['dyno'] });
    expect(setRating(rated, A, { proximity: 3 })).toBe(rated);
  });

  it('steps through items with wrap-around', () => {
    expect(stepItem(rows, null, 1)).toBe(A);
    expect(stepItem(rows, A, 1)).toBe(B);
    expect(stepItem(rows, B, 1)).toBe(A);
    expect(stepItem(rows, A, -1)).toBe(B);
    expect(stepItem([], A, 1)).toBeNull();
  });
});

describe('toSaveItems', () => {
  it('sends editable rows and leaves committed ones out', () => {
    const items = toSaveItems([
      ...rejectItem(rows, B),
      detector(C, 50_000_000, 51_000_000, { status: 'committed' }),
    ]);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      [A, 'draft'],
      [B, 'rejected'],
    ]);
  });
});
