import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { InferredField, Note, OwnerScope } from "../domain/note.js";
import type {
  ApplyUserNotePatchInput,
  NoteCardReference,
  NoteInteractionRepository,
  NoteRepository,
} from "./noteRepository.js";

interface MutableNoteRow extends QueryResultRow {
  organized_text: string | null;
  note_type: Note["noteType"];
  priority: Note["priority"];
  status: Note["status"];
  display_mode: Note["displayMode"];
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  transformation_version: string | null;
  inferred_fields: unknown;
  uncertainties: unknown;
  meeting_id: string | null;
  context_source: Note["contextSource"];
  context_confidence: Note["contextConfidence"];
  context_resolution_status: Note["contextResolutionStatus"];
}

const SET_CARD_REFERENCE_SQL = `
  UPDATE notes
  SET card_channel_id = $4,
      card_message_ts = $5
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const LOCK_NOTE_SQL = `
  SELECT
    organized_text,
    note_type,
    priority,
    status,
    display_mode,
    reminder_intent,
    explicit_due_at,
    transformation_version,
    inferred_fields,
    uncertainties,
    meeting_id,
    context_source,
    context_confidence,
    context_resolution_status
  FROM notes
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  FOR UPDATE
`;

const UPDATE_NOTE_SQL = `
  UPDATE notes
  SET organized_text = $4,
      priority = $5,
      status = $6,
      display_mode = $7,
      reminder_intent = $8,
      explicit_due_at = $9,
      meeting_id = $10,
      context_source = $11,
      context_confidence = $12,
      context_resolution_status = $13,
      inferred_fields = $14
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const INSERT_USER_REVISION_SQL = `
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
  VALUES ($1, $2, $3, $4, 'user', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
`;

export class PostgresNoteInteractionRepository
  implements NoteInteractionRepository
{
  constructor(
    private readonly pool: Pool,
    private readonly notes: NoteRepository,
  ) {}

  async setCardReference(
    owner: OwnerScope,
    noteId: string,
    reference: NoteCardReference,
  ): Promise<Note> {
    if (!reference.channelId.startsWith("D")) {
      throw new Error("Note cards may only be stored in a Slack DM channel");
    }
    if (!reference.messageTs) {
      throw new Error("Slack card message timestamp is required");
    }

    const result = await this.pool.query(SET_CARD_REFERENCE_SQL, [
      noteId,
      owner.workspaceId,
      owner.userId,
      reference.channelId,
      reference.messageTs,
    ]);

    if (result.rowCount !== 1) {
      throw new Error("Owner-scoped note was not found for card reference");
    }

    return this.requireNote(owner, noteId);
  }

  async applyUserPatch(input: ApplyUserNotePatchInput): Promise<Note> {
    if (Object.keys(input.patch).length === 0) {
      throw new Error("User note patch cannot be empty");
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const locked = await client.query<MutableNoteRow>(LOCK_NOTE_SQL, [
        input.noteId,
        input.workspaceId,
        input.userId,
      ]);
      const current = locked.rows[0];
      if (!current) {
        throw new Error("Owner-scoped note was not found for user update");
      }

      const inferredFields = this.stringArray(current.inferred_fields).filter(
        (field): field is InferredField =>
          !input.patch.removeInferredFields?.includes(field as InferredField),
      );
      const organizedText =
        input.patch.organizedText !== undefined
          ? input.patch.organizedText
          : current.organized_text;
      const priority = input.patch.priority ?? current.priority;
      const status = input.patch.status ?? current.status;
      const displayMode = input.patch.displayMode ?? current.display_mode;
      const reminderIntent =
        input.patch.reminderIntent !== undefined
          ? input.patch.reminderIntent
          : current.reminder_intent;
      const explicitDueAt =
        input.patch.explicitDueAt !== undefined
          ? input.patch.explicitDueAt
          : current.explicit_due_at;
      const meetingId =
        input.patch.meetingId !== undefined
          ? input.patch.meetingId
          : current.meeting_id;
      const contextSource =
        input.patch.contextSource ?? current.context_source;
      const contextConfidence =
        input.patch.contextConfidence ?? current.context_confidence;
      const contextResolutionStatus =
        input.patch.contextResolutionStatus ??
        current.context_resolution_status;
      const serializedInferredFields = JSON.stringify(inferredFields);
      const serializedUncertainties = JSON.stringify(
        this.stringArray(current.uncertainties),
      );

      await client.query(UPDATE_NOTE_SQL, [
        input.noteId,
        input.workspaceId,
        input.userId,
        organizedText,
        priority,
        status,
        displayMode,
        reminderIntent,
        explicitDueAt,
        meetingId,
        contextSource,
        contextConfidence,
        contextResolutionStatus,
        serializedInferredFields,
      ]);

      await client.query(INSERT_USER_REVISION_SQL, [
        randomUUID(),
        input.noteId,
        input.workspaceId,
        input.userId,
        organizedText,
        current.note_type,
        priority,
        status,
        displayMode,
        reminderIntent,
        explicitDueAt,
        current.transformation_version,
        serializedInferredFields,
        serializedUncertainties,
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.requireNote(
      { workspaceId: input.workspaceId, userId: input.userId },
      input.noteId,
    );
  }

  private async requireNote(owner: OwnerScope, noteId: string): Promise<Note> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Updated note could not be reloaded");
    }
    return note;
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error("Expected PostgreSQL JSON value to be a string array");
    }
    return value;
  }
}
