import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  ContextConfidenceSchema,
  ContextResolutionStatusSchema,
  ContextSourceSchema,
  DisplayModeSchema,
  InferredFieldSchema,
  NoteStatusSchema,
  NoteTypeSchema,
  PrioritySchema,
  RevisionSourceSchema,
  type Note,
  type NoteRevision,
  type OwnerScope,
  type RawNote,
} from "../domain/note.js";
import type {
  CreateRawNoteInput,
  CreateRevisionInput,
  NoteRepository,
  SaveDerivedNoteInput,
  SetMeetingContextInput,
} from "./noteRepository.js";
import { PostgresRawNoteRepository } from "./postgresRawNoteRepository.js";

interface NoteRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  source_channel_id: string;
  source_message_ts: string;
  raw_text: string;
  organized_text: string | null;
  note_type: string | null;
  priority: string;
  status: string;
  display_mode: string;
  meeting_id: string | null;
  context_source: string;
  context_confidence: string;
  context_resolution_status: string;
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  inferred_fields: unknown;
  uncertainties: unknown;
  transformation_version: string | null;
  card_channel_id: string | null;
  card_message_ts: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NoteRevisionRow extends QueryResultRow {
  id: string;
  note_id: string;
  workspace_id: string;
  user_id: string;
  revision_source: string;
  organized_text: string | null;
  note_type: string | null;
  priority: string | null;
  status: string | null;
  display_mode: string;
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  transformation_version: string | null;
  inferred_fields: unknown;
  uncertainties: unknown;
  created_at: Date | string;
}

const GET_SQL = `
  SELECT *
  FROM notes
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  LIMIT 1
`;

const SAVE_DERIVED_SQL = `
  UPDATE notes
  SET organized_text = $4,
      note_type = $5,
      priority = $6,
      status = $7,
      display_mode = $8,
      context_confidence = $9,
      reminder_intent = $10,
      explicit_due_at = $11,
      inferred_fields = $12,
      uncertainties = $13,
      transformation_version = $14
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  RETURNING *
`;

const SET_MEETING_CONTEXT_SQL = `
  UPDATE notes
  SET meeting_id = $4,
      context_confidence = $5,
      context_source = COALESCE(
        $6,
        (
          SELECT CASE provider
            WHEN 'google_calendar' THEN 'google_calendar'
            WHEN 'slack_huddle' THEN 'slack_huddle'
            WHEN 'explicit' THEN 'explicit'
          END
          FROM meetings
          WHERE id = $4
            AND workspace_id = $2
            AND user_id = $3
        )
      ),
      context_resolution_status = 'attached'
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  RETURNING *
`;

const APPEND_REVISION_SQL = `
  INSERT INTO note_revisions (
    id,
    note_id,
    workspace_id,
    user_id,
    revision_source,
    organized_text,
    note_type,
    priority,
    status,
    display_mode,
    reminder_intent,
    explicit_due_at,
    transformation_version,
    inferred_fields,
    uncertainties
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  RETURNING *
`;

export class PostgresNoteRepository implements NoteRepository {
  private readonly rawRepository: PostgresRawNoteRepository;

  constructor(private readonly pool: Pick<Pool, "query">) {
    this.rawRepository = new PostgresRawNoteRepository(pool);
  }

  createRaw(input: CreateRawNoteInput): Promise<RawNote> {
    return this.rawRepository.createRaw(input);
  }

  async getById(owner: OwnerScope, id: string): Promise<Note | null> {
    const result = await this.pool.query<NoteRow>(GET_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
    ]);

    const row = result.rows[0];
    return row ? this.mapNote(row) : null;
  }

  async saveDerived(
    owner: OwnerScope,
    id: string,
    update: SaveDerivedNoteInput,
  ): Promise<Note> {
    const result = await this.pool.query<NoteRow>(SAVE_DERIVED_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
      update.organizedText,
      update.noteType,
      update.priority,
      update.status,
      update.displayMode,
      update.contextConfidence,
      update.reminderIntent,
      update.explicitDueAt,
      JSON.stringify(update.inferredFields),
      JSON.stringify(update.uncertainties),
      update.transformationVersion,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("Owner-scoped note was not found for update");
    }

    return this.mapNote(row);
  }

  async setMeetingContext(input: SetMeetingContextInput): Promise<Note> {
    const result = await this.pool.query<NoteRow>(SET_MEETING_CONTEXT_SQL, [
      input.noteId,
      input.workspaceId,
      input.userId,
      input.meetingId,
      input.contextConfidence,
      input.contextSource ?? null,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("Owner-scoped note was not found for meeting context");
    }

    return this.mapNote(row);
  }

  async appendRevision(input: CreateRevisionInput): Promise<NoteRevision> {
    const result = await this.pool.query<NoteRevisionRow>(APPEND_REVISION_SQL, [
      randomUUID(),
      input.noteId,
      input.workspaceId,
      input.userId,
      input.revisionSource,
      input.organizedText,
      input.noteType,
      input.priority,
      input.status,
      input.displayMode,
      input.reminderIntent,
      input.explicitDueAt,
      input.transformationVersion,
      JSON.stringify(input.inferredFields),
      JSON.stringify(input.uncertainties),
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the appended note revision");
    }

    return this.mapRevision(row);
  }

  private mapNote(row: NoteRow): Note {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      sourceChannelId: row.source_channel_id,
      sourceMessageTs: row.source_message_ts,
      rawText: row.raw_text,
      organizedText: row.organized_text,
      noteType: row.note_type ? NoteTypeSchema.parse(row.note_type) : null,
      priority: PrioritySchema.parse(row.priority),
      status: NoteStatusSchema.parse(row.status),
      displayMode: DisplayModeSchema.parse(row.display_mode),
      meetingId: row.meeting_id,
      contextSource: ContextSourceSchema.parse(row.context_source),
      contextConfidence: ContextConfidenceSchema.parse(
        row.context_confidence,
      ),
      contextResolutionStatus: ContextResolutionStatusSchema.parse(
        row.context_resolution_status,
      ),
      reminderIntent: row.reminder_intent,
      explicitDueAt: this.optionalDate(row.explicit_due_at),
      inferredFields: this.inferredFieldArray(row.inferred_fields),
      uncertainties: this.stringArray(row.uncertainties),
      transformationVersion: row.transformation_version,
      cardChannelId: row.card_channel_id,
      cardMessageTs: row.card_message_ts,
      createdAt: this.toDate(row.created_at),
      updatedAt: this.toDate(row.updated_at),
    };
  }

  private mapRevision(row: NoteRevisionRow): NoteRevision {
    return {
      id: row.id,
      noteId: row.note_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      revisionSource: RevisionSourceSchema.parse(row.revision_source),
      organizedText: row.organized_text,
      noteType: row.note_type ? NoteTypeSchema.parse(row.note_type) : null,
      priority: row.priority ? PrioritySchema.parse(row.priority) : null,
      status: row.status ? NoteStatusSchema.parse(row.status) : null,
      displayMode: DisplayModeSchema.parse(row.display_mode),
      reminderIntent: row.reminder_intent,
      explicitDueAt: this.optionalDate(row.explicit_due_at),
      transformationVersion: row.transformation_version,
      inferredFields: this.inferredFieldArray(row.inferred_fields),
      uncertainties: this.stringArray(row.uncertainties),
      createdAt: this.toDate(row.created_at),
    };
  }

  private inferredFieldArray(value: unknown): Note["inferredFields"] {
    return this.stringArray(value).map((field) =>
      InferredFieldSchema.parse(field),
    );
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
