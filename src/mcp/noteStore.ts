import { randomUUID } from "node:crypto";
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

export type McpNoteSourceType = "mcp" | "slack_channel" | "slack_message";

export interface McpNoteSource {
  sourceType: McpNoteSourceType;
  channelId: string | null;
  messageTs: string | null;
  permalink: string | null;
  createdAt: string;
}

export interface McpNoteReview {
  reasons: Array<"verbatim_only" | "meeting_context" | "uncertainties">;
  confirmedAt: string | null;
}

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
  sources?: McpNoteSource[];
  review?: McpNoteReview;
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

export interface CreateMcpNoteInput {
  text: string;
  noteType?: string | undefined;
  priority?: string | undefined;
  requestKey: string;
  source?: {
    sourceType: Exclude<McpNoteSourceType, "mcp">;
    channelId: string;
    messageTs?: string | undefined;
    permalink?: string | undefined;
  } | undefined;
}

export interface MarginMcpNoteStore {
  search(owner: OwnerScope, request: McpNoteSearch): Promise<McpNote[]>;
  getById(owner: OwnerScope, noteId: string): Promise<McpNote | null>;
}

export interface MarginMcpNoteMutationStore {
  create(owner: OwnerScope, input: CreateMcpNoteInput): Promise<McpNote>;
  listNeedsReview(owner: OwnerScope, limit: number): Promise<McpNote[]>;
  confirmReview(owner: OwnerScope, noteId: string): Promise<McpNote | null>;
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
  sources: unknown;
  review_confirmed_at: Date | string | null;
}

interface IdRow extends QueryResultRow {
  id: string;
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
  m.participants AS meeting_participants,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'sourceType', source.source_type,
          'channelId', source.channel_id,
          'messageTs', source.message_ts,
          'permalink', source.permalink,
          'createdAt', source.created_at
        )
        ORDER BY source.created_at ASC, source.id ASC
      )
      FROM note_sources AS source
      WHERE source.note_id = n.id
        AND source.workspace_id = n.workspace_id
        AND source.user_id = n.user_id
    ),
    '[]'::jsonb
  ) AS sources,
  review.confirmed_at AS review_confirmed_at
`;

const NOTE_JOINS = `
  LEFT JOIN meetings m
    ON m.id = n.meeting_id
   AND m.workspace_id = n.workspace_id
   AND m.user_id = n.user_id
  LEFT JOIN note_review_confirmations review
    ON review.note_id = n.id
   AND review.workspace_id = n.workspace_id
   AND review.user_id = n.user_id
`;

const SEARCH_SQL = `
  SELECT ${NOTE_COLUMNS}
  FROM notes n
  ${NOTE_JOINS}
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
  ${NOTE_JOINS}
  WHERE n.workspace_id = $1
    AND n.user_id = $2
    AND n.id = $3
  LIMIT 1
`;

const LIST_NEEDS_REVIEW_SQL = `
  SELECT ${NOTE_COLUMNS}
  FROM notes n
  ${NOTE_JOINS}
  WHERE n.workspace_id = $1
    AND n.user_id = $2
    AND review.note_id IS NULL
    AND (
      n.organized_text IS NULL
      OR n.context_resolution_status = 'needs_clarification'
      OR jsonb_array_length(n.uncertainties) > 0
    )
  ORDER BY n.created_at DESC, n.id ASC
  LIMIT $3
`;

const CREATE_SQL = `
  WITH created_note AS (
    INSERT INTO notes (
      id,
      workspace_id,
      user_id,
      source_channel_id,
      source_message_ts,
      raw_text,
      note_type,
      priority
    )
    VALUES ($1, $2, $3, 'MCP', $4, $5, $6, $7)
    ON CONFLICT (workspace_id, user_id, source_message_ts)
    DO UPDATE SET source_message_ts = notes.source_message_ts
    RETURNING id
  ),
  created_source AS (
    INSERT INTO note_sources (
      id,
      note_id,
      workspace_id,
      user_id,
      source_type,
      channel_id,
      message_ts,
      permalink
    )
    SELECT $8, id, $2, $3, $9, $10, $11, $12
    FROM created_note
    ON CONFLICT DO NOTHING
  )
  SELECT id FROM created_note
`;

const CONFIRM_REVIEW_SQL = `
  INSERT INTO note_review_confirmations (
    note_id,
    workspace_id,
    user_id,
    confirmed_at
  )
  SELECT id, workspace_id, user_id, NOW()
  FROM notes
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  ON CONFLICT (note_id, workspace_id, user_id)
  DO UPDATE SET confirmed_at = EXCLUDED.confirmed_at
  RETURNING note_id AS id
`;

export class PostgresMarginMcpNoteStore
  implements MarginMcpNoteStore, MarginMcpNoteMutationStore
{
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

  async create(owner: OwnerScope, input: CreateMcpNoteInput): Promise<McpNote> {
    const source = input.source;
    const created = await this.pool.query<IdRow>(CREATE_SQL, [
      randomUUID(),
      owner.workspaceId,
      owner.userId,
      `mcp:capture:${input.requestKey}`,
      input.text,
      input.noteType ?? null,
      input.priority ?? "normal",
      randomUUID(),
      source?.sourceType ?? "mcp",
      source?.channelId ?? null,
      source?.messageTs ?? null,
      source?.permalink ?? null,
    ]);
    const noteId = created.rows[0]?.id;
    if (!noteId) {
      throw new Error("PostgreSQL did not return the MCP-captured note");
    }
    const note = await this.getById(owner, noteId);
    if (!note) {
      throw new Error("MCP-captured note could not be read back");
    }
    return note;
  }

  async listNeedsReview(owner: OwnerScope, limit: number): Promise<McpNote[]> {
    const result = await this.pool.query<NoteRow>(LIST_NEEDS_REVIEW_SQL, [
      owner.workspaceId,
      owner.userId,
      limit,
    ]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async confirmReview(owner: OwnerScope, noteId: string): Promise<McpNote | null> {
    const confirmed = await this.pool.query<IdRow>(CONFIRM_REVIEW_SQL, [
      noteId,
      owner.workspaceId,
      owner.userId,
    ]);
    if (!confirmed.rows[0]?.id) {
      return null;
    }
    return this.getById(owner, noteId);
  }

  private mapRow(row: NoteRow): McpNote {
    const uncertainties = this.stringArray(row.uncertainties);
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
      uncertainties,
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
      sources: this.sources(row.sources),
      review: {
        reasons: this.reviewReasons(row, uncertainties),
        confirmedAt: this.optionalIso(row.review_confirmed_at),
      },
    };
  }

  private reviewReasons(
    row: NoteRow,
    uncertainties: string[],
  ): McpNoteReview["reasons"] {
    const reasons: McpNoteReview["reasons"] = [];
    if (row.organized_text === null) {
      reasons.push("verbatim_only");
    }
    if (row.context_resolution_status === "needs_clarification") {
      reasons.push("meeting_context");
    }
    if (uncertainties.length > 0) {
      reasons.push("uncertainties");
    }
    return reasons;
  }

  private sources(value: unknown): McpNoteSource[] {
    if (!Array.isArray(value)) {
      throw new Error("Expected PostgreSQL note sources to be an array");
    }
    return value.map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error("Expected each PostgreSQL note source to be an object");
      }
      const source = item as Record<string, unknown>;
      const sourceType = source.sourceType;
      if (
        sourceType !== "mcp" &&
        sourceType !== "slack_channel" &&
        sourceType !== "slack_message"
      ) {
        throw new Error("Unexpected note source type");
      }
      if (typeof source.createdAt !== "string") {
        throw new Error("Expected note source createdAt to be a string");
      }
      return {
        sourceType,
        channelId: this.optionalString(source.channelId),
        messageTs: this.optionalString(source.messageTs),
        permalink: this.optionalString(source.permalink),
        createdAt: this.iso(source.createdAt),
      };
    });
  }

  private optionalString(value: unknown): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error("Expected PostgreSQL value to be a string or null");
    }
    return value;
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
