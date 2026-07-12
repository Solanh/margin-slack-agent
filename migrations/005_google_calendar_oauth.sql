CREATE TABLE IF NOT EXISTS oauth_authorization_states (
  state_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_calendar')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_authorization_states_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS oauth_authorization_states_expiry_idx
  ON oauth_authorization_states (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS oauth_authorization_states_owner_idx
  ON oauth_authorization_states (workspace_id, user_id, provider, created_at DESC);
