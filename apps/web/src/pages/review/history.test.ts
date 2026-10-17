import { describe, expect, it } from 'vitest';

import { splitAt } from './draft-ops.js';
import { A, B, detector, ids } from './fixtures.test-util.js';
import {
  canRedo,
  canUndo,
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  isDirty,
  reviewHistory,
  type HistoryAction,
  type ReviewHistory,
} from './history.js';

const rows = [detector(A, 0, 10_000_000), detector(B, 20_000_000, 30_000_000)];

function run(...actions: HistoryAction[]): ReviewHistory {
  return actions.reduce(reviewHistory, EMPTY_HISTORY);
}

const loaded: HistoryAction = { type: 'load', rows, revision: 3 };
const split: HistoryAction = {
  type: 'edit',
  apply: (current) => splitAt(current, 5_000_000, ids()),
};

describe('reviewHistory', () => {
  it('loads server rows clean, with nothing to undo', () => {
    const state = run(loaded);
    expect(state).toMatchObject({ loaded: true, revision: 3, present: rows });
    expect(isDirty(state)).toBe(false);
    expect(canUndo(state)).toBe(false);
  });

  it('undoes and redoes an edit, and each step needs a save', () => {
    const edited = run(loaded, split);
    expect(edited.present).toHaveLength(3);
    expect(isDirty(edited)).toBe(true);
    const undone = reviewHistory(edited, { type: 'undo' });
    expect(undone.present).toBe(rows);
    expect(canRedo(undone)).toBe(true);
    const redone = reviewHistory(undone, { type: 'redo' });
    expect(redone.present).toBe(edited.present);
    expect(redone.seq).toBeGreaterThan(edited.seq);
  });

  it('ignores edits that change nothing and drops redo after a new edit', () => {
    const state = run(loaded);
    expect(reviewHistory(state, { type: 'edit', apply: (current) => current })).toBe(state);
    const branched = run(loaded, split, { type: 'undo' }, split);
    expect(canRedo(branched)).toBe(false);
  });

  it('caps the undo stack', () => {
    const many = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index): HistoryAction => ({
      type: 'edit',
      apply: (current) => current.map((row) => ({ ...row, outcome: index % 2 ? 'top' : 'fall' })),
    }));
    expect(run(loaded, ...many).past).toHaveLength(HISTORY_LIMIT);
  });

  it('swaps temporary ids for stored ones across the whole stack', () => {
    const edited = run(loaded, split, { type: 'select', id: 'new-1' });
    const saved = reviewHistory(edited, {
      type: 'saved',
      seq: edited.seq,
      revision: 4,
      idMap: { 'new-1': 'S1', 'new-2': 'S2' },
    });
    expect(saved.present.map((row) => row.id)).toEqual(['S1', 'S2', B]);
    expect(saved.selectedId).toBe('S1');
    expect(saved.revision).toBe(4);
    expect(isDirty(saved)).toBe(false);
    const redone = reviewHistory(reviewHistory(saved, { type: 'undo' }), { type: 'redo' });
    expect(redone.present.map((row) => row.id)).toEqual(['S1', 'S2', B]);
  });

  it('stays dirty when edits landed while a save was in flight', () => {
    const first = run(loaded, split);
    const second = reviewHistory(first, {
      type: 'edit',
      apply: (current) => current.map((row) => ({ ...row, outcome: 'top' })),
    });
    const saved = reviewHistory(second, { type: 'saved', seq: first.seq, revision: 4, idMap: {} });
    expect(isDirty(saved)).toBe(true);
  });

  it('rebases onto new rows, still dirty, with a fresh undo stack', () => {
    const state = run(loaded, split, { type: 'rebased', rows, revision: 7 });
    expect(state).toMatchObject({ revision: 7, past: [], future: [] });
    expect(isDirty(state)).toBe(true);
  });

  it('drops a selection whose row is gone', () => {
    const state = run(loaded, { type: 'select', id: A }, split);
    expect(state.selectedId).toBeNull();
    expect(run(loaded, { type: 'select', id: 'nope' }).selectedId).toBeNull();
  });
});
