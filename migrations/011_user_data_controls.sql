ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS retention_days INTEGER
    CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650);

CREATE TABLE IF NOT EXISTS retention_cleanup_jobs (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'failed')),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_completed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT retention_cleanup_jobs_preferences_fk
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES user_notification_preferences (workspace_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS retention_cleanup_jobs_due_idx
  ON retention_cleanup_jobs (next_run_at)
  WHERE status IN ('pending', 'failed');

DROP TRIGGER IF EXISTS retention_cleanup_jobs_set_updated_at
  ON retention_cleanup_jobs;
CREATE TRIGGER retention_cleanup_jobs_set_updated_at
BEFORE UPDATE ON retention_cleanup_jobs
FOR EACH ROW EXECUTE FUNCTION margin_set_updated_at();
