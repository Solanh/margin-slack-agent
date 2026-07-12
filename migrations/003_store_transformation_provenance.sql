ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS reminder_intent TEXT,
  ADD COLUMN IF NOT EXISTS explicit_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inferred_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(inferred_fields) = 'array'),
  ADD COLUMN IF NOT EXISTS uncertainties JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(uncertainties) = 'array');

ALTER TABLE note_revisions
  ADD COLUMN IF NOT EXISTS reminder_intent TEXT,
  ADD COLUMN IF NOT EXISTS explicit_due_at TIMESTAMPTZ;
