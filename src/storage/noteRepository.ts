import type {
  Note,
  NoteRevision,
  OwnerScope,
  RawNote,
} from "../domain/note.js";

export interface CreateRawNoteInput extends OwnerScope {
  sourceChannelId: string;
  sourceMessageTs: string;
  rawText: string;
}

export interface SaveDerivedNoteInput {
  organizedText: Note["organizedText"];
  noteType: Note["noteType"];
  priority: Note["priority"];
  status: Note["status"];
  contextConfidence: Note["contextConfidence"];
  transformationVersion: Note["transformationVersion"];
}

export interface CreateRevisionInput extends OwnerScope {
  noteId: string;
  revisionSource: NoteRevision["revisionSource"];
  organizedText: NoteRevision["organizedText"];
  noteType: NoteRevision["noteType"];
  priority: NoteRevision["priority"];
  status: NoteRevision["status"];
  transformationVersion: NoteRevision["transformationVersion"];
  inferredFields: string[];
  uncertainties: string[];
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
  getById(owner: OwnerScope, id: string): Promise<Note | null>;

  saveDerived(
    owner: OwnerScope,
    id: string,
    update: SaveDerivedNoteInput,
  ): Promise<Note>;

  appendRevision(input: CreateRevisionInput): Promise<NoteRevision>;
}
