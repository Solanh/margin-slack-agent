import type { Pool, QueryResultRow } from "pg";
import {
  ContextResolutionStatusSchema,
  NoteStatusSchema,
  NoteTypeSchema,
  PrioritySchema,
  type OwnerScope,
} from "../domain/note.js";
import type {
  NoteRetrievalRequest,
  RetrievedNote,
  RetrievedOriginalNote,
} from "../domain/retrieval.js";
import type { NoteRetrievalRepository } from "./noteRetrievalRepository.js";

interface RetrievalRow extends QueryResultRow {
  id: string;
  organized_text: string | null;
  note_type: string | null;
  priority: string;
  status: string;
  context_resolution_status: string;
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  uncertainties: unknown;
  meeting_title: string | null;
  meeting_starts_at: Date | string | null;
  created_at: Date | string;
  relevance: number | string;
}

interface OriginalRow extends QueryResultRow {
  id: string;
  raw_text: string;
  organized_text: string | null;
  meeting_title: string | null;
  meeting_starts_at: Date | string | null;
  created_at: Date | string;
}

const SEARCH_SQL = `
  WITH parsed_query AS (
    SELECT CASE
      WHEN NULLIF(BTRIM($6::text), '') IS NULL THEN NULL
      ELSE websearch_to_tsquery('simple', $6::text)
    END AS query
  )
  SELECT
    n.id,
    n.organized_text,
    n.note_type,
    n.priority,
    n.status,
    n.context_resolution_status,
    n.reminder_intent,
    n.explicit_due_at,
    n.uncertainties,
    m.title AS meeting_title,
    m.starts_at AS meeting_starts_at,
    n.created_at,
    CASE
      WHEN pq.query IS NULL THEN 0
      ELSE
        2 * ts_rank(
          to_tsvector(
            'simple',
            COALESCE(n.organized_text, '') || ' ' || n.raw_text
          ),
          pq.query
        )
        +
        ts_rank(
          to_tsvector('simple', COALESCE(m.title, '')),
          pq.query
        )
    END AS relevance
  FROM notes n
  LEFT JOIN meetings m
    ON m.id = n.meeting_id
   AND m.workspace_id = n.workspace_id
   AND m.user_id = n.user_id
  CROSS JOIN parsed_query pq
  WHERE n.workspace_id = $1
    AND n.user_id = $2
    AND (
      $3::text[] IS NULL
      OR n.note_type = ANY($3::text[])
    )
    AND (
      $4::text[] IS NULL
      OR n.priority = ANY($4::text[])
    )
    AND (
      $5::text = 'any'
      OR ($5::text = 'open' AND n.status = 'open')
      OR ($5::text = 'resolved' AND n.status = 'resolved')
      OR ($5::text = 'archived' AND n.status = 'archived')
      OR (
        $5::text = 'unresolved'
        AND (
          n.status = 'open'
          OR n.context_resolution_status = 'needs_clarification'
          OR COALESCE(jsonb_array_length(n.uncertainties), 0) > 0
        )
      )
    )
    AND (
      pq.query IS NULL
      OR to_tsvector(
        'simple',
        COALESCE(n.organized_text, '') || ' ' || n.raw_text
      ) @@ pq.query
      OR to_tsvector('simple', COALESCE(m.title, '')) @@ pq.query
      OR LOWER(
        COALESCE(n.organized_text, '') || ' ' || n.raw_text || ' ' || COALESCE(m.title, '')
      ) LIKE '%' || LOWER($6::text) || '%'
    )
  ORDER BY relevance DESC, n.created_at DESC, n.id ASC
  LIMIT $7
`;

const GET_ORIGINAL_SQL = `
  SELECT
    n.id,
    n.raw_text,
    n.organized_text,
    m.title AS meeting_title,
    m.starts_at AS meeting_starts_at,
    n.created_at
  FROM notes n
  LEFT JOIN meetings m
    ON m.id = n.meeting_id
   AND m.workspace_id = n.workspace_id
   AND m.user_id = n.user_id
  WHERE n.id = $1
    AND n.workspace_id = $2
    AND n.user_id = $3
  LIMIT 1
`;

export class PostgresNoteRetrievalRepository
  implements NoteRetrievalRepository
{
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async search(
    owner: OwnerScope,
    request: NoteRetrievalRequest,
  ): Promise<RetrievedNote[]> {
    const result = await this.pool.query<RetrievalRow>(SEARCH_SQL, [
      owner.workspaceId,
      owner.userId,
      request.noteTypes.length > 0 ? request.noteTypes : null,
      request.priorities.length > 0 ? request.priorities : null,
      request.status,
      request.searchText,
      request.limit,
    ]);

    return result.rows.map((row) => ({
      id: row.id,
      organizedText: row.organized_text,
      noteType: row.note_type ? NoteTypeSchema.parse(row.note_type) : null,
      priority: PrioritySchema.parse(row.priority),
      status: NoteStatusSchema.parse(row.status),
      contextResolutionStatus: ContextResolutionStatusSchema.parse(
        row.context_resolution_status,
      ),
      reminderIntent: row.reminder_intent,
      explicitDueAt: this.optionalDate(row.explicit_due_at),
      uncertainties: this.stringArray(row.uncertainties),
      meetingTitle: row.meeting_title,
      meetingStartsAt: this.optionalDate(row.meeting_starts_at),
      createdAt: this.toDate(row.created_at),
      relevance: Number(row.relevance),
    }));
  }

  async getOriginal(
    owner: OwnerScope,
    noteId: string,
  ): Promise<RetrievedOriginalNote | null> {
    const result = await this.pool.query<OriginalRow>(GET_ORIGINAL_SQL, [
      noteId,
      owner.workspaceId,
      owner.userId,
    ]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      rawText: row.raw_text,
      organizedText: row.organized_text,
      meetingTitle: row.meeting_title,
      meetingStartsAt: this.optionalDate(row.meeting_starts_at),
      createdAt: this.toDate(row.created_at),
    };
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error("Expected PostgreSQL JSON value to be a string array");
    }
    return value;
  }

  private optionalDate(value: Date | string | null): Date | null {
    return value === null ? null : this.toDate(value);
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
