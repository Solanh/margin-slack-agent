import { describe, expect, it, vi } from "vitest";
import type {
  NoteRetrievalResponse,
  RetrievedOriginalNote,
} from "../src/domain/retrieval.js";
import {
  NoteRetrievalService,
  parseNoteRetrievalRequest,
} from "../src/services/noteRetrieval.js";
import type { NoteRetrievalRepository } from "../src/storage/noteRetrievalRepository.js";
import {
  buildNoteRetrievalBlocks,
  buildOriginalNoteModal,
} from "../src/slack/views/noteRetrieval.js";

const owner = { workspaceId: "T123", userId: "U123" };

describe("private note retrieval", () => {
  it("interprets topic, meeting, and mentioned-person searches", () => {
    expect(
      parseNoteRetrievalRequest(
        "What did I note about customer workflows?",
      ),
    ).toMatchObject({
      searchText: "customer workflows",
      noteTypes: [],
      priorities: [],
      status: "any",
    });

    expect(
      parseNoteRetrievalRequest(
        "Find notes from Workflow Migration Review",
      )?.searchText,
    ).toBe("workflow migration review");

    expect(
      parseNoteRetrievalRequest("What did I note about Maya?")?.searchText,
    ).toBe("maya");
  });

  it("extracts type, priority, and unresolved filters", () => {
    expect(
      parseNoteRetrievalRequest("Show unresolved high priority actions"),
    ).toEqual({
      originalText: "Show unresolved high priority actions",
      searchText: null,
      noteTypes: ["action"],
      priorities: ["high"],
      status: "unresolved",
      limit: 8,
    });

    expect(
      parseNoteRetrievalRequest("List resolved questions about migration"),
    ).toMatchObject({
      searchText: "migration",
      noteTypes: ["question"],
      status: "resolved",
    });
  });

  it("does not mistake ordinary action notes for retrieval commands", () => {
    expect(
      parseNoteRetrievalRequest(
        "Find out whether migration affects customer workflows",
      ),
    ).toBeNull();
    expect(
      parseNoteRetrievalRequest("Remember to find notes for Maya later"),
    ).toBeNull();
  });

  it("passes owner scope to search and original lookup", async () => {
    const repository: NoteRetrievalRepository = {
      search: vi.fn(async () => []),
      getOriginal: vi.fn(async () => null),
    };
    const service = new NoteRetrievalService(repository);

    await service.search(owner, "Find notes about migration");
    await service.getOriginal(
      owner,
      "11111111-1111-4111-8111-111111111111",
    );

    expect(repository.search).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ searchText: "migration" }),
    );
    expect(repository.getOriginal).toHaveBeenCalledWith(
      owner,
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("renders organized results with meeting, status, and original access", () => {
    const response: NoteRetrievalResponse = {
      request: {
        originalText: "Show unresolved high priority actions",
        searchText: null,
        noteTypes: ["action"],
        priorities: ["high"],
        status: "unresolved",
        limit: 8,
      },
      notes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organizedText: "Confirm whether migration affects customers.",
          noteType: "action",
          priority: "high",
          status: "open",
          contextResolutionStatus: "attached",
          reminderIntent: "before planning",
          explicitDueAt: null,
          uncertainties: [],
          meetingTitle: "Workflow Migration Review",
          meetingStartsAt: new Date("2026-07-12T18:00:00.000Z"),
          createdAt: new Date("2026-07-12T18:05:00.000Z"),
          relevance: 1,
        },
      ],
    };

    const rendered = JSON.stringify(
      buildNoteRetrievalBlocks(response, "America/New_York"),
    );
    expect(rendered).toContain("Confirm whether migration affects customers");
    expect(rendered).toContain("Workflow Migration Review");
    expect(rendered).toContain("Open");
    expect(rendered).toContain("View original");
    expect(rendered).toContain("Only your Margin notes were searched");
  });

  it("returns useful no-results guidance", () => {
    const response: NoteRetrievalResponse = {
      request: {
        originalText: "Find notes about nonexistent topic",
        searchText: "nonexistent topic",
        noteTypes: [],
        priorities: [],
        status: "any",
        limit: 8,
      },
      notes: [],
    };

    const rendered = JSON.stringify(buildNoteRetrievalBlocks(response, "UTC"));
    expect(rendered).toContain("No matching private notes");
    expect(rendered).toContain("Show unresolved high priority actions");
  });

  it("shows the immutable original only in the owner-triggered modal", () => {
    const original: RetrievedOriginalNote = {
      id: "11111111-1111-4111-8111-111111111111",
      rawText: "rough original wording from the user",
      organizedText: "Organized wording.",
      meetingTitle: "Planning",
      meetingStartsAt: new Date("2026-07-12T18:00:00.000Z"),
      createdAt: new Date("2026-07-12T18:01:00.000Z"),
    };

    const rendered = JSON.stringify(buildOriginalNoteModal(original, "UTC"));
    expect(rendered).toContain("rough original wording from the user");
    expect(rendered).toContain("User-provided · immutable");
    expect(rendered).toContain("Organized wording");
  });
});
