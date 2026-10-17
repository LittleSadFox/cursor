import { describe, expect, it } from 'vitest';

import { ProblemError, type ReviewItemInput } from '@climbing-coach/api';

import type { ReviewItemRow } from '../db/repos/review.js';
import { changedPatch, planReviewSave, type SavePlanInput } from './save-plan.js';

const A = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
const B = '01ARZ3NDEKTSV4RRFFQ69G5FA2';
const NEW = '01ARZ3NDEKTSV4RRFFQ69G5FA9';

function row(id: string, startUs: number, endUs: number, extra: Partial<ReviewItemRow> = {}) {
  return {
    id,
    videoId: 'video',
    origin: 'detector',
    parentIds: [id],
    outcome: 'fall',
    climbStartUs: startUs,
    climbEndUs: endUs,
    prePadUs: 2_000_000,
    postPadUs: 1_500_000,
    confidence: null,
    status: 'draft',
    touched: false,
    boulderId: null,
    proximity: null,
    exertion: null,
    tags: [],
    ...extra,
  } satisfies ReviewItemRow;
}

function input(
  id: string,
  startUs: number,
  endUs: number,
  extra: Partial<ReviewItemInput> = {},
): ReviewItemInput {
  return {
    id,
    origin: 'detector',
    parentIds: [A],
    climb: { startUs, endUs },
    outcome: 'fall',
    touched: false,
    status: 'draft',
    boulderId: null,
    proximity: null,
    exertion: null,
    tags: [],
    ...extra,
  };
}

function plan(
  existing: ReviewItemRow[],
  items: ReviewItemInput[],
  durationUs = 10_000_000,
  retired: ReviewItemRow[] = [],
) {
  const args: SavePlanInput = {
    videoId: 'video',
    existing,
    retired,
    items,
    durationUs,
    padding: { preUs: 2_000_000, postUs: 1_500_000 },
    newId: () => NEW,
  };
  return planReviewSave(args);
}

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : 'other';
  }
}

describe('planReviewSave', () => {
  it('stores nothing when the draft matches the rows', () => {
    expect(plan([row(A, 0, 1_000)], [input(A, 0, 1_000)])).toEqual({
      updates: [],
      inserts: [],
      retireIds: [],
      reviveIds: [],
      idMap: {},
    });
  });

  it('marks an edited row touched even when the client did not', () => {
    const result = plan([row(A, 0, 1_000)], [input(A, 100, 1_000)]);
    expect(result.updates).toEqual([
      {
        id: A,
        patch: {
          parentIds: [A],
          outcome: 'fall',
          climbStartUs: 100,
          climbEndUs: 1_000,
          touched: true,
          status: 'draft',
          boulderId: null,
          proximity: null,
          exertion: null,
          tags: [],
        },
      },
    ]);
  });

  it('turns a split into one retire and two inserts with stored ids', () => {
    const result = plan(
      [row(A, 0, 4_000)],
      [
        input('new-a', 0, 2_000, { touched: true }),
        input('new-b', 2_000, 4_000, { touched: true }),
      ],
    );
    expect(result.retireIds).toEqual([A]);
    expect(result.inserts.map((item) => [item.climbStartUs, item.parentIds])).toEqual([
      [0, [A]],
      [2_000, [A]],
    ]);
    expect(result.idMap).toEqual({ 'new-a': NEW, 'new-b': NEW });
    expect(result.inserts[0]?.prePadUs).toBe(2_000_000);
  });

  it('brings back a retired row when an undo sends it again', () => {
    const left = row(B, 0, 2_000, { origin: 'detector', parentIds: [A], touched: true });
    const result = plan([left], [input(A, 0, 4_000)], 10_000_000, [row(A, 0, 4_000)]);
    expect(result.reviveIds).toEqual([A]);
    expect(result.retireIds).toEqual([B]);
    expect(result.updates).toEqual([]);
    expect(result.inserts).toEqual([]);
  });

  it('stores a manual add as origin manual', () => {
    const result = plan([], [input('new-1', 0, 1_000, { parentIds: [], touched: true })]);
    expect(result.inserts[0]?.origin).toBe('manual');
  });

  it('keeps committed rows out of the draft and rejects edits to them', () => {
    const committed = row(B, 5_000, 6_000, { status: 'committed' });
    expect(plan([committed], []).retireIds).toEqual([]);
    expect(codeOf(() => plan([committed], [input(B, 5_000, 6_000)]))).toBe('ALREADY_COMMITTED');
    expect(codeOf(() => plan([committed], [input('new-1', 5_500, 7_000)]))).toBe('CLIMB_OVERLAP');
  });

  it('rejects overlap, unknown ids, duplicates, and climbs outside the recording', () => {
    expect(codeOf(() => plan([], [input('new-1', 0, 2_000), input('new-2', 1_000, 3_000)]))).toBe(
      'CLIMB_OVERLAP',
    );
    expect(
      codeOf(() =>
        plan([], [input('new-1', 0, 2_000), input('new-2', 1_000, 3_000, { status: 'rejected' })]),
      ),
    ).toBeNull();
    expect(codeOf(() => plan([], [input(A, 0, 1_000)]))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => plan([], [input('new-1', 0, 1), input('new-1', 5, 6)]))).toBe(
      'VALIDATION_FAILED',
    );
    expect(codeOf(() => plan([], [input('new-1', 0, 20_000_000)]))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => plan([], [input('new-1', 500, 500)]))).toBe('VALIDATION_FAILED');
  });
});

describe('changedPatch', () => {
  it('stores a rating and marks the row touched', () => {
    const patch = changedPatch(
      row(A, 0, 1_000),
      input(A, 0, 1_000, { boulderId: B, proximity: 4, exertion: 7, tags: ['crimp'] }),
    );
    expect(patch).toEqual(
      expect.objectContaining({
        boulderId: B,
        proximity: 4,
        exertion: 7,
        tags: ['crimp'],
        touched: true,
      }),
    );
    expect(
      changedPatch(row(A, 0, 1_000, { tags: ['crimp'] }), input(A, 0, 1_000, { tags: ['crimp'] })),
    ).toBeNull();
  });

  it('records a reject as a touched status change', () => {
    expect(changedPatch(row(A, 0, 1_000), input(A, 0, 1_000, { status: 'rejected' }))).toEqual(
      expect.objectContaining({ status: 'rejected', touched: true }),
    );
  });
});
