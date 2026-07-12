import type {
  InferredField,
  Note,
  NoteRevision,
  OwnerScope,
  RawNote,
  Transformation,
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
  reminderIntent: Note["reminderIntent"];
  explicitDueAt: Note["explicitDueAt"];
  inferredFields: InferredField[];
  uncertainties: string[];
  transformationVersion: Note["transformationVersion"];
}

export interface CreateRevisionInput extends OwnerScope {
  noteId: string;
  revisionSource: NoteRevision["revisionSource"];
  organizedText: NoteRevision["organizedText"];
  noteType: NoteRevision["noteType"];
  priority: NoteRevision["priority"];
  status: NoteRevision["status"];
  reminderIntent: NoteRevision["reminderIntent"];
  explicitDueAt: NoteRevision["explicitDueAt"];
  transformationVersion: NoteRevision["transformationVersion"];
  inferredFields: InferredField[];
  uncertainties: string[];
}

export interface ApplyTransformationInput extends OwnerScope {
  noteId: string;
  transformation: Transformation;
  transformationVersion: string;
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

export interface TransformationRepository {
  applyTransformation(input: ApplyTransformationInput): Promise<Note>;
}
