import { describe, expect, it } from 'vitest';

import { ProblemError, type TrainingLogInput } from '@climbing-coach/api';

import { createTestApi } from '../test/fakes.js';

function input(overrides: Partial<TrainingLogInput> = {}): TrainingLogInput {
  return {
    tzOffsetMin: 0,
    sessionExertion: 6,
    exertionSource: 'user',
    boulderCount: 4,
    routeCount: 0,
    durationMin: 90,
    sessionType: 'climbing',
    primaryFocusId: 'power',
    secondaryFocusIds: ['technique'],
    grades: [{ discipline: 'boulder', grade: 'V4', attempted: 3, sent: 1 }],
    notes: '',
    ...overrides,
  };
}

function problemCode(error: unknown): string | undefined {
  return error instanceof ProblemError ? error.problem.code : undefined;
}

describe('training log upsert', () => {
  it('rejects a stale expectedVersion with VERSION_CONFLICT', async () => {
    const { api } = createTestApi();
    const first = await api.trainingLogs.put('2026-10-15', input());
    const second = await api.trainingLogs.put(
      '2026-10-15',
      input({ expectedVersion: first.version, notes: 'b' }),
    );
    expect(second.version).toBe(first.version + 1);
    const error = await api.trainingLogs
      .put('2026-10-15', input({ expectedVersion: first.version, notes: 'c' }))
      .catch((caught: unknown) => caught);
    expect(problemCode(error)).toBe('VERSION_CONFLICT');
    expect((await api.trainingLogs.get('2026-10-15')).entry?.notes).toBe('b');
  });

  it('treats expectedVersion on a missing day as a conflict', async () => {
    const { api } = createTestApi();
    const error = await api.trainingLogs
      .put('2026-10-15', input({ expectedVersion: 1 }))
      .catch((e: unknown) => e);
    expect(problemCode(error)).toBe('VERSION_CONFLICT');
  });

  it('rolls back the whole write when a focus id is unknown', async () => {
    const { api } = createTestApi();
    await api.trainingLogs.put('2026-10-15', input());
    const error = await api.trainingLogs
      .put('2026-10-15', input({ secondaryFocusIds: ['no-such-focus'], grades: [], notes: 'lost' }))
      .catch((caught: unknown) => caught);
    expect(problemCode(error)).toBe('VALIDATION_FAILED');
    const entry = (await api.trainingLogs.get('2026-10-15')).entry;
    expect(entry?.notes).toBe('');
    expect(entry?.grades).toEqual([{ discipline: 'boulder', grade: 'V4', attempted: 3, sent: 1 }]);
    expect(entry?.secondaryFocusIds).toEqual(['technique']);
  });

  it('rejects the same discipline + grade twice', async () => {
    const { api } = createTestApi();
    const row = { discipline: 'boulder' as const, grade: 'V4', attempted: 1, sent: 0 };
    const error = await api.trainingLogs
      .put('2026-10-15', input({ grades: [row, row] }))
      .catch((e: unknown) => e);
    expect(problemCode(error)).toBe('VALIDATION_FAILED');
  });

  it('collapses duplicate secondary focus ids', async () => {
    const { api } = createTestApi();
    const saved = await api.trainingLogs.put(
      '2026-10-15',
      input({ secondaryFocusIds: ['technique', 'technique'] }),
    );
    expect(saved.secondaryFocusIds).toEqual(['technique']);
  });

  it('lists a range oldest first with each day keeping its own children', async () => {
    const { api } = createTestApi();
    await api.trainingLogs.put('2026-10-16', input({ secondaryFocusIds: [], grades: [] }));
    await api.trainingLogs.put('2026-10-14', input());
    const logs = await api.trainingLogs.list({ from: '2026-10-01', to: '2026-10-31' });
    expect(logs.map((log) => log.date)).toEqual(['2026-10-14', '2026-10-16']);
    expect(logs[0]?.grades).toHaveLength(1);
    expect(logs[1]?.grades).toHaveLength(0);
    expect(logs[0]?.load).toBe(6 * 90);
  });
});
