ALTER TABLE comparisons ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE comparisons ADD COLUMN job_id TEXT;
ALTER TABLE comparisons ADD COLUMN error TEXT;
ALTER TABLE comparisons ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE comparisons ADD COLUMN sides_json TEXT NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS comparisons_cache_key
  ON comparisons(attempt_a_id, attempt_b_id, pose_model, engine_version, options_hash)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS labels_subject_id ON labels(subject_id);
