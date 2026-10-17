import type {
  Boulder,
  BoulderInput,
  BoulderListQuery,
  BoulderPatch,
  ProgressPoint,
} from './boulders.js';
import type { Accepted, Id, ListQuery, Page } from './common.js';
import type {
  AlignmentFeedback,
  Comparison,
  ComparisonExportInput,
  ComparisonInput,
  VideoPoseQuery,
} from './comparisons.js';
import type { CoachEvent, EventHandler } from './events.js';
import type { Gym, GymInput, GymListQuery, GymPatch } from './gyms.js';
import type { HealthResponse } from './health.js';
import type { Job, JobQuery } from './jobs.js';
import type { Recording, RecordingAccepted, RecordingCut, RecordingImport } from './recordings.js';
import type { ReviewItem } from './review.js';
import type { Session, SessionInput, SessionListQuery, SessionPatch } from './sessions.js';
import type { Settings, SettingsPatch } from './settings.js';
import type {
  ExertionVolumePoint,
  FocusBucket,
  GradeCount,
  TrainingLoadSeries,
  WeeklySummary,
} from './stats.js';
import type { TrashItem, TrashKind } from './trash.js';
import type { FocusTag, TrainingLog, TrainingLogDay, TrainingLogInput } from './training-logs.js';

export type Crud<T, Input, Patch, ListQ extends ListQuery = ListQuery> = {
  list(q?: ListQ): Promise<Page<T>>;
  create(input: Input): Promise<T>;
  get(id: Id): Promise<T>;
  update(id: Id, patch: Patch): Promise<T>;
  remove(id: Id): Promise<void>;
};

/**
 * Public application surface (BUILD_PLAN §4.6).
 * Video ingest covers import, probe, hash, proxy, cut, activity windows, detection pose,
 * and proposed climbs. Filmstrip, loupe, and commit-to-attempt stay later.
 * Comparisons (P3.2) work on
 * attempts that already have HQ pose tracks; export throws FFMPEG_UNAVAILABLE until P3.6.
 */
export type CoachApi = {
  system: {
    health(): Promise<HealthResponse>;
    getSettings(): Promise<Settings>;
    updateSettings(patch: SettingsPatch): Promise<Settings>;
  };
  gyms: Crud<Gym, GymInput, GymPatch, GymListQuery>;
  boulders: Crud<Boulder, BoulderInput, BoulderPatch, BoulderListQuery> & {
    progress(id: Id): Promise<ProgressPoint[]>;
  };
  sessions: Crud<Session, SessionInput, SessionPatch, SessionListQuery>;
  trainingLogs: {
    list(range: { from: string; to: string }): Promise<TrainingLog[]>;
    get(date: string): Promise<TrainingLogDay>;
    put(date: string, input: TrainingLogInput): Promise<TrainingLog>;
    remove(date: string): Promise<void>;
  };
  focusTags: {
    list(): Promise<FocusTag[]>;
    create(input: { label: string }): Promise<FocusTag>;
  };
  stats: {
    trainingLoad(
      range: { from: string; to: string },
      method?: 'rolling' | 'ewma',
    ): Promise<TrainingLoadSeries>;
    exertionVolume(range: { from: string; to: string }): Promise<ExertionVolumePoint[]>;
    focusDistribution(
      range: { from: string; to: string },
      bucket: 'week' | 'month',
    ): Promise<FocusBucket[]>;
    gradePyramid(
      range: { from: string; to: string },
      discipline: 'boulder' | 'route',
    ): Promise<GradeCount[]>;
    weeklySummary(week: string): Promise<WeeklySummary>;
  };
  trash: {
    list(): Promise<TrashItem[]>;
    restore(kind: TrashKind, id: string): Promise<void>;
    purge(kind: TrashKind, id: string): Promise<void>;
  };
  videos: {
    /** posebin bytes for the video's pose track, sliced to `[fromUs, toUs)`. */
    pose(id: Id, q?: VideoPoseQuery): Promise<Uint8Array>;
  };
  recordings: {
    list(): Promise<Recording[]>;
    get(id: Id): Promise<Recording>;
    /** Copy, move, or reference a file already on disk. Returns before probe and proxy finish. */
    importPath(input: RecordingImport): Promise<RecordingAccepted>;
    cut(id: Id, input: RecordingCut): Promise<RecordingAccepted>;
    /** Detector proposals for one recording, oldest climb first. */
    review(id: Id): Promise<ReviewItem[]>;
  };
  comparisons: {
    /** Cached result (`ready`) or a `pending` comparison carrying the `compare` job id. */
    create(input: ComparisonInput): Promise<Comparison>;
    get(id: Id): Promise<Comparison>;
    /** Int32 `[steps × 2]`: clip-time microseconds of A and B per warp step. */
    warp(id: Id): Promise<Int32Array>;
    /** Float32 `[steps × channels.length]`. */
    divergence(id: Id): Promise<Float32Array>;
    feedback(id: Id, feedback: AlignmentFeedback): Promise<void>;
    export(id: Id, input: ComparisonExportInput): Promise<Accepted>;
  };
  jobs: {
    list(q?: JobQuery): Promise<Job[]>;
    get(id: Id): Promise<Job>;
    cancel(id: Id): Promise<void>;
    retry(id: Id): Promise<Accepted>;
  };
  events: {
    subscribe(handler: EventHandler): () => void;
  };
};

export type { CoachEvent, EventHandler };
