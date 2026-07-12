CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL
    CHECK (provider IN ('google_calendar', 'slack_huddle', 'explicit')),
  provider_event_id TEXT,
  title TEXT NOT NULL CHECK (length(title) > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(participants) = 'array'),
  context_confidence TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (context_confidence IN ('exact', 'high', 'medium', 'low', 'unresolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meetings_time_order CHECK (ends_at > starts_at),
  CONSTRAINT meetings_owner_identity UNIQUE (id, workspace_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS meetings_provider_event_unique
  ON meetings (workspace_id, user_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_owner_time_idx
  ON meetings (workspace_id, user_id, starts_at DESC);

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS organized_text TEXT,
  ADD COLUMN IF NOT EXISTS note_type TEXT
    CHECK (note_type IN ('decision', 'action', 'question', 'idea', 'reference')),
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'archived')),
  ADD COLUMN IF NOT EXISTS meeting_id UUID,
  ADD COLUMN IF NOT EXISTS context_confidence TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (context_confidence IN ('exact', 'high', 'medium', 'low', 'unresolved')),
  ADD COLUMN IF NOT EXISTS transformation_version TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_owner_identity'
      AND conrelid = 'notes'::regclass
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_owner_identity
      UNIQUE (id, workspace_id, user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_meeting_owner_fk'
      AND conrelid = 'notes'::regclass
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_meeting_owner_fk
      FOREIGN KEY (meeting_id, workspace_id, user_id)
      REFERENCES meetings (id, workspace_id, user_id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS notes_owner_status_created_at_idx
  ON notes (workspace_id, user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notes_owner_meeting_idx
  ON notes (workspace_id, user_id, meeting_id)
  WHERE meeting_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS note_revisions (
  id UUID PRIMARY KEY,
  note_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision_source TEXT NOT NULL
    CHECK (revision_source IN ('user', 'ai', 'system')),
  organized_text TEXT,
  note_type TEXT
    CHECK (note_type IN ('decision', 'action', 'question', 'idea', 'reference')),
  priority TEXT
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  status TEXT
    CHECK (status IN ('open', 'resolved', 'archived')),
  transformation_version TEXT,
  inferred_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(inferred_fields) = 'array'),
  uncertainties JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(uncertainties) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT note_revisions_note_owner_fk
    FOREIGN KEY (note_id, workspace_id, user_id)
    REFERENCES notes (id, workspace_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS note_revisions_note_created_at_idx
  ON note_revisions (workspace_id, user_id, note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY,
  note_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL
    CHECK (reminder_type IN ('fixed', 'event_relative')),
  scheduled_for TIMESTAMPTZ,
  relative_rule JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'snoozed', 'cancelled')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reminders_note_owner_fk
    FOREIGN KEY (note_id, workspace_id, user_id)
    REFERENCES notes (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT reminders_schedule_shape CHECK (
    (reminder_type = 'fixed' AND scheduled_for IS NOT NULL AND relative_rule IS NULL)
    OR
    (
      reminder_type = 'event_relative'
      AND scheduled_for IS NULL
      AND relative_rule IS NOT NULL
      AND jsonb_typeof(relative_rule) = 'object'
    )
  )
);

CREATE INDEX IF NOT EXISTS reminders_pending_schedule_idx
  ON reminders (scheduled_for)
  WHERE status = 'pending' AND scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS reminders_owner_note_idx
  ON reminders (workspace_id, user_id, note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_installations (
  workspace_id TEXT PRIMARY KEY,
  bot_user_id TEXT NOT NULL,
  installed_by_user_id TEXT NOT NULL,
  bot_token_ciphertext TEXT NOT NULL,
  encryption_key_version INTEGER NOT NULL DEFAULT 1
    CHECK (encryption_key_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_calendar')),
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  encryption_key_version INTEGER NOT NULL DEFAULT 1
    CHECK (encryption_key_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_connections_owner_provider_unique
    UNIQUE (workspace_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS oauth_connections_owner_idx
  ON oauth_connections (workspace_id, user_id);

CREATE OR REPLACE FUNCTION margin_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION margin_prevent_raw_text_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.raw_text IS DISTINCT FROM OLD.raw_text THEN
    RAISE EXCEPTION 'notes.raw_text is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_prevent_raw_text_update ON notes;
CREATE TRIGGER notes_prevent_raw_text_update
BEFORE UPDATE OF raw_text ON notes
FOR EACH ROW
EXECUTE FUNCTION margin_prevent_raw_text_update();

DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;
CREATE TRIGGER notes_set_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS meetings_set_updated_at ON meetings;
CREATE TRIGGER meetings_set_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS reminders_set_updated_at ON reminders;
CREATE TRIGGER reminders_set_updated_at
BEFORE UPDATE ON reminders
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS workspace_installations_set_updated_at ON workspace_installations;
CREATE TRIGGER workspace_installations_set_updated_at
BEFORE UPDATE ON workspace_installations
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();

DROP TRIGGER IF EXISTS oauth_connections_set_updated_at ON oauth_connections;
CREATE TRIGGER oauth_connections_set_updated_at
BEFORE UPDATE ON oauth_connections
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();
