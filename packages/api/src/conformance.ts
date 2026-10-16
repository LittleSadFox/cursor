import type { CoachApi } from './coach-api.js';
import { ProblemError } from './problems.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`conformance: ${message}`);
}

/**
 * Shared CoachApi conformance (BUILD_PLAN §6.2).
 * Runs against in-process core and the HTTP client.
 */
export async function runCoachApiConformance(api: CoachApi): Promise<void> {
  const health = await api.system.health();
  assert(health.app === 'climbing-coach', 'health.app');
  assert(health.apiVersion === 'v1', 'health.apiVersion');
  assert(health.status === 'ok' || health.status === 'degraded', 'health.status');

  const settings = await api.system.getSettings();
  assert(settings.prePadUs === 2_000_000, 'default pre-roll');
  assert(settings.gradeSystem === 'v', 'default grade system');

  const gym = await api.gyms.create({ name: 'Test Gym', notes: 'indoors' });
  assert(gym.name === 'Test Gym', 'gym name');
  assert(gym.version === 1, 'gym version');

  const listed = await api.gyms.list();
  assert(
    listed.items.some((item) => item.id === gym.id),
    'gym listed',
  );

  const renamed = await api.gyms.update(gym.id, { name: 'Renamed Gym', expectedVersion: 1 });
  assert(renamed.name === 'Renamed Gym', 'gym renamed');
  assert(renamed.version === 2, 'gym bumped');

  let conflicted = false;
  try {
    await api.gyms.update(gym.id, { name: 'stale', expectedVersion: 1 });
  } catch (error) {
    conflicted = error instanceof ProblemError && error.problem.code === 'VERSION_CONFLICT';
  }
  assert(conflicted, 'stale gym patch is a version conflict');

  const boulder = await api.boulders.create({
    gymId: gym.id,
    name: 'The Wave',
    grade: 'V4',
    color: 'orange',
  });
  assert(boulder.difficultyIndex === 40, 'V4 index');
  assert(boulder.stats?.attempts === 0, 'new boulder has zero attempts');

  const session = await api.sessions.create({
    gymId: gym.id,
    date: '2026-10-15',
    tzOffsetMin: 60,
  });
  assert(session.date === '2026-10-15', 'session date');

  const tags = await api.focusTags.list();
  assert(
    tags.some((tag) => tag.id === 'strength' && tag.builtin),
    'builtin focus tags',
  );

  const day = await api.trainingLogs.get('2026-10-15');
  assert(day.entry === null, 'empty day');
  assert(day.prefill.sessionExertion === null, 'no prefill without attempts');

  const entry = await api.trainingLogs.put('2026-10-15', {
    tzOffsetMin: 60,
    sessionExertion: 7,
    exertionSource: 'user',
    boulderCount: 14,
    routeCount: 0,
    durationMin: 110,
    sessionType: 'climbing',
    primaryFocusId: 'strength',
    secondaryFocusIds: ['technique'],
    grades: [{ discipline: 'boulder', grade: 'V5', attempted: 3, sent: 1 }],
    body: { fingers: 'ok', skin: 'thin', joints: 'ok' },
    notes: '',
  });
  assert(entry.load === 770, 'session-RPE load');
  assert(entry.version === 1, 'log version');

  const load = await api.stats.trainingLoad({ from: '2026-10-15', to: '2026-10-15' }, 'rolling');
  assert(load.days.length === 1, 'one day in range');
  assert(load.days[0]?.load === 770, 'logged load');
  assert(load.days[0]?.band === 'insufficient_data', 'ACWR needs a longer window');

  const pyramid = await api.stats.gradePyramid({ from: '2026-10-15', to: '2026-10-15' }, 'boulder');
  assert(pyramid.length === 1 && pyramid[0]?.grade === 'V5' && pyramid[0]?.sent === 1, 'pyramid');

  await api.gyms.remove(gym.id);
  const trash = await api.trash.list();
  assert(
    trash.some((item) => item.kind === 'gym' && item.id === gym.id),
    'gym in trash',
  );
  await api.trash.restore('gym', gym.id);
  const restored = await api.gyms.get(gym.id);
  assert(restored.name === 'Renamed Gym', 'restored gym');

  let missing = false;
  try {
    await api.gyms.get('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  } catch (error) {
    missing = error instanceof ProblemError && error.problem.code === 'NOT_FOUND';
  }
  assert(missing, 'unknown gym is NOT_FOUND');

  assert(
    (await problemCodeOf(api.comparisons.get('01ARZ3NDEKTSV4RRFFQ69G5FAV'))) === 'NOT_FOUND',
    'unknown comparison is NOT_FOUND',
  );
  assert(
    (await problemCodeOf(
      api.comparisons.create({
        attemptAId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        attemptBId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      }),
    )) === 'NOT_FOUND',
    'comparing unknown attempts is NOT_FOUND',
  );
  assert(
    (await problemCodeOf(
      api.comparisons.create({
        attemptAId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        attemptBId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      }),
    )) === 'VALIDATION_FAILED',
    'comparing an attempt with itself is a validation problem',
  );
}

async function problemCodeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : null;
  }
}
