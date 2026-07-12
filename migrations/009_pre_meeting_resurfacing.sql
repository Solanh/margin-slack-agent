ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS series_key TEXT;

CREATE INDEX IF NOT EXISTS meetings_owner_series_time_idx
  ON meetings (workspace_id, user_id, series_key, starts_at DESC)
  WHERE series_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS meeting_series_preferences (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  series_key TEXT NOT NULL,
  resurfacing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id, series_key)
);

CREATE TABLE IF NOT EXISTS pre_meeting_resurfacings (
  id UUID PRIMARY KEY,
  upcoming_meeting_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  series_key TEXT NOT NULL,
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
  CONSTRAINT pre_meeting_resurfacings_meeting_owner_fk
    FOREIGN KEY (upcoming_meeting_id, workspace_id, user_id)
    REFERENCES meetings (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT pre_meeting_resurfacings_owner_event_unique
    UNIQUE (upcoming_meeting_id, workspace_id, user_id),
  CONSTRAINT pre_meeting_resurfacings_slack_reference_shape CHECK (
    (slack_channel_id IS NULL AND slack_message_ts IS NULL)
    OR
    (slack_channel_id IS NOT NULL AND slack_message_ts IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS pre_meeting_resurfacings_due_idx
  ON pre_meeting_resurfacings (scheduled_for)
  WHERE status IN ('pending', 'snoozed');

DROP TRIGGER IF EXISTS meeting_series_preferences_set_updated_at
  ON meeting_series_preferences;
CREATE TRIGGER meeting_series_preferences_set_updated_at
BEFORE UPDATE ON meeting_series_preferences
FOR EACH ROW EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS pre_meeting_resurfacings_set_updated_at
  ON pre_meeting_resurfacings;
CREATE TRIGGER pre_meeting_resurfacings_set_updated_at
BEFORE UPDATE ON pre_meeting_resurfacings
FOR EACH ROW EXECUTE FUNCTION margin_set_updated_at();
