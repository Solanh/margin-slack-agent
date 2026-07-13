ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS slack_message_ts TEXT;

UPDATE reminders
SET next_attempt_at = scheduled_for
WHERE reminder_type = 'fixed'
  AND status = 'pending'
  AND next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS reminders_due_delivery_idx
  ON reminders (next_attempt_at, scheduled_for, id)
  WHERE status = 'pending'
    AND reminder_type = 'fixed';
