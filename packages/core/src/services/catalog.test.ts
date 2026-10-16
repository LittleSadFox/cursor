import { describe, expect, it } from 'vitest';

import { ProblemError, type Page } from '@climbing-coach/api';

import { createTestApi } from '../test/fakes.js';

async function collectPages<T>(
  fetch: (cursor: string | undefined) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await fetch(cursor);
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

function problemCode(error: unknown): string | undefined {
  return error instanceof ProblemError ? error.problem.code : undefined;
}

describe('catalog pagination', () => {
  it('walks every gym exactly once, newest first', async () => {
    const { api, clock } = createTestApi();
    const created: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      clock.advance(1);
      created.push((await api.gyms.create({ name: `Gym ${i}`, notes: '' })).id);
    }
    const seen = await collectPages((cursor) => api.gyms.list({ limit: 3, cursor }));
    expect(seen.map((gym) => gym.id)).toEqual([...created].reverse());
  });

  it('rejects a malformed cursor as a validation problem', async () => {
    const { api } = createTestApi();
    const error = await api.gyms
      .list({ cursor: 'not-a-cursor' })
      .catch((caught: unknown) => caught);
    expect(problemCode(error)).toBe('VALIDATION_FAILED');
  });

  it('reports a bad limit as a validation problem, not a raw Zod error', async () => {
    const { api } = createTestApi();
    const error = await api.gyms.list({ limit: 0 }).catch((caught: unknown) => caught);
    expect(problemCode(error)).toBe('VALIDATION_FAILED');
  });

  it('filters sessions by date in SQL before the page limit', async () => {
    const { api, clock } = createTestApi();
    for (let day = 1; day <= 28; day += 1) {
      for (let n = 0; n < 3; n += 1) {
        clock.advance(1);
        await api.sessions.create({
          date: `2026-02-${String(day).padStart(2, '0')}`,
          tzOffsetMin: 0,
        });
      }
    }
    // The 3 matching sessions are the oldest 3 of 84, so a post-LIMIT filter would drop them.
    const first = await api.sessions.list({ from: '2026-02-01', to: '2026-02-01', limit: 50 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeNull();

    const all = await collectPages((cursor) =>
      api.sessions.list({ from: '2026-02-10', limit: 7, cursor }),
    );
    expect(all).toHaveLength(19 * 3);
    const dates = all.map((session) => session.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(all.map((session) => session.id)).size).toBe(all.length);
  });
});

describe('boulder filters', () => {
  async function seed() {
    const ctx = createTestApi();
    const gym = await ctx.api.gyms.create({ name: 'Home', notes: '' });
    const make = async (grade: string) => {
      ctx.clock.advance(1);
      return ctx.api.boulders.create({ gymId: gym.id, grade, color: 'red' });
    };
    const v2 = await make('V2');
    const v5 = await make('V5');
    const v10 = await make('V10');
    await ctx.api.boulders.update(v5.id, { retiredOn: '2026-10-01' });
    return { ...ctx, gym, v2, v5, v10 };
  }

  it('treats active=false as retired-only (the query string "false" is not truthy)', async () => {
    const { api, v2, v5, v10 } = await seed();
    const retired = await api.boulders.list({ active: false });
    expect(retired.items.map((b) => b.id)).toEqual([v5.id]);
    const active = await api.boulders.list({ active: true });
    expect(active.items.map((b) => b.id).sort()).toEqual([v2.id, v10.id].sort());
  });

  it('filters by difficulty index, so V10 sorts above V5', async () => {
    const { api, v5, v10 } = await seed();
    const page = await api.boulders.list({ gradeMin: 'V4', gradeMax: 'V10' });
    expect(page.items.map((b) => b.id).sort()).toEqual([v5.id, v10.id].sort());
  });

  it('keeps V grades editable after switching the preferred system to routes', async () => {
    const { api, gym, v2 } = await seed();
    await api.system.updateSettings({ gradeSystem: 'yds' });
    const renamed = await api.boulders.update(v2.id, { name: 'Warm-up' });
    expect(renamed.name).toBe('Warm-up');
    const created = await api.boulders.create({ gymId: gym.id, grade: 'V3', color: 'blue' });
    expect(created.difficultyIndex).toBeGreaterThan(renamed.difficultyIndex);
  });

  it('rejects a boulder for a missing gym', async () => {
    const { api } = createTestApi();
    const error = await api.boulders
      .create({ gymId: '01J0000000000000000000000Z', grade: 'V1', color: 'red' })
      .catch((caught: unknown) => caught);
    expect(problemCode(error)).toBe('VALIDATION_FAILED');
  });
});
