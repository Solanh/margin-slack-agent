import type { Note, RawNote } from "../domain/note.js";

export interface CreateRawNoteInput {
  workspaceId: string;
  userId: string;
  sourceChannelId: string;
  sourceMessageTs: string;
  rawText: string;
}

export interface RawNoteRepository {
  /**
   * Must be idempotent for the tuple
   * (workspaceId, userId, sourceMessageTs).
   *
   * This operation is the first durable step in the capture pipeline.
   */
  createRaw(input: CreateRawNoteInput): Promise<RawNote>;
}

export interface NoteRepository extends RawNoteRepository {
  getById(id: string): Promise<Note | null>;

  saveDerived(
    id: string,
    update: Pick<
      Note,
      "organizedText" | "noteType" | "priority" | "transformationVersion"
    >,
  ): Promise<Note>;
}
