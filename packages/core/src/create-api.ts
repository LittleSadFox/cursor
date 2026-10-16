import type { CoachApi } from '@climbing-coach/api';

import { seedFocusTags } from './db/repos/focus-tags.js';
import { readSettings } from './db/repos/settings.js';
import type { IdGen } from './ids/ulid.js';
import { compareHandlers } from './jobs/compare-handlers.js';
import { maintenanceHandlers } from './jobs/handlers.js';
import { CORE_PIPELINES } from './jobs/pipelines.js';
import { createJobRunner, type JobRunner } from './jobs/runner.js';
import type { BlobStore } from './ports/blobs.js';
import type { Clock } from './ports/clock.js';
import type { EventBus } from './ports/events.js';
import type { Logger } from './ports/logger.js';
import type { AppDatabase, SqlExecutor, SqliteBackup } from './ports/sql.js';
import { createCatalogService } from './services/catalog.js';
import { createComparisonService } from './services/comparisons.js';
import { createStatsService } from './services/stats.js';
import { createSystemService } from './services/system.js';
import { createTrainingService } from './services/training.js';
import { createTrashService } from './services/trash.js';
import { createVideoService } from './services/videos.js';

export type CoreDeps = {
  db: AppDatabase;
  sql: SqlExecutor;
  clock: Clock;
  ids: IdGen;
  events: EventBus;
  logger: Logger;
  backup?: SqliteBackup;
  /** Library files (pose tracks, comparison results). Absent → those endpoints are NOT_FOUND. */
  blobs?: BlobStore;
  ffmpegAvailable?: boolean;
  poseAvailable?: boolean;
  cpuCores?: number;
  onLibraryRootChange?: (root: string | null) => void;
};

/** Composes the core services into the CoachApi (BUILD_PLAN §3.2). Requeues orphaned job steps on start. */
export function createCoreApi(deps: CoreDeps): CoachApi & { jobsRunner: JobRunner } {
  const { db, clock } = deps;
  seedFocusTags(db, clock);

  const trash = createTrashService(db, clock, () => readSettings(db).trashRetentionDays);
  const jobsRunner = createJobRunner({
    db,
    clock,
    ids: deps.ids,
    events: deps.events,
    pipelines: CORE_PIPELINES,
    handlers: {
      ...maintenanceHandlers({ backup: deps.backup, trash }),
      ...compareHandlers({ db, clock, events: deps.events, blobs: deps.blobs }),
    },
    cpuCores: deps.cpuCores,
  });
  const recovered = jobsRunner.recover();
  if (recovered > 0) deps.logger.warn({ recovered }, 'requeued job steps interrupted by a restart');

  return {
    system: createSystemService({
      db,
      clock,
      ffmpegAvailable: deps.ffmpegAvailable === true,
      poseAvailable: deps.poseAvailable === true,
      onLibraryRootChange: deps.onLibraryRootChange,
    }),
    ...createCatalogService({ db, clock, ids: deps.ids }),
    ...createTrainingService(db, clock),
    stats: createStatsService(db),
    trash,
    videos: createVideoService({ db, blobs: deps.blobs }),
    comparisons: createComparisonService({
      db,
      clock,
      ids: deps.ids,
      runner: jobsRunner,
      blobs: deps.blobs,
      ffmpegAvailable: deps.ffmpegAvailable === true,
    }),
    jobs: {
      list: async (q) => jobsRunner.list(q),
      get: async (id) => jobsRunner.get(id),
      cancel: async (id) => jobsRunner.cancel(id),
      retry: async (id) => jobsRunner.retry(id),
    },
    events: { subscribe: (handler) => deps.events.subscribe(handler) },
    jobsRunner,
  };
}
