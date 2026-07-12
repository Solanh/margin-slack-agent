import type {
  MeetingContext,
  Note,
  OwnerScope,
  Transformation,
} from "../domain/note.js";
import type {
  NoteRepository,
  TransformationRepository,
} from "../storage/noteRepository.js";
import {
  transformNote,
  type TransformationModel,
} from "./transformation.js";
import { TRANSFORMATION_VERSION } from "./transformationPrompt.js";

export type OrganizeNoteResult =
  | {
      status: "organized";
      note: Note;
      transformation: Transformation;
    }
  | {
      status: "verbatim";
      note: Note;
      reason: "provider_failure" | "invalid_output" | "persistence_failure";
    };

export interface OrganizeNoteInput extends OwnerScope {
  noteId: string;
  userTimeZone: string;
  verifiedMeeting?: MeetingContext | null;
}

export class OrganizeNoteService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly transformations: TransformationRepository,
    private readonly model: TransformationModel,
  ) {}

  async organize(input: OrganizeNoteInput): Promise<OrganizeNoteResult> {
    const owner = {
      workspaceId: input.workspaceId,
      userId: input.userId,
    };
    const note = await this.notes.getById(owner, input.noteId);

    if (!note) {
      throw new Error("Owner-scoped note was not found");
    }

    let transformation: Transformation;
    try {
      transformation = await transformNote(this.model, {
        rawText: note.rawText,
        verifiedMeetingTitle: input.verifiedMeeting?.title,
        verifiedMeetingStartsAt: input.verifiedMeeting?.startsAt,
        verifiedMeetingEndsAt: input.verifiedMeeting?.endsAt,
        contextConfidence: input.verifiedMeeting?.confidence,
        userTimeZone: input.userTimeZone,
      });
    } catch (error) {
      return {
        status: "verbatim",
        note,
        reason:
          error instanceof SyntaxError ||
          (error instanceof Error &&
            (error.name === "ZodError" ||
              error.name === "UnsafeTransformationError"))
            ? "invalid_output"
            : "provider_failure",
      };
    }

    try {
      const organized = await this.transformations.applyTransformation({
        ...owner,
        noteId: note.id,
        transformation,
        transformationVersion: TRANSFORMATION_VERSION,
      });

      return {
        status: "organized",
        note: organized,
        transformation,
      };
    } catch {
      return {
        status: "verbatim",
        note,
        reason: "persistence_failure",
      };
    }
  }
}
