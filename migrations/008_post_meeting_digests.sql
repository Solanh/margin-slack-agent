CREATE TABLE IF NOT EXISTS user_notification_preferences (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  digests_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  resurfacing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_meeting_digests (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'snoozed', 'skipped')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  slack_channel_id TEXT,
  slack_message_ts TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT post_meeting_digests_meeting_owner_fk
    FOREIGN KEY (meeting_id, workspace_id, user_id)
    REFERENCES meetings (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT post_meeting_digests_owner_meeting_unique
    UNIQUE (meeting_id, workspace_id, user_id),
  CONSTRAINT post_meeting_digests_slack_reference_shape CHECK (
    (slack_channel_id IS NULL AND slack_message_ts IS NULL)
    OR
    (slack_channel_id IS NOT NULL AND slack_message_ts IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS post_meeting_digests_due_idx
  ON post_meeting_digests (scheduled_for)
  WHERE status IN ('pending', 'snoozed');

DROP TRIGGER IF EXISTS user_notification_preferences_set_updated_at
  ON user_notification_preferences;
CREATE TRIGGER user_notification_preferences_set_updated_at
BEFORE UPDATE ON user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS post_meeting_digests_set_updated_at
  ON post_meeting_digests;
CREATE TRIGGER post_meeting_digests_set_updated_at
BEFORE UPDATE ON post_meeting_digests
FOR EACH ROW EXECUTE FUNCTION margin_set_updated_at();
