BEGIN;

DROP TRIGGER IF EXISTS retention_cleanup_jobs_set_updated_at
  ON retention_cleanup_jobs;
DROP INDEX IF EXISTS retention_cleanup_jobs_due_idx;
DROP TABLE IF EXISTS retention_cleanup_jobs;

ALTER TABLE user_notification_preferences
  DROP COLUMN IF EXISTS retention_days;

DELETE FROM schema_migrations
WHERE name = '011_user_data_controls.sql';

COMMIT;
