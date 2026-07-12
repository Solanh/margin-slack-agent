CREATE INDEX IF NOT EXISTS notes_owner_retrieval_text_idx
  ON notes USING GIN (
    to_tsvector(
      'simple',
      COALESCE(organized_text, '') || ' ' || raw_text
    )
  );

CREATE INDEX IF NOT EXISTS notes_owner_retrieval_filters_idx
  ON notes (
    workspace_id,
    user_id,
    status,
    note_type,
    priority,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS meetings_owner_retrieval_title_idx
  ON meetings USING GIN (
    to_tsvector('simple', title)
  );
