CREATE TABLE IF NOT EXISTS note_sources (
  id UUID PRIMARY KEY,
  note_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('mcp', 'slack_channel', 'slack_message')),
  channel_id TEXT,
  message_ts TEXT,
  permalink TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT note_sources_note_owner_fk
    FOREIGN KEY (note_id, workspace_id, user_id)
    REFERENCES notes (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT note_sources_shape CHECK (
    (source_type = 'mcp' AND channel_id IS NULL AND message_ts IS NULL)
    OR
    (source_type = 'slack_channel' AND channel_id IS NOT NULL AND message_ts IS NULL)
    OR
    (source_type = 'slack_message' AND channel_id IS NOT NULL AND message_ts IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS note_sources_identity_unique
  ON note_sources (
    note_id,
    workspace_id,
    user_id,
    source_type,
    COALESCE(channel_id, ''),
    COALESCE(message_ts, ''),
    COALESCE(permalink, '')
  );

CREATE INDEX IF NOT EXISTS note_sources_owner_note_idx
  ON note_sources (workspace_id, user_id, note_id, created_at ASC);

CREATE TABLE IF NOT EXISTS note_review_confirmations (
  note_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, workspace_id, user_id),
  CONSTRAINT note_review_confirmations_note_owner_fk
    FOREIGN KEY (note_id, workspace_id, user_id)
    REFERENCES notes (id, workspace_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS note_review_confirmations_owner_idx
  ON note_review_confirmations (workspace_id, user_id, confirmed_at DESC);
