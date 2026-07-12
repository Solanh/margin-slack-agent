BEGIN;

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_channel_id TEXT NOT NULL,
  source_message_ts TEXT NOT NULL,
  raw_text TEXT NOT NULL CHECK (length(raw_text) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notes_slack_message_unique
    UNIQUE (workspace_id, user_id, source_message_ts)
);

CREATE INDEX IF NOT EXISTS notes_owner_created_at_idx
  ON notes (workspace_id, user_id, created_at DESC);

COMMIT;
