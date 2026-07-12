import { describe, expect, it, vi } from "vitest";
import type { MeetingContext, Note } from "../src/domain/note.js";
import { NoteCardService } from "../src/services/noteCard.js";
import type { MeetingRepository } from "../src/storage/meetingRepository.js";
import type {
  NoteInteractionRepository,
  NoteRepository,
} from "../src/storage/noteRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };
const noteId = "11111111-1111-4111-8111-111111111111";
const meetingId = "22222222-2222-4222-8222-222222222222";

const note: Note = {
  id: noteId,
  ...owner,
  sourceChannelId: "D123",
  sourceMessageTs: "123.456",
  rawText: "rough note",
  organizedText: "Organized note.",
  noteType: "reference",
  priority: "normal",
  status: "open",
  displayMode: "organized",
  meetingId,
  contextConfidence: "exact",
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: ["organizedText", "noteType", "priority"],
  uncertainties: [],
  transformationVersion: "margin-note-v1",
  cardChannelId: "D123",
  cardMessageTs: "999.000",
  createdAt: new Date("2026-07-12T18:00:00.000Z"),
  updatedAt: new Date("2026-07-12T18:00:00.000Z"),
};

const meeting: MeetingContext = {
  id: meetingId,
  ...owner,
  provider: "explicit",
  providerEventId: null,
  title: "Planning",
  startsAt: new Date("2026-07-12T17:55:00.000Z"),
  endsAt: new Date("2026-07-12T18:30:00.000Z"),
  participants: [],
  confidence: "exact",
  createdAt: new Date("2026-07-12T17:00:00.000Z"),
  updatedAt: new Date("2026-07-12T17:00:00.000Z"),
};

function setup() {
  const notes: NoteRepository = {
    createRaw: vi.fn(),
    getById: vi.fn(async () => note),
    saveDerived: vi.fn(),
    appendRevision: vi.fn(),
  };
  const interactions: NoteInteractionRepository = {
    setCardReference: vi.fn(async () => note),
    applyUserPatch: vi.fn(async () => note),
  };
  const meetings: MeetingRepository = {
    save: vi.fn(),
    getById: vi.fn(async () => meeting),
    listOverlapping: vi.fn(async () => [meeting]),
  };

  return {
    service: new NoteCardService(notes, interactions, meetings),
    notes,
    interactions,
    meetings,
  };
}

describe("NoteCardService", () => {
  it("loads an owner-scoped note with verified meeting context", async () => {
    const { service, notes, meetings } = setup();

    await expect(service.getCardData(owner, noteId)).resolves.toEqual({
      note,
      meeting,
    });
    expect(notes.getById).toHaveBeenCalledWith(owner, noteId);
    expect(meetings.getById).toHaveBeenCalledWith(owner, meetingId);
  });

  it("marks organized text and priority as user-edited", async () => {
    const { service, interactions } = setup();

    await service.editOrganizedText(owner, noteId, "  User wording.  ");
    await service.setPriority(owner, noteId, "critical");

    expect(interactions.applyUserPatch).toHaveBeenNthCalledWith(1, {
      ...owner,
      noteId,
      patch: {
        organizedText: "User wording.",
        displayMode: "organized",
        removeInferredFields: ["organizedText"],
      },
    });
    expect(interactions.applyUserPatch).toHaveBeenNthCalledWith(2, {
      ...owner,
      noteId,
      patch: {
        priority: "critical",
        removeInferredFields: ["priority"],
      },
    });
  });

  it("supports reminder clearing and reversible verbatim mode", async () => {
    const { service, interactions } = setup();

    await service.setReminderIntent(owner, noteId, "   ");
    await service.setDisplayMode(owner, noteId, "verbatim");

    expect(interactions.applyUserPatch).toHaveBeenNthCalledWith(1, {
      ...owner,
      noteId,
      patch: {
        reminderIntent: null,
        explicitDueAt: null,
        removeInferredFields: ["reminderIntent", "explicitDueAt"],
      },
    });
    expect(interactions.applyUserPatch).toHaveBeenNthCalledWith(2, {
      ...owner,
      noteId,
      patch: { displayMode: "verbatim" },
    });
  });

  it("requires an owner-scoped meeting before attachment", async () => {
    const { service, interactions, meetings } = setup();

    await service.setMeeting(owner, noteId, meetingId);

    expect(meetings.getById).toHaveBeenCalledWith(owner, meetingId);
    expect(interactions.applyUserPatch).toHaveBeenCalledWith({
      ...owner,
      noteId,
      patch: { meetingId, contextConfidence: "exact" },
    });
  });
});
