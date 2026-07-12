ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'organized'
    CHECK (display_mode IN ('organized', 'verbatim')),
  ADD COLUMN IF NOT EXISTS card_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS card_message_ts TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_card_reference_shape'
      AND conrelid = 'notes'::regclass
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_card_reference_shape CHECK (
        (card_channel_id IS NULL AND card_message_ts IS NULL)
        OR
        (card_channel_id IS NOT NULL AND card_message_ts IS NOT NULL)
      );
  END IF;
END;
$$;

ALTER TABLE note_revisions
  ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'organized'
    CHECK (display_mode IN ('organized', 'verbatim'));

CREATE INDEX IF NOT EXISTS notes_card_reference_idx
  ON notes (workspace_id, user_id, card_channel_id, card_message_ts)
  WHERE card_channel_id IS NOT NULL AND card_message_ts IS NOT NULL;
