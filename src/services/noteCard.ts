import { z } from "zod";
import {
  DisplayModeSchema,
  PrioritySchema,
  type OwnerScope,
} from "../domain/note.js";
import type { MeetingRepository } from "../storage/meetingRepository.js";
import type {
  NoteCardData,
  NoteCardReference,
  NoteInteractionRepository,
  NoteRepository,
} from "../storage/noteRepository.js";

const OrganizedTextSchema = z.string().trim().min(1).max(2800);
const ReminderIntentSchema = z.string().trim().max(500);

export class NoteCardService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly interactions: NoteInteractionRepository,
    private readonly meetings: MeetingRepository,
  ) {}

  async getCardData(owner: OwnerScope, noteId: string): Promise<NoteCardData> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Owner-scoped note was not found");
    }

    const meeting = note.meetingId
      ? await this.meetings.getById(owner, note.meetingId)
      : null;

    return { note, meeting };
  }

  recordCardReference(
    owner: OwnerScope,
    noteId: string,
    reference: NoteCardReference,
  ) {
    return this.interactions.setCardReference(owner, noteId, reference);
  }

  editOrganizedText(owner: OwnerScope, noteId: string, text: string) {
    return this.interactions.applyUserPatch({
      ...owner,
      noteId,
      patch: {
        organizedText: OrganizedTextSchema.parse(text),
        displayMode: "organized",
        removeInferredFields: ["organizedText"],
      },
    });
  }

  setPriority(
    owner: OwnerScope,
    noteId: string,
    priority: unknown,
  ) {
    return this.interactions.applyUserPatch({
      ...owner,
      noteId,
      patch: {
        priority: PrioritySchema.parse(priority),
        removeInferredFields: ["priority"],
      },
    });
  }

  setReminderIntent(
    owner: OwnerScope,
    noteId: string,
    reminderIntent: string,
  ) {
    const parsed = ReminderIntentSchema.parse(reminderIntent);
    return this.interactions.applyUserPatch({
      ...owner,
      noteId,
      patch: {
        reminderIntent: parsed || null,
        explicitDueAt: null,
        removeInferredFields: ["reminderIntent", "explicitDueAt"],
      },
    });
  }

  setDisplayMode(owner: OwnerScope, noteId: string, displayMode: unknown) {
    return this.interactions.applyUserPatch({
      ...owner,
      noteId,
      patch: {
        displayMode: DisplayModeSchema.parse(displayMode),
      },
    });
  }

  async setMeeting(
    owner: OwnerScope,
    noteId: string,
    meetingId: string | null,
  ) {
    if (meetingId !== null) {
      const meeting = await this.meetings.getById(owner, meetingId);
      if (!meeting) {
        throw new Error("Owner-scoped meeting was not found");
      }
    }

    return this.interactions.applyUserPatch({
      ...owner,
      noteId,
      patch: {
        meetingId,
        contextConfidence: meetingId ? "exact" : "unresolved",
      },
    });
  }

  async listMeetingCandidates(owner: OwnerScope, noteId: string) {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Owner-scoped note was not found");
    }

    const toleranceMs = 5 * 60 * 1000;
    return this.meetings.listOverlapping(
      owner,
      new Date(note.createdAt.getTime() + toleranceMs),
      new Date(note.createdAt.getTime() - toleranceMs),
    );
  }
}
