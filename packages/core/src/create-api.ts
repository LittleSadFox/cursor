import {
  ProblemError,
  type CoachApi,
  type Settings,
  type TrashKind,
  defaultHealth,
} from '@climbing-coach/api';
import {
  ENGINE_VERSION,
  exertionVolume,
  focusDistribution,
  gradePyramid,
  prefillTrainingLog,
  trainingLoad,
  weeklySummary,
  type GradeSystem,
} from '@climbing-coach/engine';

import {
  createBoulder,
  deleteBoulder,
  getBoulder,
  listBoulders,
  listDeletedBoulders,
  purgeBoulder,
  restoreBoulder,
  updateBoulder,
} from './db/repos/boulders.js';
import {
  createGym,
  deleteGym,
  getGym,
  listDeletedGyms,
  listGyms,
  purgeGym,
  restoreGym,
  updateGym,
} from './db/repos/gyms.js';
import { readSettings, writeSettings } from './db/repos/settings.js';
import {
  createSession,
  deleteSession,
  getSession,
  listDeletedSessions,
  listSessions,
  purgeSession,
  restoreSession,
  updateSession,
} from './db/repos/sessions.js';
import {
  createFocusTag,
  deleteTrainingLog,
  getTrainingLog,
  listAllTrainingLogs,
  listDeletedTrainingLogs,
  listFocusTags,
  listTrainingLogs,
  purgeTrainingLog,
  restoreTrainingLog,
  seedFocusTags,
  toDailyLog,
  upsertTrainingLog,
} from './db/repos/training-logs.js';
import type { IdGen } from './ids/ulid.js';
import { P2A_PIPELINES } from './jobs/pipelines.js';
import { createJobRunner, type JobRunner } from './jobs/runner.js';
import type { StepHandler } from './jobs/types.js';
import { addDaysIso } from './library/retention.js';
import { isSyncFolder } from './library/sync-folder.js';
import type { Clock } from './ports/clock.js';
import type { EventBus } from './ports/events.js';
import type { Logger } from './ports/logger.js';
import type { AppDatabase, SqlExecutor, SqliteBackup } from './ports/sql.js';

export type CoreDeps = {
  db: AppDatabase;
  sql: SqlExecutor;
  clock: Clock;
  ids: IdGen;
  events: EventBus;
  logger: Logger;
  backup?: SqliteBackup;
  ffmpegAvailable?: boolean;
  poseAvailable?: boolean;
  cpuCores?: number;
};

function toSettings(stored: ReturnType<typeof readSettings>): Settings {
  return {
    ...stored,
    libraryReady: stored.libraryRoot !== null,
  };
}

function restoreTrash(db: AppDatabase, clock: Clock, kind: TrashKind, id: string): void {
  if (kind === 'gym') restoreGym(db, clock, id);
  else if (kind === 'boulder') restoreBoulder(db, clock, id);
  else if (kind === 'session') restoreSession(db, clock, id);
  else if (kind === 'training_log') restoreTrainingLog(db, clock, id);
  else throw new ProblemError('NOT_IMPLEMENTED', `restore ${kind} arrives in a later phase`);
}

function purgeTrash(db: AppDatabase, kind: TrashKind, id: string): void {
  if (kind === 'gym') purgeGym(db, id);
  else if (kind === 'boulder') purgeBoulder(db, id);
  else if (kind === 'session') purgeSession(db, id);
  else if (kind === 'training_log') purgeTrainingLog(db, id);
  else throw new ProblemError('NOT_IMPLEMENTED', `purge ${kind} arrives in a later phase`);
}

export function createCoreApi(deps: CoreDeps): CoachApi & { jobsRunner: JobRunner } {
  seedFocusTags(deps.db, deps.clock);

  const handlers: Record<string, StepHandler> = {
    'backup-db.backup': async () => {
      if (!deps.backup) throw new Error('backup adapter missing');
      const dest = `backup-${deps.clock.nowIso().replace(/[:.]/g, '-')}.db`;
      await deps.backup.backupTo(dest);
      return { dest };
    },
    'purge-trash.purge': async () => {
      const settings = readSettings(deps.db);
      const cutoff = addDaysIso(deps.clock.nowIso(), -settings.trashRetentionDays);
      let purged = 0;
      const sweep = (
        items: { id: string; deletedAt: string }[],
        purge: (id: string) => void,
      ): void => {
        for (const item of items) {
          if (item.deletedAt > cutoff) continue;
          purge(item.id);
          purged += 1;
        }
      };
      sweep(listDeletedGyms(deps.db), (id) => purgeGym(deps.db, id));
      sweep(listDeletedBoulders(deps.db), (id) => purgeBoulder(deps.db, id));
      sweep(listDeletedSessions(deps.db), (id) => purgeSession(deps.db, id));
      sweep(listDeletedTrainingLogs(deps.db), (id) => purgeTrainingLog(deps.db, id));
      return { purged };
    },
  };

  const jobsRunner = createJobRunner({
    db: deps.db,
    clock: deps.clock,
    ids: deps.ids,
    events: deps.events,
    pipelines: P2A_PIPELINES,
    handlers,
    ...(deps.cpuCores === undefined ? {} : { cpuCores: deps.cpuCores }),
  });

  const ffmpegAvailable = deps.ffmpegAvailable === true;
  const poseAvailable = deps.poseAvailable === true;

  const api: CoachApi = {
    system: {
      async health() {
        return defaultHealth({
          engineVersion: ENGINE_VERSION,
          status: ffmpegAvailable && poseAvailable ? 'ok' : 'degraded',
          ffmpeg: {
            available: ffmpegAvailable,
            version: null,
            note: ffmpegAvailable
              ? 'ffmpeg ready'
              : 'Shipped ffmpeg arrives in P0.8 (ADR-002); not bundled yet.',
          },
          pose: {
            available: poseAvailable,
            version: null,
            note: poseAvailable
              ? 'pose runtime ready'
              : 'Pose adapter arrives with ADR-001; not bundled yet.',
          },
        });
      },
      async getSettings() {
        return toSettings(readSettings(deps.db));
      },
      async updateSettings(patch) {
        if (patch.libraryRoot && isSyncFolder(patch.libraryRoot)) {
          throw new ProblemError(
            'VALIDATION_FAILED',
            'Library folder cannot live inside iCloud Drive, Dropbox, or another sync folder. Use a local folder (default: Movies/Climbing Coach Library) and move data with bundles.',
          );
        }
        return toSettings(writeSettings(deps.db, deps.clock, patch));
      },
    },
    gyms: {
      list: async (q) => listGyms(deps.db, q),
      create: async (input) => createGym(deps.db, deps.clock, deps.ids, input),
      get: async (id) => getGym(deps.db, id),
      update: async (id, patch) => updateGym(deps.db, deps.clock, id, patch),
      remove: async (id) => {
        deleteGym(deps.db, deps.clock, id);
      },
    },
    boulders: {
      list: async (q) => listBoulders(deps.db, q),
      create: async (input) =>
        createBoulder(deps.db, deps.clock, deps.ids, input, readSettings(deps.db).gradeSystem as GradeSystem),
      get: async (id) => getBoulder(deps.db, id),
      update: async (id, patch) =>
        updateBoulder(deps.db, deps.clock, id, patch, readSettings(deps.db).gradeSystem as GradeSystem),
      remove: async (id) => {
        deleteBoulder(deps.db, deps.clock, id);
      },
      progress: async () => [],
    },
    sessions: {
      list: async (q) => listSessions(deps.db, q),
      create: async (input) => createSession(deps.db, deps.clock, deps.ids, input),
      get: async (id) => getSession(deps.db, id),
      update: async (id, patch) => updateSession(deps.db, deps.clock, id, patch),
      remove: async (id) => {
        deleteSession(deps.db, deps.clock, id);
      },
    },
    trainingLogs: {
      list: async (range) => listTrainingLogs(deps.db, range.from, range.to),
      async get(date) {
        return { entry: getTrainingLog(deps.db, date), prefill: prefillTrainingLog(date, []) };
      },
      put: async (date, input) => upsertTrainingLog(deps.db, deps.clock, date, input),
      remove: async (date) => {
        deleteTrainingLog(deps.db, deps.clock, date);
      },
    },
    focusTags: {
      list: async () => listFocusTags(deps.db),
      create: async (input) => createFocusTag(deps.db, deps.clock, input.label),
    },
    stats: {
      trainingLoad: async (range, method = 'rolling') =>
        trainingLoad(listAllTrainingLogs(deps.db).map(toDailyLog), range, method),
      exertionVolume: async (range) =>
        exertionVolume(listTrainingLogs(deps.db, range.from, range.to).map(toDailyLog), range),
      focusDistribution: async (range, bucket) =>
        focusDistribution(listTrainingLogs(deps.db, range.from, range.to).map(toDailyLog), range, bucket),
      gradePyramid: async (range, discipline) =>
        gradePyramid(listTrainingLogs(deps.db, range.from, range.to).map(toDailyLog), range, discipline),
      weeklySummary: async (week) =>
        weeklySummary(
          listAllTrainingLogs(deps.db).map(toDailyLog),
          week,
          readSettings(deps.db).gradeSystem as GradeSystem,
        ),
    },
    trash: {
      async list() {
        const settings = readSettings(deps.db);
        const wrap = (kind: TrashKind, items: { id: string; title: string; deletedAt: string }[]) =>
          items.map((item) => ({
            kind,
            id: item.id,
            title: item.title,
            deletedAt: item.deletedAt,
            purgeAfterAt: addDaysIso(item.deletedAt, settings.trashRetentionDays),
          }));
        return [
          ...wrap('gym', listDeletedGyms(deps.db)),
          ...wrap('boulder', listDeletedBoulders(deps.db)),
          ...wrap('session', listDeletedSessions(deps.db)),
          ...wrap('training_log', listDeletedTrainingLogs(deps.db)),
        ];
      },
      restore: async (kind, id) => {
        restoreTrash(deps.db, deps.clock, kind, id);
      },
      purge: async (kind, id) => {
        purgeTrash(deps.db, kind, id);
      },
    },
    jobs: {
      list: async (q) => jobsRunner.list(q),
      get: async (id) => jobsRunner.get(id),
      cancel: async (id) => {
        jobsRunner.cancel(id);
      },
      retry: async (id) => jobsRunner.retry(id),
    },
    events: {
      subscribe: (handler) => deps.events.subscribe(handler),
    },
  };

  return Object.assign(api, { jobsRunner });
}
