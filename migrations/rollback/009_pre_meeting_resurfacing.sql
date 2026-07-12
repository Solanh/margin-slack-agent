BEGIN;

DROP TRIGGER IF EXISTS pre_meeting_resurfacings_set_updated_at ON pre_meeting_resurfacings;
DROP TRIGGER IF EXISTS meeting_series_preferences_set_updated_at ON meeting_series_preferences;
DROP INDEX IF EXISTS pre_meeting_resurfacings_due_idx;
DROP TABLE IF EXISTS pre_meeting_resurfacings;
DROP TABLE IF EXISTS meeting_series_preferences;
DROP INDEX IF EXISTS meetings_owner_series_time_idx;
ALTER TABLE meetings DROP COLUMN IF EXISTS series_key;

DELETE FROM schema_migrations
WHERE name = '009_pre_meeting_resurfacing.sql';

COMMIT;
