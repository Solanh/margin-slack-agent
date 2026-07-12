import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { NoteRepository } from "./noteRepository.js";
import type {
  ApplyTransformationInput,
  TransformationRepository,
} from "./noteRepository.js";

const UPDATE_NOTE_SQL = `
  UPDATE notes
  SET organized_text = $4,
      note_type = $5,
      priority = $6,
      reminder_intent = $7,
      explicit_due_at = $8,
      inferred_fields = $9,
      uncertainties = $10,
      transformation_version = $11
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const INSERT_REVISION_SQL = `
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
    reminder_intent,
    explicit_due_at,
    transformation_version,
    inferred_fields,
    uncertainties
  )
  VALUES ($1, $2, $3, $4, 'ai', $5, $6, $7, 'open', $8, $9, $10, $11, $12)
`;

export class PostgresTransformationRepository
  implements TransformationRepository
{
  constructor(
    private readonly pool: Pool,
    private readonly notes: NoteRepository,
  ) {}

  async applyTransformation(input: ApplyTransformationInput) {
    const client = await this.pool.connect();
    const dueAt = input.transformation.explicitDueAt
      ? new Date(input.transformation.explicitDueAt)
      : null;
    const inferredFields = JSON.stringify(
      input.transformation.inferredFields,
    );
    const uncertainties = JSON.stringify(input.transformation.uncertainties);

    try {
      await client.query("BEGIN");

      const update = await client.query(UPDATE_NOTE_SQL, [
        input.noteId,
        input.workspaceId,
        input.userId,
        input.transformation.organizedText,
        input.transformation.noteType,
        input.transformation.priority,
        input.transformation.reminderIntent,
        dueAt,
        inferredFields,
        uncertainties,
        input.transformationVersion,
      ]);

      if (update.rowCount !== 1) {
        throw new Error("Owner-scoped note was not found for transformation");
      }

      await client.query(INSERT_REVISION_SQL, [
        randomUUID(),
        input.noteId,
        input.workspaceId,
        input.userId,
        input.transformation.organizedText,
        input.transformation.noteType,
        input.transformation.priority,
        input.transformation.reminderIntent,
        dueAt,
        input.transformationVersion,
        inferredFields,
        uncertainties,
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const note = await this.notes.getById(
      { workspaceId: input.workspaceId, userId: input.userId },
      input.noteId,
    );

    if (!note) {
      throw new Error("Transformed note could not be reloaded");
    }

    return note;
  }
}
