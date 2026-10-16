ALTER TABLE videos ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE videos ADD COLUMN frame_count INTEGER;
ALTER TABLE videos ADD COLUMN avg_fps_milli INTEGER;
ALTER TABLE videos ADD COLUMN color_transfer TEXT;
ALTER TABLE videos ADD COLUMN dv_profile TEXT;
ALTER TABLE videos ADD COLUMN import_job_id TEXT;
