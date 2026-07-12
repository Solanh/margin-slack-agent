BEGIN;

DROP TABLE IF EXISTS notes;

DELETE FROM schema_migrations
WHERE name = '001_create_raw_notes.sql';

COMMIT;
