import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

export const climbers = sqliteTable(
  'climbers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    heightCm: integer('height_cm'),
    gradeSystem: text('grade_system').notNull().default('v'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('climbers_deleted_at').on(t.deletedAt)],
);

export const gyms = sqliteTable(
  'gyms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    notes: text('notes').notNull().default(''),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('gyms_deleted_at').on(t.deletedAt)],
);

export const boulders = sqliteTable(
  'boulders',
  {
    id: text('id').primaryKey(),
    gymId: text('gym_id').notNull(),
    name: text('name').notNull(),
    grade: text('grade').notNull(),
    difficultyIndex: integer('difficulty_index').notNull(),
    color: text('color').notNull().default('unknown'),
    setOn: text('set_on'),
    retiredOn: text('retired_on'),
    wallPhotoPath: text('wall_photo_path'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('boulders_gym_id').on(t.gymId), index('boulders_deleted_at').on(t.deletedAt)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    gymId: text('gym_id'),
    date: text('date').notNull(),
    tzOffsetMin: integer('tz_offset_min').notNull(),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('sessions_date').on(t.date), index('sessions_deleted_at').on(t.deletedAt)],
);

export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    sessionId: text('session_id'),
    discipline: text('discipline').notNull().default('boulder'),
    path: text('path').notNull(),
    proxyPath: text('proxy_path'),
    quickHash: text('quick_hash'),
    sha256: text('sha256'),
    durationUs: integer('duration_us'),
    displayWidth: integer('display_width'),
    displayHeight: integer('display_height'),
    rotation: integer('rotation').notNull().default(0),
    codec: text('codec'),
    isHdr: integer('is_hdr').notNull().default(0),
    isVfr: integer('is_vfr').notNull().default(0),
    recordedAt: text('recorded_at'),
    reviewState: text('review_state').notNull().default('unreviewed'),
    reviewRevision: integer('review_revision').notNull().default(0),
    warningsJson: text('warnings_json').notNull().default('[]'),
    sourceVideoId: text('source_video_id'),
    sourceStartUs: integer('source_start_us'),
    sourceEndUs: integer('source_end_us'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('videos_quick_hash').on(t.quickHash),
    index('videos_session_id').on(t.sessionId),
    index('videos_deleted_at').on(t.deletedAt),
  ],
);

export const poseTracks = sqliteTable(
  'pose_tracks',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id').notNull(),
    kind: text('kind').notNull(),
    runtime: text('runtime').notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version').notNull(),
    sampleFps: integer('sample_fps').notNull(),
    windowsJson: text('windows_json').notNull().default('[]'),
    path: text('path').notNull(),
    selectedTrackId: integer('selected_track_id'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('pose_tracks_video_id').on(t.videoId),
    index('pose_tracks_deleted_at').on(t.deletedAt),
  ],
);

export const reviewItems = sqliteTable(
  'review_items',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id').notNull(),
    origin: text('origin').notNull(),
    detectorVersion: text('detector_version'),
    detectedClimbStartUs: integer('detected_climb_start_us'),
    detectedClimbEndUs: integer('detected_climb_end_us'),
    detectedOutcome: text('detected_outcome'),
    confidence: real('confidence'),
    derivedFromJson: text('derived_from_json').notNull().default('[]'),
    climbStartUs: integer('climb_start_us').notNull(),
    climbEndUs: integer('climb_end_us').notNull(),
    prePadUs: integer('pre_pad_us').notNull(),
    postPadUs: integer('post_pad_us').notNull(),
    outcome: text('outcome').notNull(),
    boulderId: text('boulder_id'),
    proximity: integer('proximity'),
    exertion: integer('exertion'),
    tagsJson: text('tags_json').notNull().default('[]'),
    touched: integer('touched').notNull().default(0),
    status: text('status').notNull().default('draft'),
    attemptId: text('attempt_id'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('review_items_video_status').on(t.videoId, t.status),
    index('review_items_deleted_at').on(t.deletedAt),
  ],
);

export const attempts = sqliteTable(
  'attempts',
  {
    id: text('id').primaryKey(),
    clipVideoId: text('clip_video_id').notNull(),
    sessionId: text('session_id').notNull(),
    boulderId: text('boulder_id'),
    discipline: text('discipline').notNull().default('boulder'),
    climbStartUs: integer('climb_start_us').notNull(),
    climbEndUs: integer('climb_end_us').notNull(),
    outcome: text('outcome').notNull(),
    outcomeSource: text('outcome_source').notNull().default('auto'),
    fallMoveIndex: integer('fall_move_index'),
    proximity: integer('proximity'),
    exertion: integer('exertion'),
    notes: text('notes').notNull().default(''),
    recordedAt: text('recorded_at').notNull(),
    ratedAt: text('rated_at'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('attempts_boulder_recorded').on(t.boulderId, t.recordedAt),
    index('attempts_session_id').on(t.sessionId),
    index('attempts_deleted_at').on(t.deletedAt),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    builtin: integer('builtin').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('tags_deleted_at').on(t.deletedAt)],
);

export const attemptTags = sqliteTable(
  'attempt_tags',
  {
    attemptId: text('attempt_id').notNull(),
    tagId: text('tag_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.tagId] }),
    index('attempt_tags_tag_id').on(t.tagId),
  ],
);

export const moveSegments = sqliteTable(
  'move_segments',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id').notNull(),
    poseTrackId: text('pose_track_id').notNull(),
    engineVersion: text('engine_version').notNull(),
    index: integer('idx').notNull(),
    limb: text('limb').notNull(),
    startUs: integer('start_us').notNull(),
    endUs: integer('end_us').notNull(),
    holdX: real('hold_x'),
    holdY: real('hold_y'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('move_segments_attempt_id').on(t.attemptId),
    index('move_segments_deleted_at').on(t.deletedAt),
  ],
);

export const comparisons = sqliteTable(
  'comparisons',
  {
    id: text('id').primaryKey(),
    attemptAId: text('attempt_a_id').notNull(),
    attemptBId: text('attempt_b_id').notNull(),
    poseModel: text('pose_model').notNull(),
    engineVersion: text('engine_version').notNull(),
    optionsHash: text('options_hash').notNull(),
    resultPath: text('result_path'),
    summaryJson: text('summary_json').notNull().default('{}'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('comparisons_deleted_at').on(t.deletedAt)],
);

export const trainingLogs = sqliteTable(
  'training_logs',
  {
    date: text('date').primaryKey(),
    tzOffsetMin: integer('tz_offset_min').notNull(),
    sessionExertion: integer('session_exertion'),
    exertionSource: text('exertion_source').notNull().default('user'),
    boulderCount: integer('boulder_count').notNull().default(0),
    routeCount: integer('route_count').notNull().default(0),
    durationMin: integer('duration_min'),
    sessionType: text('session_type').notNull().default('climbing'),
    primaryFocusId: text('primary_focus_id'),
    bodyJson: text('body_json'),
    notes: text('notes').notNull().default(''),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('training_logs_deleted_at').on(t.deletedAt)],
);

export const focusTags = sqliteTable(
  'focus_tags',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    builtin: integer('builtin').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('focus_tags_deleted_at').on(t.deletedAt)],
);

export const trainingLogFocus = sqliteTable(
  'training_log_focus',
  {
    date: text('date').notNull(),
    focusId: text('focus_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.focusId] })],
);

export const trainingLogGrades = sqliteTable(
  'training_log_grades',
  {
    date: text('date').notNull(),
    discipline: text('discipline').notNull(),
    grade: text('grade').notNull(),
    attempted: integer('attempted').notNull().default(0),
    sent: integer('sent').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.date, t.discipline, t.grade] })],
);

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    subjectId: text('subject_id').notNull(),
    subjectDeleted: integer('subject_deleted').notNull().default(0),
    predictedJson: text('predicted_json'),
    finalJson: text('final_json'),
    deltaStartUs: integer('delta_start_us'),
    deltaEndUs: integer('delta_end_us'),
    sourceVersion: text('source_version').notNull(),
    ...timestamps,
  },
  (t) => [index('labels_kind_created').on(t.kind, t.createdAt)],
);

export const insights = sqliteTable(
  'insights',
  {
    id: text('id').primaryKey(),
    boulderId: text('boulder_id').notNull(),
    attemptId: text('attempt_id'),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    evidenceJson: text('evidence_json').notNull().default('{}'),
    sourceVersion: text('source_version').notNull(),
    feedback: text('feedback'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [index('insights_deleted_at').on(t.deletedAt)],
);

export const models = sqliteTable(
  'models',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    versionLabel: text('version_label').notNull(),
    path: text('path').notNull(),
    featureSpecVersion: text('feature_spec_version').notNull(),
    metricsJson: text('metrics_json').notNull().default('{}'),
    status: text('status').notNull().default('shadow'),
    datasetHash: text('dataset_hash'),
    trainedAt: text('trained_at'),
    ...timestamps,
  },
  (t) => [index('models_deleted_at').on(t.deletedAt)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    stepsJson: text('steps_json').notNull(),
    progress: integer('progress').notNull().default(0),
    payloadJson: text('payload_json').notNull().default('{}'),
    resultJson: text('result_json'),
    error: text('error'),
    attempt: integer('attempt').notNull().default(0),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (t) => [index('jobs_status_created').on(t.status, t.createdAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const schemaMigrations = sqliteTable('schema_migrations', {
  id: text('id').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});
