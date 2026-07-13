DROP INDEX IF EXISTS reminders_owner_request_key_unique;

ALTER TABLE reminders
  DROP COLUMN IF EXISTS request_key;
