import { describe, expect, it } from "vitest";
import type { OwnerScope } from "../src/domain/note.js";
import type {
  MarginMcpNoteStore,
  McpNote,
  McpNoteSearch,
} from "../src/mcp/noteStore.js";
import type {
  CreateMcpReminderInput,
  MarginMcpReminderStore,
  McpReminder,
  McpReminderStatus,
} from "../src/mcp/reminderStore.js";
import { MarginMcpTools, MARGIN_MCP_TOOLS } from "../src/mcp/tools.js";

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

class FakeNoteStore implements MarginMcpNoteStore {
  async search(_owner: OwnerScope, _request: McpNoteSearch): Promise<McpNote[]> {
    return [note];
  }

  async getById(searchOwner: OwnerScope, noteId: string): Promise<McpNote | null> {
    return searchOwner.workspaceId === owner.workspaceId && noteId === note.id
      ? note
      : null;
  }
}

class FakeReminderStore implements MarginMcpReminderStore {
  creates: Array<{ owner: OwnerScope; input: CreateMcpReminderInput }> = [];
  lists: Array<{ owner: OwnerScope; status: McpReminderStatus; limit: number }> = [];
  cancels: Array<{ owner: OwnerScope; reminderId: string }> = [];
  reminders: McpReminder[] = [];

  async createFixed(
    createOwner: OwnerScope,
    input: CreateMcpReminderInput,
  ): Promise<McpReminder> {
    this.creates.push({ owner: createOwner, input });
    const reminderId = "33333333-3333-4333-8333-333333333333";
    const existing = this.reminders.find((item) => item.id === reminderId);
    if (existing) {
      return existing;
    }
    const reminder: McpReminder = {
      id: reminderId,
      noteId: input.noteId ?? "22222222-2222-4222-8222-222222222222",
      text: input.text ?? note.rawText,
      rawText: input.text ?? note.rawText,
      scheduledFor: input.scheduledFor.toISOString(),
      status: "pending",
      deliveredAt: null,
      createdAt: "2026-07-13T22:00:00.000Z",
    };
    this.reminders.push(reminder);
    return reminder;
  }

  async list(
    listOwner: OwnerScope,
    status: McpReminderStatus,
    limit: number,
  ): Promise<McpReminder[]> {
    this.lists.push({ owner: listOwner, status, limit });
    return this.reminders
      .filter((item) => status === "any" || item.status === status)
      .slice(0, limit);
  }

  async cancel(
    cancelOwner: OwnerScope,
    reminderId: string,
  ): Promise<McpReminder | null> {
    this.cancels.push({ owner: cancelOwner, reminderId });
    const index = this.reminders.findIndex((item) => item.id === reminderId);
    if (index < 0) {
      return null;
    }
    const current = this.reminders[index];
    if (!current) {
      return null;
    }
    const updated: McpReminder =
      current.status === "pending" || current.status === "snoozed"
        ? { ...current, status: "cancelled" }
        : current;
    this.reminders[index] = updated;
    return updated;
  }
}

function tools(reminders = new FakeReminderStore()) {
  return {
    reminders,
    tools: new MarginMcpTools(
      new FakeNoteStore(),
      owner,
      "America/New_York",
      reminders,
      () => new Date("2026-07-13T22:00:00.000Z"),
    ),
  };
}

describe("Margin MCP reminder tools", () => {
  it("marks reminder creation and cancellation as write actions", () => {
    const create = MARGIN_MCP_TOOLS.find(
      (tool) => tool.name === "margin.create_reminder",
    );
    const cancel = MARGIN_MCP_TOOLS.find(
      (tool) => tool.name === "margin.cancel_reminder",
    );

    expect(create?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(cancel?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("creates a Slack-delivered reminder from exact text and time", async () => {
    const setup = tools();
    const result = await setup.tools.call("margin.create_reminder", {
      text: "Check the ngrok setup",
      scheduledFor: "2026-07-14T09:00:00-04:00",
    });

    expect(result.isError).not.toBe(true);
    expect(setup.reminders.creates).toHaveLength(1);
    expect(setup.reminders.creates[0]).toMatchObject({
      owner,
      input: {
        text: "Check the ngrok setup",
        scheduledFor: new Date("2026-07-14T13:00:00.000Z"),
      },
    });
    expect(setup.reminders.creates[0]?.input.requestKey).toMatch(/^mcp:[a-f0-9]{64}$/u);
    expect(result.content[0]?.text).toContain("private Slack DM");
  });

  it("creates an idempotent reminder for an existing note", async () => {
    const setup = tools();
    const input = {
      noteId: note.id,
      scheduledFor: "2026-07-14T09:00:00-04:00",
    };

    const first = await setup.tools.call("margin.create_reminder", input);
    const second = await setup.tools.call("margin.create_reminder", input);

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    expect(setup.reminders.creates[0]?.input.requestKey).toBe(
      setup.reminders.creates[1]?.input.requestKey,
    );
    expect(first.structuredContent).toEqual(second.structuredContent);
  });

  it("lists and cancels reminders within the configured owner", async () => {
    const setup = tools();
    const created = await setup.tools.call("margin.create_reminder", {
      text: "Review the deployment",
      scheduledFor: "2026-07-14T10:00:00-04:00",
    });
    const reminder = created.structuredContent?.reminder as McpReminder;

    const listed = await setup.tools.call("margin.list_reminders", {
      status: "pending",
      limit: 10,
    });
    expect(listed.structuredContent).toEqual({
      count: 1,
      reminders: [reminder],
    });
    expect(setup.reminders.lists).toEqual([
      { owner, status: "pending", limit: 10 },
    ]);

    const cancelled = await setup.tools.call("margin.cancel_reminder", {
      reminderId: reminder.id,
    });
    expect(cancelled.isError).not.toBe(true);
    expect(
      (cancelled.structuredContent?.reminder as McpReminder).status,
    ).toBe("cancelled");
    expect(setup.reminders.cancels).toEqual([
      { owner, reminderId: reminder.id },
    ]);
  });

  it("rejects ambiguous or unsafe reminder times", async () => {
    const setup = tools();

    const both = await setup.tools.call("margin.create_reminder", {
      noteId: note.id,
      text: "Duplicate source",
      scheduledFor: "2026-07-14T09:00:00-04:00",
    });
    const noZone = await setup.tools.call("margin.create_reminder", {
      text: "No timezone",
      scheduledFor: "2026-07-14T09:00:00",
    });
    const past = await setup.tools.call("margin.create_reminder", {
      text: "Already passed",
      scheduledFor: "2026-07-13T17:00:00-04:00",
    });

    expect(both.isError).toBe(true);
    expect(both.content[0]?.text).toContain("exactly one");
    expect(noZone.isError).toBe(true);
    expect(noZone.content[0]?.text).toContain("explicit timezone");
    expect(past.isError).toBe(true);
    expect(past.content[0]?.text).toContain("past");
    expect(setup.reminders.creates).toHaveLength(0);
  });
});
