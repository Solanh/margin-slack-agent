import type { Pool, QueryResultRow } from "pg";
import {
  ContextConfidenceSchema,
  ContextResolutionStatusSchema,
  ContextSourceSchema,
  DisplayModeSchema,
  NoteStatusSchema,
  NoteTypeSchema,
  PrioritySchema,
  type OwnerScope,
} from "../domain/note.js";

export interface McpNote {
  id: string;
  rawText: string;
  organizedText: string | null;
  noteType: string | null;
  priority: string;
  status: string;
  displayMode: string;
  contextSource: string;
  contextConfidence: string;
  contextResolutionStatus: string;
  reminderIntent: string | null;
  explicitDueAt: string | null;
  uncertainties: string[];
  createdAt: string;
  updatedAt: string;
  meeting: {
    id: string;
    title: string;
    provider: string;
    startsAt: string;
    endsAt: string;
    participants: string[];
  } | null;
}

export interface McpNoteSearch {
  text?: string | undefined;
  createdOn?: string | undefined;
  timeZone: string;
  createdAfter?: string | undefined;
  createdBefore?: string | undefined;
  meeting?: string | undefined;
  noteTypes?: string[] | undefined;
  priorities?: string[] | undefined;
  status: "any" | "open" | "resolved" | "archived";
  sort: "newest" | "due";
  limit: number;
}

export interface MarginMcpNoteStore {
  search(owner: OwnerScope, request: McpNoteSearch): Promise<McpNote[]>;
  getById(owner: OwnerScope, noteId: string): Promise<McpNote | null>;
}

interface NoteRow extends QueryResultRow {
  id: string;
  raw_text: string;
  organized_text: string | null;
  note_type: string | null;
  priority: string;
  status: string;
  display_mode: string;
  context_source: string;
  context_confidence: string;
  context_resolution_status: string;
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  uncertainties: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  meeting_id: string | null;
  meeting_title: string | null;
  meeting_provider: string | null;
  meeting_starts_at: Date | string | null;
  meeting_ends_at: Date | string | null;
  meeting_participants: unknown;
}

const NOTE_COLUMNS = `
  n.id,
  n.raw_text,
  n.organized_text,
  n.note_type,
  n.priority,
  n.status,
  n.display_mode,
  n.context_source,
  n.context_confidence,
  n.context_resolution_status,
  n.reminder_intent,
  n.explicit_due_at,
  n.uncertainties,
  n.created_at,
  n.updated_at,
  m.id AS meeting_id,
  m.title AS meeting_title,
  m.provider AS meeting_provider,
  m.starts_at AS meeting_starts_at,
  m.ends_at AS meeting_ends_at,
  m.participants AS meeting_participants
`;

const SEARCH_SQL = `
  SELECT ${NOTE_COLUMNS}
  FROM notes n
  LEFT JOIN meetings m
    ON m.id = n.meeting_id
   AND m.workspace_id = n.workspace_id
   AND m.user_id = n.user_id
  WHERE n.workspace_id = $1
    AND n.user_id = $2
    AND (
      $3::date IS NULL
      OR (n.created_at AT TIME ZONE $4::text)::date = $3::date
    )
    AND ($5::timestamptz IS NULL OR n.created_at >= $5::timestamptz)
    AND ($6::timestamptz IS NULL OR n.created_at < $6::timestamptz)
    AND ($7::text IS NULL OR m.title ILIKE '%' || $7::text || '%')
    AND (
      $8::text IS NULL
      OR CONCAT_WS(' ', n.raw_text, n.organized_text, m.title)
         ILIKE '%' || $8::text || '%'
    )
    AND ($9::text[] IS NULL OR n.note_type = ANY($9::text[]))
    AND ($10::text[] IS NULL OR n.priority = ANY($10::text[]))
    AND ($11::text = 'any' OR n.status = $11::text)
  ORDER BY
    CASE WHEN $12::text = 'due' THEN n.explicit_due_at END ASC NULLS LAST,
    n.created_at DESC,
    n.id ASC
  LIMIT $13
`;

const GET_BY_ID_SQL = `
  SELECT ${NOTE_COLUMNS}
  FROM notes n
  LEFT JOIN meetings m
    ON m.id = n.meeting_id
   AND m.workspace_id = n.workspace_id
   AND m.user_id = n.user_id
  WHERE n.workspace_id = $1
    AND n.user_id = $2
    AND n.id = $3
  LIMIT 1
`;

export class PostgresMarginMcpNoteStore implements MarginMcpNoteStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async search(owner: OwnerScope, request: McpNoteSearch): Promise<McpNote[]> {
    const result = await this.pool.query<NoteRow>(SEARCH_SQL, [
      owner.workspaceId,
      owner.userId,
      request.createdOn ?? null,
      request.timeZone,
      request.createdAfter ?? null,
      request.createdBefore ?? null,
      request.meeting ?? null,
      request.text ?? null,
      request.noteTypes && request.noteTypes.length > 0
        ? request.noteTypes
        : null,
      request.priorities && request.priorities.length > 0
        ? request.priorities
        : null,
      request.status,
      request.sort,
      request.limit,
    ]);

    return result.rows.map((row) => this.mapRow(row));
  }

  async getById(owner: OwnerScope, noteId: string): Promise<McpNote | null> {
    const result = await this.pool.query<NoteRow>(GET_BY_ID_SQL, [
      owner.workspaceId,
      owner.userId,
      noteId,
    ]);
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: NoteRow): McpNote {
    return {
      id: row.id,
      rawText: row.raw_text,
      organizedText: row.organized_text,
      noteType: row.note_type ? NoteTypeSchema.parse(row.note_type) : null,
      priority: PrioritySchema.parse(row.priority),
      status: NoteStatusSchema.parse(row.status),
      displayMode: DisplayModeSchema.parse(row.display_mode),
      contextSource: ContextSourceSchema.parse(row.context_source),
      contextConfidence: ContextConfidenceSchema.parse(row.context_confidence),
      contextResolutionStatus: ContextResolutionStatusSchema.parse(
        row.context_resolution_status,
      ),
      reminderIntent: row.reminder_intent,
      explicitDueAt: this.optionalIso(row.explicit_due_at),
      uncertainties: this.stringArray(row.uncertainties),
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
      meeting:
        row.meeting_id &&
        row.meeting_title &&
        row.meeting_provider &&
        row.meeting_starts_at &&
        row.meeting_ends_at
          ? {
              id: row.meeting_id,
              title: row.meeting_title,
              provider: row.meeting_provider,
              startsAt: this.iso(row.meeting_starts_at),
              endsAt: this.iso(row.meeting_ends_at),
              participants: this.stringArray(row.meeting_participants),
            }
          : null,
    };
  }

  private stringArray(value: unknown): string[] {
    if (value === null) {
      return [];
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error("Expected PostgreSQL JSON value to be a string array");
    }
    return value;
  }

  private optionalIso(value: Date | string | null): string | null {
    return value === null ? null : this.iso(value);
  }

  private iso(value: Date | string): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }
}
