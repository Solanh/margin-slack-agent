BEGIN;

DROP TRIGGER IF EXISTS oauth_connections_set_updated_at ON oauth_connections;
DROP TRIGGER IF EXISTS workspace_installations_set_updated_at ON workspace_installations;
DROP TRIGGER IF EXISTS reminders_set_updated_at ON reminders;
DROP TRIGGER IF EXISTS meetings_set_updated_at ON meetings;
DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;
DROP TRIGGER IF EXISTS notes_prevent_raw_text_update ON notes;

DROP TABLE IF EXISTS oauth_connections;
DROP TABLE IF EXISTS workspace_installations;
DROP TABLE IF EXISTS reminders;
DROP TABLE IF EXISTS note_revisions;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_meeting_owner_fk;
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_owner_identity;

DROP INDEX IF EXISTS notes_owner_meeting_idx;
DROP INDEX IF EXISTS notes_owner_status_created_at_idx;

ALTER TABLE notes
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS transformation_version,
  DROP COLUMN IF EXISTS context_confidence,
  DROP COLUMN IF EXISTS meeting_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS note_type,
  DROP COLUMN IF EXISTS organized_text;

DROP TABLE IF EXISTS meetings;
DROP FUNCTION IF EXISTS margin_prevent_raw_text_update();
DROP FUNCTION IF EXISTS margin_set_updated_at();

DELETE FROM schema_migrations
WHERE name = '002_expand_margin_schema.sql';

COMMIT;
