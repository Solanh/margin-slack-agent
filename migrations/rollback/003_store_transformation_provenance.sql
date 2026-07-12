BEGIN;

ALTER TABLE note_revisions
  DROP COLUMN IF EXISTS explicit_due_at,
  DROP COLUMN IF EXISTS reminder_intent;

ALTER TABLE notes
  DROP COLUMN IF EXISTS uncertainties,
  DROP COLUMN IF EXISTS inferred_fields,
  DROP COLUMN IF EXISTS explicit_due_at,
  DROP COLUMN IF EXISTS reminder_intent;

DELETE FROM schema_migrations
WHERE name = '003_store_transformation_provenance.sql';

COMMIT;
