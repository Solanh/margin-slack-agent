CREATE TABLE IF NOT EXISTS slack_huddle_states (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  call_id TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source_event_ts TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT slack_huddle_states_time_order CHECK (expires_at > observed_at)
);

CREATE INDEX IF NOT EXISTS slack_huddle_states_expiry_idx
  ON slack_huddle_states (expires_at);

CREATE TABLE IF NOT EXISTS slack_active_contexts (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('channel', 'message')),
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source_event_ts TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT slack_active_contexts_time_order CHECK (expires_at > observed_at),
  CONSTRAINT slack_active_contexts_shape CHECK (
    (entity_type = 'channel' AND message_ts IS NULL)
    OR
    (entity_type = 'message' AND message_ts IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS slack_active_contexts_expiry_idx
  ON slack_active_contexts (expires_at);

DROP TRIGGER IF EXISTS slack_huddle_states_set_updated_at ON slack_huddle_states;
CREATE TRIGGER slack_huddle_states_set_updated_at
BEFORE UPDATE ON slack_huddle_states
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS slack_active_contexts_set_updated_at ON slack_active_contexts;
CREATE TRIGGER slack_active_contexts_set_updated_at
BEFORE UPDATE ON slack_active_contexts
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();
