ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS context_source TEXT NOT NULL DEFAULT 'standalone'
    CHECK (context_source IN ('google_calendar', 'slack_huddle', 'explicit', 'standalone')),
  ADD COLUMN IF NOT EXISTS context_resolution_status TEXT NOT NULL DEFAULT 'standalone'
    CHECK (context_resolution_status IN ('pending', 'attached', 'needs_clarification', 'standalone'));

UPDATE notes AS n
SET context_source = COALESCE(
      CASE m.provider
        WHEN 'google_calendar' THEN 'google_calendar'
        WHEN 'slack_huddle' THEN 'slack_huddle'
        WHEN 'explicit' THEN 'explicit'
        ELSE NULL
      END,
      'standalone'
    ),
    context_resolution_status = CASE
      WHEN n.meeting_id IS NOT NULL THEN 'attached'
      ELSE 'standalone'
    END
FROM meetings AS m
WHERE n.meeting_id = m.id;

UPDATE notes
SET context_source = 'standalone',
    context_resolution_status = 'standalone',
    context_confidence = 'unresolved'
WHERE meeting_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_context_resolution_shape'
      AND conrelid = 'notes'::regclass
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_context_resolution_shape CHECK (
        (
          context_resolution_status = 'attached'
          AND meeting_id IS NOT NULL
          AND context_source <> 'standalone'
        )
        OR
        (
          context_resolution_status IN ('pending', 'needs_clarification', 'standalone')
          AND meeting_id IS NULL
        )
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS note_context_candidates (
  id UUID PRIMARY KEY,
  note_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  meeting_id UUID,
  source TEXT NOT NULL
    CHECK (source IN ('google_calendar', 'slack_huddle', 'explicit', 'standalone')),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('exact', 'high', 'medium', 'low', 'unresolved')),
  signals JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(signals) = 'object'),
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT note_context_candidates_note_owner_fk
    FOREIGN KEY (note_id, workspace_id, user_id)
    REFERENCES notes (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT note_context_candidates_meeting_owner_fk
    FOREIGN KEY (meeting_id, workspace_id, user_id)
    REFERENCES meetings (id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT note_context_candidates_shape CHECK (
    (source = 'standalone' AND meeting_id IS NULL)
    OR
    (source <> 'standalone' AND meeting_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS note_context_candidates_identity_idx
  ON note_context_candidates (
    note_id,
    workspace_id,
    user_id,
    source,
    COALESCE(meeting_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS note_context_candidates_rank_idx
  ON note_context_candidates (workspace_id, user_id, note_id, score DESC, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS note_context_candidates_selected_idx
  ON note_context_candidates (note_id, workspace_id, user_id)
  WHERE selected;

DROP TRIGGER IF EXISTS note_context_candidates_set_updated_at ON note_context_candidates;
CREATE TRIGGER note_context_candidates_set_updated_at
BEFORE UPDATE ON note_context_candidates
FOR EACH ROW
EXECUTE FUNCTION margin_set_updated_at();
