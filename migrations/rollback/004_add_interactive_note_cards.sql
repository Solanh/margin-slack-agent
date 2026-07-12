BEGIN;

DROP INDEX IF EXISTS notes_card_reference_idx;

ALTER TABLE note_revisions
  DROP COLUMN IF EXISTS display_mode;

ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_card_reference_shape,
  DROP COLUMN IF EXISTS card_message_ts,
  DROP COLUMN IF EXISTS card_channel_id,
  DROP COLUMN IF EXISTS display_mode;

DELETE FROM schema_migrations
WHERE name = '004_add_interactive_note_cards.sql';

COMMIT;
