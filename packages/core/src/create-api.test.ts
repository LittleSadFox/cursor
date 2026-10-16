import { describe, expect, it } from 'vitest';

import { runCoachApiConformance } from '@climbing-coach/api';
import { ProblemError } from '@climbing-coach/api';

import { appliedMigrationIds } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { encodeUlid } from './ids/ulid.js';
import { createTestApi } from './test/fakes.js';

describe('ULID', () => {
  it('encodes a 26-character Crockford id', () => {
    const id = encodeUlid(Date.parse('2026-10-15T12:00:00.000Z'), new Uint8Array(10).fill(7));
    expect(id).toHaveLength(26);
    expect(id.startsWith('01')).toBe(true);
  });
});

describe('migrations', () => {
  it('applies 0001_init on an empty database', () => {
    const { memory } = createTestApi();
    expect(appliedMigrationIds(memory.sql)).toEqual(MIGRATIONS.map((migration) => migration.id));
    const gyms = memory.sql.get("SELECT name FROM sqlite_master WHERE type='table' AND name='gyms'");
    expect(gyms).toBeDefined();
  });
});

describe('CoachApi (in-process)', () => {
  it('passes the shared conformance suite', async () => {
    const { api } = createTestApi();
    await runCoachApiConformance(api);
  });

  it('refuses a sync-folder library root', async () => {
    const { api } = createTestApi();
    await expect(
      api.system.updateSettings({ libraryRoot: '/Users/me/Dropbox/Coach' }),
    ).rejects.toBeInstanceOf(ProblemError);
  });

  it('refuses a relative or ~ library root', async () => {
    const { api } = createTestApi();
    for (const libraryRoot of ['~/Movies/Climbing Coach Library', 'library']) {
      await expect(api.system.updateSettings({ libraryRoot })).rejects.toBeInstanceOf(ProblemError);
    }
  });

  it('soft-deletes a training log and restores it', async () => {
    const { api } = createTestApi();
    await api.trainingLogs.put('2026-10-16', {
      tzOffsetMin: 0,
      sessionExertion: 4,
      exertionSource: 'user',
      boulderCount: 2,
      routeCount: 0,
      durationMin: 60,
      sessionType: 'climbing',
      notes: 'easy',
      grades: [],
      secondaryFocusIds: [],
    });
    await api.trainingLogs.remove('2026-10-16');
    expect((await api.trainingLogs.get('2026-10-16')).entry).toBeNull();
    await api.trash.restore('training_log', '2026-10-16');
    expect((await api.trainingLogs.get('2026-10-16')).entry?.sessionExertion).toBe(4);
  });
});
