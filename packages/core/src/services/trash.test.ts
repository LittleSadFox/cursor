import { describe, expect, it } from 'vitest';

import { ProblemError } from '@climbing-coach/api';

import { createTestApi } from '../test/fakes.js';

const DAY_MS = 86_400_000;

function problemCode(error: unknown): string | undefined {
  return error instanceof ProblemError ? error.problem.code : undefined;
}

async function gymWithBoulders() {
  const ctx = createTestApi();
  const gym = await ctx.api.gyms.create({ name: 'Crag', notes: '' });
  const keep = await ctx.api.boulders.create({ gymId: gym.id, grade: 'V3', color: 'red' });
  const earlier = await ctx.api.boulders.create({ gymId: gym.id, grade: 'V4', color: 'blue' });
  const session = await ctx.api.sessions.create({
    gymId: gym.id,
    date: '2026-10-15',
    tzOffsetMin: 0,
  });
  return { ...ctx, gym, keep, earlier, session };
}

describe('trash', () => {
  it('trashes a gym with its boulders and restores only those trashed together', async () => {
    const { api, clock, gym, keep, earlier } = await gymWithBoulders();
    await api.boulders.remove(earlier.id);
    clock.advance(1000);
    await api.gyms.remove(gym.id);
    await expect(api.boulders.get(keep.id)).rejects.toBeInstanceOf(ProblemError);

    await api.trash.restore('gym', gym.id);
    expect((await api.boulders.get(keep.id)).id).toBe(keep.id);
    await expect(api.boulders.get(earlier.id)).rejects.toBeInstanceOf(ProblemError);
  });

  it('restoring a boulder alone revives its trashed gym', async () => {
    const { api, gym, keep } = await gymWithBoulders();
    await api.gyms.remove(gym.id);
    await api.trash.restore('boulder', keep.id);
    expect((await api.gyms.get(gym.id)).id).toBe(gym.id);
    expect((await api.boulders.get(keep.id)).id).toBe(keep.id);
  });

  it('refuses to purge or restore items that are not in the trash', async () => {
    const { api, gym, keep, session } = await gymWithBoulders();
    for (const [kind, id] of [
      ['gym', gym.id],
      ['boulder', keep.id],
      ['session', session.id],
      ['training_log', '2026-10-15'],
    ] as const) {
      expect(problemCode(await api.trash.purge(kind, id).catch((e: unknown) => e))).toBe(
        'NOT_FOUND',
      );
      expect(problemCode(await api.trash.restore(kind, id).catch((e: unknown) => e))).toBe(
        'NOT_FOUND',
      );
    }
    expect((await api.gyms.get(gym.id)).id).toBe(gym.id);
    expect((await api.sessions.get(session.id)).id).toBe(session.id);
  });

  it('purging a gym removes its boulders and detaches its sessions', async () => {
    const { api, gym, keep, session } = await gymWithBoulders();
    await api.gyms.remove(gym.id);
    await api.trash.purge('gym', gym.id);
    const items = await api.trash.list();
    expect(items.find((item) => item.id === keep.id)).toBeUndefined();
    expect(items.find((item) => item.id === gym.id)).toBeUndefined();
    expect((await api.sessions.get(session.id)).gymId).toBeNull();
  });

  it('purgeExpired hard-deletes only items older than the retention window', async () => {
    const { api, clock, gym, session } = await gymWithBoulders();
    await api.trainingLogs.put('2026-10-14', {
      tzOffsetMin: 0,
      sessionExertion: 5,
      exertionSource: 'user',
      boulderCount: 0,
      routeCount: 0,
      sessionType: 'climbing',
      secondaryFocusIds: [],
      grades: [],
      notes: '',
    });
    await api.trainingLogs.remove('2026-10-14');
    await api.gyms.remove(gym.id);
    clock.advance(29 * DAY_MS);
    await api.sessions.remove(session.id);
    clock.advance(2 * DAY_MS);

    const purged = (api.trash as typeof api.trash & { purgeExpired(): number }).purgeExpired();
    // The gym's boulders go with it, so they are not counted separately.
    expect(purged).toBe(2);
    const left = await api.trash.list();
    expect(left.map((item) => [item.kind, item.id])).toEqual([['session', session.id]]);
  });
});
