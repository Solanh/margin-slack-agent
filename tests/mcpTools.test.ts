import { describe, expect, it } from "vitest";
import type { OwnerScope } from "../src/domain/note.js";
import type {
  MarginMcpNoteStore,
  McpNote,
  McpNoteSearch,
} from "../src/mcp/noteStore.js";
import { MarginMcpTools } from "../src/mcp/tools.js";

const owner: OwnerScope = {
  workspaceId: "T123",
  userId: "U123",
};

const note: McpNote = {
  id: "11111111-1111-4111-8111-111111111111",
  rawText: "Remember to look into ngrok",
  organizedText: null,
  noteType: null,
  priority: "normal",
  status: "open",
  displayMode: "organized",
  contextSource: "standalone",
  contextConfidence: "unresolved",
  contextResolutionStatus: "standalone",
  reminderIntent: null,
  explicitDueAt: null,
  uncertainties: [],
  createdAt: "2026-07-13T20:00:00.000Z",
  updatedAt: "2026-07-13T20:00:01.000Z",
  meeting: null,
};

class FakeStore implements MarginMcpNoteStore {
  searches: Array<{ owner: OwnerScope; request: McpNoteSearch }> = [];

  async search(searchOwner: OwnerScope, request: McpNoteSearch): Promise<McpNote[]> {
    this.searches.push({ owner: searchOwner, request });
    return [note];
  }

  async getById(searchOwner: OwnerScope, noteId: string): Promise<McpNote | null> {
    return searchOwner.workspaceId === owner.workspaceId && noteId === note.id
      ? note
      : null;
  }
}

describe("Margin MCP tools", () => {
  it("searches notes within the configured owner and local date", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "America/New_York");

    const result = await tools.call("margin.search_notes", {
      createdOn: "2026-07-13",
      meeting: "Planning",
      status: "open",
    });

    expect(result.isError).not.toBe(true);
    expect(store.searches).toEqual([
      {
        owner,
        request: {
          timeZone: "America/New_York",
          createdOn: "2026-07-13",
          meeting: "Planning",
          status: "open",
          sort: "newest",
          limit: 25,
        },
      },
    ]);
    expect(result.structuredContent).toEqual({ count: 1, notes: [note] });
  });

  it("returns all open notes for host-model action synthesis", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.list_open_notes", { limit: 10 });

    expect(result.isError).not.toBe(true);
    expect(store.searches[0]?.request).toEqual({
      timeZone: "UTC",
      status: "open",
      sort: "due",
      limit: 10,
    });
  });

  it("returns the immutable original and metadata for a note", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.get_note", { noteId: note.id });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ note });
  });

  it("reports invalid input as a tool error that the host model can correct", async () => {
    const store = new FakeStore();
    const tools = new MarginMcpTools(store, owner, "UTC");

    const result = await tools.call("margin.search_notes", {
      createdOn: "07/13/2026",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("YYYY-MM-DD");
    expect(store.searches).toHaveLength(0);
  });
});
