import type { CoachApi } from '@climbing-coach/api';

import { seedFocusTags } from './db/repos/focus-tags.js';
import { readSettings } from './db/repos/settings.js';
import type { IdGen } from './ids/ulid.js';
import { compareHandlers } from './jobs/compare-handlers.js';
import { maintenanceHandlers } from './jobs/handlers.js';
import { CORE_PIPELINES } from './jobs/pipelines.js';
import { recordingHandlers } from './jobs/recording-handlers.js';
import { createJobRunner, type JobRunner } from './jobs/runner.js';
import type { BlobStore } from './ports/blobs.js';
import type { Clock } from './ports/clock.js';
import type { EventBus } from './ports/events.js';
import type { Logger } from './ports/logger.js';
import type { MediaFiles } from './ports/media-files.js';
import type { PoseExtractor } from './ports/pose.js';
import type { AppDatabase, SqlExecutor, SqliteBackup } from './ports/sql.js';
import type { VideoTools } from './ports/video.js';
import { createRecordingService } from './recordings/service.js';
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
  ffmpegVersion?: string | null;
  ffmpegNote?: string;
  poseAvailable?: boolean;
  poseVersion?: string | null;
  poseNote?: string;
  pose?: PoseExtractor | undefined;
  video?: VideoTools | undefined;
  mediaFiles?: MediaFiles | undefined;
  mediaUrl?: ((videoId: string, variant: 'original' | 'proxy') => string) | undefined;
  cpuCores?: number;
  onLibraryRootChange?: (root: string | null) => void;
};

/** Composes the core services into the CoachApi (BUILD_PLAN §3.2). Requeues orphaned job steps on start. */
export function createCoreApi(deps: CoreDeps): CoachApi & {
  jobsRunner: JobRunner;
  resolveMedia: ReturnType<typeof createRecordingService>['mediaFile'];
} {
  const { db, clock } = deps;
  seedFocusTags(db, clock);

  const trash = createTrashService(db, clock, () => readSettings(db).trashRetentionDays);
  const canProcess = deps.video?.ready() === true && deps.mediaFiles !== undefined;
  const jobsRunner = createJobRunner({
    db,
    clock,
    ids: deps.ids,
    events: deps.events,
    pipelines: CORE_PIPELINES,
    handlers: {
      ...maintenanceHandlers({ backup: deps.backup, trash }),
      ...compareHandlers({ db, clock, events: deps.events, blobs: deps.blobs }),
      ...(canProcess && deps.video && deps.mediaFiles
        ? recordingHandlers({
            db,
            clock,
            video: deps.video,
            files: deps.mediaFiles,
            pose: deps.pose,
            blobs: deps.blobs,
            ids: deps.ids,
          })
        : {}),
    },
    cpuCores: deps.cpuCores,
  });
  const recovered = jobsRunner.recover();
  if (recovered > 0) deps.logger.warn({ recovered }, 'requeued job steps interrupted by a restart');

  const recordings = createRecordingService({
    db,
    clock,
    ids: deps.ids,
    runner: jobsRunner,
    video: deps.video,
    files: deps.mediaFiles,
    mediaUrl: deps.mediaUrl,
  });

  return {
    system: createSystemService({
      db,
      clock,
      ffmpegAvailable: deps.ffmpegAvailable === true,
      poseAvailable: deps.poseAvailable === true,
      onLibraryRootChange: deps.onLibraryRootChange,
      ...(deps.ffmpegVersion !== undefined ? { ffmpegVersion: deps.ffmpegVersion } : {}),
      ...(deps.ffmpegNote !== undefined ? { ffmpegNote: deps.ffmpegNote } : {}),
      ...(deps.poseVersion !== undefined ? { poseVersion: deps.poseVersion } : {}),
      ...(deps.poseNote !== undefined ? { poseNote: deps.poseNote } : {}),
    }),
    ...createCatalogService({ db, clock, ids: deps.ids }),
    ...createTrainingService(db, clock),
    stats: createStatsService(db),
    trash,
    videos: createVideoService({ db, blobs: deps.blobs }),
    recordings,
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
    resolveMedia: recordings.mediaFile,
  };
}
