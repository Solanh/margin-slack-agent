import { describe, expect, it } from "vitest";
import type { OwnerScope } from "../src/domain/note.js";
import type {
  CreateMcpNoteInput,
  MarginMcpNoteMutationStore,
  MarginMcpNoteStore,
  McpNote,
  McpNoteSearch,
} from "../src/mcp/noteStore.js";
import { MarginMcpTools } from "../src/mcp/tools.js";

const owner: OwnerScope = {
  workspaceId: "T123",
  userId: "U123",
};

function note(overrides: Partial<McpNote> = {}): McpNote {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    rawText: "Keep customer workflows backward compatible",
    organizedText: null,
    noteType: "decision",
    priority: "high",
    status: "open",
    displayMode: "organized",
    contextSource: "standalone",
    contextConfidence: "unresolved",
    contextResolutionStatus: "standalone",
    reminderIntent: null,
    explicitDueAt: null,
    uncertainties: [],
    createdAt: "2026-07-13T20:00:00.000Z",
    updatedAt: "2026-07-13T20:00:00.000Z",
    meeting: null,
    sources: [
      {
        sourceType: "slack_message",
        channelId: "C123",
        messageTs: "123.456",
        permalink: "https://example.slack.com/archives/C123/p123456",
        createdAt: "2026-07-13T20:00:00.000Z",
      },
    ],
    review: {
      reasons: ["verbatim_only"],
      confirmedAt: null,
    },
    ...overrides,
  };
}

class FakeStore implements MarginMcpNoteStore, MarginMcpNoteMutationStore {
  createCalls: Array<{ owner: OwnerScope; input: CreateMcpNoteInput }> = [];
  confirmed: string[] = [];

  async search(_owner: OwnerScope, _request: McpNoteSearch): Promise<McpNote[]> {
    return [];
  }

  async getById(_owner: OwnerScope, noteId: string): Promise<McpNote | null> {
    return noteId === note().id ? note() : null;
  }

  async create(
    createOwner: OwnerScope,
    input: CreateMcpNoteInput,
  ): Promise<McpNote> {
    this.createCalls.push({ owner: createOwner, input });
    return note({
      rawText: input.text,
      noteType: input.noteType ?? null,
      priority: input.priority ?? "normal",
    });
  }

  async listNeedsReview(_owner: OwnerScope, _limit: number): Promise<McpNote[]> {
    return [note()];
  }

  async confirmReview(_owner: OwnerScope, noteId: string): Promise<McpNote | null> {
    this.confirmed.push(noteId);
    return note({
      review: {
        reasons: ["verbatim_only"],
        confirmedAt: "2026-07-13T21:00:00.000Z",
      },
    });
  }
}

describe("Margin MCP demo memory tools", () => {
  it("captures exact text with Slack message provenance", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.capture_note", {
      text: "Keep customer workflows backward compatible",
      noteType: "decision",
      priority: "high",
      source: {
        channelId: "C123",
        messageTs: "123.456",
        permalink: "https://example.slack.com/archives/C123/p123456",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(store.createCalls).toHaveLength(1);
    expect(store.createCalls[0]?.owner).toEqual(owner);
    expect(store.createCalls[0]?.input).toMatchObject({
      text: "Keep customer workflows backward compatible",
      noteType: "decision",
      priority: "high",
      source: {
        sourceType: "slack_message",
        channelId: "C123",
        messageTs: "123.456",
      },
    });
    expect(store.createCalls[0]?.input.requestKey).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("returns a focused review inbox", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.list_needs_review", { limit: 10 });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ count: 1, notes: [note()] });
  });

  it("records explicit review confirmation without rewriting the note", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.confirm_note_review", {
      noteId: note().id,
    });

    expect(result.isError).not.toBe(true);
    expect(store.confirmed).toEqual([note().id]);
    expect(
      (result.structuredContent?.note as McpNote | undefined)?.review?.confirmedAt,
    ).toBe("2026-07-13T21:00:00.000Z");
  });
});
