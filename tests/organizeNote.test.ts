import { describe, expect, it, vi } from "vitest";
import type { Note } from "../src/domain/note.js";
import { OrganizeNoteService } from "../src/services/organizeNote.js";
import type { TransformationModel } from "../src/services/transformation.js";
import type {
  NoteRepository,
  TransformationRepository,
} from "../src/storage/noteRepository.js";

const rawNote: Note = {
  id: "note-1",
  workspaceId: "T123",
  userId: "U123",
  sourceChannelId: "D123",
  sourceMessageTs: "123.456",
  rawText: "maybe ask if the migration affects customers",
  organizedText: null,
  noteType: null,
  priority: "normal",
  status: "open",
  displayMode: "organized",
  meetingId: null,
  contextConfidence: "unresolved",
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: [],
  uncertainties: [],
  transformationVersion: null,
  cardChannelId: null,
  cardMessageTs: null,
  createdAt: new Date("2026-07-12T18:00:00.000Z"),
  updatedAt: new Date("2026-07-12T18:00:00.000Z"),
};

function noteRepository(note: Note = rawNote): NoteRepository {
  return {
    createRaw: vi.fn(),
    getById: vi.fn(async () => note),
    saveDerived: vi.fn(),
    setMeetingContext: vi.fn(),
    appendRevision: vi.fn(),
  };
}

const validTransformation = {
  organizedText: "Question: Does the migration affect customers?",
  noteType: "question" as const,
  priority: "normal" as const,
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: ["organizedText", "noteType", "priority"] as const,
  uncertainties: ["The note says maybe, so this is not a confirmed action."],
};

describe("OrganizeNoteService", () => {
  it("persists a valid transformation with its version", async () => {
    const notes = noteRepository();
    const organized: Note = {
      ...rawNote,
      organizedText: validTransformation.organizedText,
      noteType: "question",
      inferredFields: [...validTransformation.inferredFields],
      uncertainties: [...validTransformation.uncertainties],
      transformationVersion: "margin-note-v1",
    };
    const transformations: TransformationRepository = {
      applyTransformation: vi.fn(async () => organized),
    };
    const model: TransformationModel = {
      transform: vi.fn(async () => validTransformation),
    };
    const service = new OrganizeNoteService(notes, transformations, model);

    const result = await service.organize({
      workspaceId: "T123",
      userId: "U123",
      noteId: "note-1",
      userTimeZone: "America/New_York",
    });

    expect(result.status).toBe("organized");
    expect(transformations.applyTransformation).toHaveBeenCalledWith({
      workspaceId: "T123",
      userId: "U123",
      noteId: "note-1",
      transformation: validTransformation,
      transformationVersion: "margin-note-v1",
    });
    expect(rawNote.rawText).toBe(
      "maybe ask if the migration affects customers",
    );
  });

  it("keeps the note verbatim when the provider fails", async () => {
    const transformations: TransformationRepository = {
      applyTransformation: vi.fn(),
    };
    const service = new OrganizeNoteService(
      noteRepository(),
      transformations,
      {
        async transform() {
          throw new Error("provider unavailable");
        },
      },
    );

    const result = await service.organize({
      workspaceId: "T123",
      userId: "U123",
      noteId: "note-1",
      userTimeZone: "America/New_York",
    });

    expect(result).toEqual({
      status: "verbatim",
      note: rawNote,
      reason: "provider_failure",
    });
    expect(transformations.applyTransformation).not.toHaveBeenCalled();
  });

  it("keeps the note verbatim when output is invalid", async () => {
    const transformations: TransformationRepository = {
      applyTransformation: vi.fn(),
    };
    const service = new OrganizeNoteService(
      noteRepository(),
      transformations,
      {
        async transform() {
          return {
            organizedText: "Assigned to Maya.",
            noteType: "action",
            priority: "high",
            reminderIntent: null,
            explicitDueAt: null,
            inferredFields: [],
            uncertainties: [],
          };
        },
      },
    );

    const result = await service.organize({
      workspaceId: "T123",
      userId: "U123",
      noteId: "note-1",
      userTimeZone: "America/New_York",
    });

    expect(result.status).toBe("verbatim");
    if (result.status === "verbatim") {
      expect(result.reason).toBe("invalid_output");
      expect(result.note.rawText).toBe(rawNote.rawText);
    }
    expect(transformations.applyTransformation).not.toHaveBeenCalled();
  });

  it("keeps the original note when transformation persistence fails", async () => {
    const transformations: TransformationRepository = {
      async applyTransformation() {
        throw new Error("database unavailable");
      },
    };
    const service = new OrganizeNoteService(
      noteRepository(),
      transformations,
      {
        async transform() {
          return validTransformation;
        },
      },
    );

    const result = await service.organize({
      workspaceId: "T123",
      userId: "U123",
      noteId: "note-1",
      userTimeZone: "America/New_York",
    });

    expect(result).toEqual({
      status: "verbatim",
      note: rawNote,
      reason: "persistence_failure",
    });
  });
});
