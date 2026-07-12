BEGIN;

DROP TRIGGER IF EXISTS note_context_candidates_set_updated_at ON note_context_candidates;
DROP INDEX IF EXISTS note_context_candidates_selected_idx;
DROP INDEX IF EXISTS note_context_candidates_rank_idx;
DROP INDEX IF EXISTS note_context_candidates_identity_idx;
DROP TABLE IF EXISTS note_context_candidates;

ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_context_resolution_shape,
  DROP COLUMN IF EXISTS context_resolution_status,
  DROP COLUMN IF EXISTS context_source;

DELETE FROM schema_migrations
WHERE name = '007_context_resolution.sql';

COMMIT;
