CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS climbers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  height_cm INTEGER,
  grade_system TEXT NOT NULL DEFAULT 'v',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS climbers_deleted_at ON climbers(deleted_at);

CREATE TABLE IF NOT EXISTS gyms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS gyms_deleted_at ON gyms(deleted_at);

CREATE TABLE IF NOT EXISTS boulders (
  id TEXT PRIMARY KEY,
  gym_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  difficulty_index INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT 'unknown',
  set_on TEXT,
  retired_on TEXT,
  wall_photo_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS boulders_gym_id ON boulders(gym_id);
CREATE INDEX IF NOT EXISTS boulders_deleted_at ON boulders(deleted_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  gym_id TEXT,
  date TEXT NOT NULL,
  tz_offset_min INTEGER NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS sessions_deleted_at ON sessions(deleted_at);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  session_id TEXT,
  discipline TEXT NOT NULL DEFAULT 'boulder',
  path TEXT NOT NULL,
  proxy_path TEXT,
  quick_hash TEXT,
  sha256 TEXT,
  duration_us INTEGER,
  display_width INTEGER,
  display_height INTEGER,
  rotation INTEGER NOT NULL DEFAULT 0,
  codec TEXT,
  is_hdr INTEGER NOT NULL DEFAULT 0,
  is_vfr INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT,
  review_state TEXT NOT NULL DEFAULT 'unreviewed',
  review_revision INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  source_video_id TEXT,
  source_start_us INTEGER,
  source_end_us INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS videos_quick_hash ON videos(quick_hash);
CREATE INDEX IF NOT EXISTS videos_session_id ON videos(session_id);
CREATE INDEX IF NOT EXISTS videos_deleted_at ON videos(deleted_at);

CREATE TABLE IF NOT EXISTS pose_tracks (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  runtime TEXT NOT NULL,
  model TEXT NOT NULL,
  model_version TEXT NOT NULL,
  sample_fps INTEGER NOT NULL,
  windows_json TEXT NOT NULL DEFAULT '[]',
  path TEXT NOT NULL,
  selected_track_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS pose_tracks_video_id ON pose_tracks(video_id);
CREATE INDEX IF NOT EXISTS pose_tracks_deleted_at ON pose_tracks(deleted_at);

CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  detector_version TEXT,
  detected_climb_start_us INTEGER,
  detected_climb_end_us INTEGER,
  detected_outcome TEXT,
  confidence INTEGER,
  derived_from_json TEXT NOT NULL DEFAULT '[]',
  climb_start_us INTEGER NOT NULL,
  climb_end_us INTEGER NOT NULL,
  pre_pad_us INTEGER NOT NULL,
  post_pad_us INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  boulder_id TEXT,
  proximity INTEGER,
  exertion INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  touched INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  attempt_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS review_items_video_status ON review_items(video_id, status);
CREATE INDEX IF NOT EXISTS review_items_deleted_at ON review_items(deleted_at);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  clip_video_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  boulder_id TEXT,
  discipline TEXT NOT NULL DEFAULT 'boulder',
  climb_start_us INTEGER NOT NULL,
  climb_end_us INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  outcome_source TEXT NOT NULL DEFAULT 'auto',
  fall_move_index INTEGER,
  proximity INTEGER,
  exertion INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL,
  rated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS attempts_boulder_recorded ON attempts(boulder_id, recorded_at);
CREATE INDEX IF NOT EXISTS attempts_session_id ON attempts(session_id);
CREATE INDEX IF NOT EXISTS attempts_deleted_at ON attempts(deleted_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS tags_deleted_at ON tags(deleted_at);

CREATE TABLE IF NOT EXISTS attempt_tags (
  attempt_id TEXT NOT NULL,
  tag_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS move_segments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  pose_track_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  idx INTEGER NOT NULL,
  limb TEXT NOT NULL,
  start_us INTEGER NOT NULL,
  end_us INTEGER NOT NULL,
  hold_x INTEGER,
  hold_y INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS move_segments_attempt_id ON move_segments(attempt_id);
CREATE INDEX IF NOT EXISTS move_segments_deleted_at ON move_segments(deleted_at);

CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  attempt_a_id TEXT NOT NULL,
  attempt_b_id TEXT NOT NULL,
  pose_model TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  options_hash TEXT NOT NULL,
  result_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS comparisons_deleted_at ON comparisons(deleted_at);

CREATE TABLE IF NOT EXISTS training_logs (
  date TEXT PRIMARY KEY,
  tz_offset_min INTEGER NOT NULL,
  session_exertion INTEGER,
  exertion_source TEXT NOT NULL DEFAULT 'user',
  boulder_count INTEGER NOT NULL DEFAULT 0,
  route_count INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER,
  session_type TEXT NOT NULL DEFAULT 'climbing',
  primary_focus_id TEXT,
  body_json TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS training_logs_deleted_at ON training_logs(deleted_at);

CREATE TABLE IF NOT EXISTS focus_tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS focus_tags_deleted_at ON focus_tags(deleted_at);

CREATE TABLE IF NOT EXISTS training_log_focus (
  date TEXT NOT NULL,
  focus_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_log_grades (
  date TEXT NOT NULL,
  discipline TEXT NOT NULL,
  grade TEXT NOT NULL,
  attempted INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_deleted INTEGER NOT NULL DEFAULT 0,
  predicted_json TEXT,
  final_json TEXT,
  delta_start_us INTEGER,
  delta_end_us INTEGER,
  source_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS labels_kind_created ON labels(kind, created_at);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  boulder_id TEXT NOT NULL,
  attempt_id TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  feedback TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS insights_deleted_at ON insights(deleted_at);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version_label TEXT NOT NULL,
  path TEXT NOT NULL,
  feature_spec_version TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'shadow',
  dataset_hash TEXT,
  trained_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS models_deleted_at ON models(deleted_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
