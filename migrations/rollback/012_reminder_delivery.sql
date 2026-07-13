DROP INDEX IF EXISTS reminders_due_delivery_idx;

ALTER TABLE reminders
  DROP COLUMN IF EXISTS slack_message_ts,
  DROP COLUMN IF EXISTS slack_channel_id,
  DROP COLUMN IF EXISTS last_error_code,
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS attempts;
