BEGIN;

DROP INDEX IF EXISTS meetings_owner_retrieval_title_idx;
DROP INDEX IF EXISTS notes_owner_retrieval_filters_idx;
DROP INDEX IF EXISTS notes_owner_retrieval_text_idx;

DELETE FROM schema_migrations
WHERE name = '010_private_note_retrieval.sql';

COMMIT;
