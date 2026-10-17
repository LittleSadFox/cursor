import { describe, expect, it } from 'vitest';

import { ProblemError, type ReviewItem, type ReviewItemInput } from '@climbing-coach/api';

import { DURATION_US, fakeVideoTools, importWith, secondFrames } from '../test/ingest-fakes.js';

function asInput(item: ReviewItem, extra: Partial<ReviewItemInput> = {}): ReviewItemInput {
  return {
    id: item.id,
    origin: item.origin,
    parentIds: item.parentIds,
    climb: item.climb,
    outcome: item.outcome,
    touched: item.touched,
    status: item.status === 'rejected' ? 'rejected' : 'draft',
    boulderId: item.boulderId,
    proximity: item.proximity,
    exertion: item.exertion,
    tags: item.tags,
    ...extra,
  };
}

async function importedReview() {
  const ctx = await importWith(fakeVideoTools(secondFrames(), []));
  const state = await ctx.api.review.get(ctx.id);
  const detected = state.items[0];
  if (!detected) throw new Error('fixture proposed nothing');
  return { ...ctx, state, detected };
}

async function codeOf(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : 'other';
  }
}

describe('review draft', () => {
  it('stores a split with fresh ids and bumps the revision', async () => {
    const { api, id, state, detected } = await importedReview();
    const mid = Math.round((detected.climb.startUs + detected.climb.endUs) / 2);
    const saved = await api.review.save(id, {
      baseRevision: state.revision,
      items: [
        asInput(detected, { id: 'new-l', climb: { ...detected.climb, endUs: mid }, touched: true }),
        asInput(detected, {
          id: 'new-r',
          climb: { ...detected.climb, startUs: mid },
          touched: true,
          outcome: 'top',
        }),
      ],
    });
    expect(saved.revision).toBe(state.revision + 1);
    expect(Object.keys(saved.idMap).sort()).toEqual(['new-l', 'new-r']);
    expect(saved.items.map((item) => item.id)).toEqual([
      saved.idMap['new-l'],
      saved.idMap['new-r'],
    ]);
    expect(saved.items.every((item) => item.parentIds[0] === detected.id && item.touched)).toBe(
      true,
    );
    expect(saved.items[1]?.outcome).toBe('top');
    expect((await api.recordings.get(id)).reviewState).toBe('in_review');
  });

  it('brings the split row back when an undo saves it again', async () => {
    const { api, id, state, detected } = await importedReview();
    const mid = Math.round((detected.climb.startUs + detected.climb.endUs) / 2);
    const split = await api.review.save(id, {
      baseRevision: state.revision,
      items: [
        asInput(detected, { id: 'new-l', climb: { ...detected.climb, endUs: mid } }),
        asInput(detected, { id: 'new-r', climb: { ...detected.climb, startUs: mid } }),
      ],
    });
    const undone = await api.review.save(id, {
      baseRevision: split.revision,
      items: [asInput(detected)],
    });
    expect(undone.items.map((item) => [item.id, item.climb])).toEqual([
      [detected.id, detected.climb],
    ]);
  });

  it('stores a rating with a boulder and refuses an unknown boulder', async () => {
    const { api, id, state, detected } = await importedReview();
    const gym = await api.gyms.create({ name: 'Home wall', notes: '' });
    const boulder = await api.boulders.create({ gymId: gym.id, grade: 'V4', color: 'red' });
    const saved = await api.review.save(id, {
      baseRevision: state.revision,
      items: [
        asInput(detected, { boulderId: boulder.id, proximity: 4, exertion: 7, tags: ['crimp'] }),
      ],
    });
    expect(saved.items[0]).toMatchObject({
      boulderId: boulder.id,
      proximity: 4,
      exertion: 7,
      tags: ['crimp'],
      touched: true,
    });
    expect(
      await codeOf(
        api.review.save(id, {
          baseRevision: saved.revision,
          items: [asInput(detected, { boulderId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })],
        }),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('rejects a stale base revision', async () => {
    const { api, id, state, detected } = await importedReview();
    await api.review.save(id, { baseRevision: state.revision, items: [asInput(detected)] });
    expect(
      await codeOf(
        api.review.save(id, { baseRevision: state.revision, items: [asInput(detected)] }),
      ),
    ).toBe('REVIEW_REVISION_CONFLICT');
  });

  it('reprocesses the whole recording without undoing rejects or edits', async () => {
    const { api, drain, id, seen, state, detected } = await importedReview();
    await api.review.save(id, {
      baseRevision: state.revision,
      items: [asInput(detected, { status: 'rejected' })],
    });
    const accepted = await api.recordings.reprocess(id, { scope: 'full' });
    expect(accepted.recording.jobId).toBe(accepted.jobId);
    expect(await codeOf(api.recordings.reprocess(id, { scope: 'full' }))).toBe('VALIDATION_FAILED');
    await drain();
    expect(seen.at(-1)?.windows).toEqual([{ startUs: 0, endUs: DURATION_US }]);
    const after = await api.review.get(id);
    expect(after.processing.complete).toBe(true);
    expect(after.items.map((item) => [item.id, item.status])).toEqual([[detected.id, 'rejected']]);
  });

  it('re-detects on the stored track without posing again for scope active', async () => {
    const { api, drain, id, seen } = await importedReview();
    const posed = seen.length;
    await api.recordings.reprocess(id, { scope: 'active' });
    await drain();
    expect(seen).toHaveLength(posed);
    expect((await api.recordings.get(id)).jobStatus).toBe('succeeded');
    expect((await api.review.get(id)).items).toHaveLength(1);
  });
});
