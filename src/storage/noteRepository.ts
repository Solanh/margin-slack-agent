import type {
  ContextCandidateWithMeeting,
  InferredField,
  MeetingContext,
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
  displayMode: Note["displayMode"];
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
  displayMode: NoteRevision["displayMode"];
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

export interface NoteCardReference {
  channelId: string;
  messageTs: string;
}

export interface UserNotePatch {
  organizedText?: string | undefined;
  priority?: Note["priority"] | undefined;
  displayMode?: Note["displayMode"] | undefined;
  reminderIntent?: string | null | undefined;
  explicitDueAt?: Date | null | undefined;
  meetingId?: string | null | undefined;
  contextSource?: Note["contextSource"] | undefined;
  contextConfidence?: Note["contextConfidence"] | undefined;
  contextResolutionStatus?: Note["contextResolutionStatus"] | undefined;
  removeInferredFields?: InferredField[] | undefined;
}

export interface ApplyUserNotePatchInput extends OwnerScope {
  noteId: string;
  patch: UserNotePatch;
}

export interface SetMeetingContextInput extends OwnerScope {
  noteId: string;
  meetingId: string;
  contextConfidence: Note["contextConfidence"];
  contextSource?: Exclude<Note["contextSource"], "standalone"> | undefined;
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

  setMeetingContext(input: SetMeetingContextInput): Promise<Note>;

  appendRevision(input: CreateRevisionInput): Promise<NoteRevision>;
}

export interface TransformationRepository {
  applyTransformation(input: ApplyTransformationInput): Promise<Note>;
}

export interface NoteInteractionRepository {
  setCardReference(
    owner: OwnerScope,
    noteId: string,
    reference: NoteCardReference,
  ): Promise<Note>;

  applyUserPatch(input: ApplyUserNotePatchInput): Promise<Note>;
}

export interface NoteCardData {
  note: Note;
  meeting: MeetingContext | null;
  contextCandidates: ContextCandidateWithMeeting[];
}
