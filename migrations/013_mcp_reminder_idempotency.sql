ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_owner_request_key_unique
  ON reminders (workspace_id, user_id, request_key)
  WHERE request_key IS NOT NULL;
