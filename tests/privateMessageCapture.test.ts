import { describe, expect, it, vi } from "vitest";
import type { MeetingContext, Note } from "../src/domain/note.js";
import { handlePrivateNoteMessage } from "../src/slack/listeners.js";

const noteId = "11111111-1111-4111-8111-111111111111";
const message = {
  channel: "D123",
  user: "U123",
  text: "remember the exact thing",
  ts: "123.456",
};

function completeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: noteId,
    workspaceId: "T123",
    userId: "U123",
    sourceChannelId: "D123",
    sourceMessageTs: "123.456",
    rawText: message.text,
    organizedText: "Remember the exact thing.",
    noteType: "reference",
    priority: "normal",
    status: "open",
    displayMode: "organized",
    meetingId: null,
    contextSource: "standalone",
    contextConfidence: "unresolved",
    contextResolutionStatus: "standalone",
    reminderIntent: null,
    explicitDueAt: null,
    inferredFields: ["organizedText", "noteType", "priority"],
    uncertainties: [],
    transformationVersion: "margin-note-v1",
    cardChannelId: "D123",
    cardMessageTs: "999.000",
    createdAt: new Date("2026-07-12T18:00:00.000Z"),
    updatedAt: new Date("2026-07-12T18:00:01.000Z"),
    ...overrides,
  };
}

const huddleMeeting: MeetingContext = {
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId: "T123",
  userId: "U123",
  provider: "slack_huddle",
  providerEventId: "R123",
  title: "Slack huddle (title unavailable)",
  startsAt: new Date("2026-07-12T17:59:00.000Z"),
  endsAt: new Date("2026-07-12T18:30:00.000Z"),
  participants: [],
  confidence: "exact",
  createdAt: new Date("2026-07-12T18:00:00.000Z"),
  updatedAt: new Date("2026-07-12T18:00:00.000Z"),
};

function capturedRawNote() {
  return {
    id: noteId,
    workspaceId: "T123",
    userId: "U123",
    sourceChannelId: "D123",
    sourceMessageTs: "123.456",
    rawText: message.text,
    createdAt: new Date("2026-07-12T18:00:00.000Z"),
  };
}

const standaloneResolution = async () => ({
  status: "standalone" as const,
  note: completeNote(),
  candidates: [],
  selectedMeeting: null,
  activeView: null,
});

describe("handlePrivateNoteMessage", () => {
  it("refreshes Slack signals, resolves context once, and organizes with the selected meeting", async () => {
    const order: string[] = [];
    const organize = vi.fn(async (input) => {
      order.push("organize");
      expect(input.verifiedMeeting).toEqual(huddleMeeting);
      return {
        status: "organized" as const,
        note: completeNote({
          meetingId: huddleMeeting.id,
          contextSource: "slack_huddle",
          contextConfidence: "exact",
          contextResolutionStatus: "attached",
        }),
        transformation: {
          organizedText: "Remember the exact thing.",
          noteType: "reference" as const,
          priority: "normal" as const,
          reminderIntent: null,
          explicitDueAt: null,
          inferredFields: [
            "organizedText",
            "noteType",
            "priority",
          ] as Array<"organizedText" | "noteType" | "priority">,
          uncertainties: [],
        },
      };
    });

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        order.push("capture");
        return capturedRawNote();
      },
      recordCardReference: async () => {
        order.push("record-card");
        return completeNote({ organizedText: null, noteType: null });
      },
      refreshSlackSignals: async () => {
        order.push("slack-signals");
      },
      resolveTimeZone: async () => "America/New_York",
      resolveContext: async () => {
        order.push("context");
        return {
          status: "attached" as const,
          note: completeNote({
            meetingId: huddleMeeting.id,
            contextSource: "slack_huddle",
            contextConfidence: "exact",
            contextResolutionStatus: "attached",
          }),
          candidates: [],
          selectedMeeting: huddleMeeting,
          activeView: null,
        };
      },
      organize,
      getCardData: async () => {
        order.push("load-card");
        return {
          note: completeNote({
            meetingId: huddleMeeting.id,
            contextSource: "slack_huddle",
            contextConfidence: "exact",
            contextResolutionStatus: "attached",
          }),
          meeting: huddleMeeting,
          contextCandidates: [],
        };
      },
      post: async () => {
        order.push("post");
        return { channel: "D123", ts: "999.000" };
      },
      update: async () => {
        order.push("update");
      },
      logError: vi.fn(),
    });

    expect(order).toEqual([
      "capture",
      "post",
      "record-card",
      "slack-signals",
      "context",
      "organize",
      "load-card",
      "update",
    ]);
    expect(organize).toHaveBeenCalledTimes(1);
  });

  it("reports persistence failure before any context work", async () => {
    const posts: string[] = [];
    const refreshSlackSignals = vi.fn();
    const resolveContext = vi.fn();
    const organize = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        throw new Error("database unavailable");
      },
      recordCardReference: vi.fn(),
      refreshSlackSignals,
      resolveTimeZone: async () => "UTC",
      resolveContext,
      organize,
      getCardData: vi.fn(),
      post: async (response) => {
        posts.push(response.text);
        return { channel: "D123", ts: "999.000" };
      },
      update: vi.fn(),
      logError: vi.fn(),
    });

    expect(posts).toEqual(["Margin could not save this note."]);
    expect(refreshSlackSignals).not.toHaveBeenCalled();
    expect(resolveContext).not.toHaveBeenCalled();
    expect(organize).not.toHaveBeenCalled();
  });

  it("continues standalone when no meeting context is selected", async () => {
    const organize = vi.fn(async (input) => {
      expect(input.verifiedMeeting).toBeUndefined();
      return {
        status: "verbatim" as const,
        note: completeNote({ organizedText: null, noteType: null }),
        reason: "provider_failure" as const,
      };
    });

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => capturedRawNote(),
      recordCardReference: async () => completeNote(),
      refreshSlackSignals: async () => undefined,
      resolveTimeZone: async () => "UTC",
      resolveContext: standaloneResolution,
      organize,
      getCardData: async () => ({
        note: completeNote({ organizedText: null, noteType: null }),
        meeting: null,
        contextCandidates: [],
      }),
      post: async () => ({ channel: "D123", ts: "999.000" }),
      update: vi.fn(),
      logError: vi.fn(),
    });

    expect(organize).toHaveBeenCalledTimes(1);
  });

  it("does not block capture when Slack signal refresh fails", async () => {
    const organize = vi.fn(async () => ({
      status: "verbatim" as const,
      note: completeNote({ organizedText: null, noteType: null }),
      reason: "provider_failure" as const,
    }));
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => capturedRawNote(),
      recordCardReference: async () => completeNote(),
      refreshSlackSignals: async () => {
        throw new Error("Slack profile unavailable");
      },
      resolveTimeZone: async () => "UTC",
      resolveContext: standaloneResolution,
      organize,
      getCardData: async () => ({
        note: completeNote({ organizedText: null, noteType: null }),
        meeting: null,
        contextCandidates: [],
      }),
      post: async () => ({ channel: "D123", ts: "999.000" }),
      update: vi.fn(),
      logError,
    });

    expect(organize).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "Slack context signal refresh failed; continuing without it",
      expect.any(Error),
    );
  });

  it("continues organization when unified context resolution fails", async () => {
    const organize = vi.fn(async (input) => {
      expect(input.verifiedMeeting).toBeUndefined();
      return {
        status: "verbatim" as const,
        note: completeNote({ organizedText: null, noteType: null }),
        reason: "provider_failure" as const,
      };
    });
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => capturedRawNote(),
      recordCardReference: async () => completeNote(),
      refreshSlackSignals: async () => undefined,
      resolveTimeZone: async () => "UTC",
      resolveContext: async () => {
        throw new Error("context database unavailable");
      },
      organize,
      getCardData: async () => ({
        note: completeNote({ organizedText: null, noteType: null }),
        meeting: null,
        contextCandidates: [],
      }),
      post: async () => ({ channel: "D123", ts: "999.000" }),
      update: vi.fn(),
      logError,
    });

    expect(organize).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "Context resolution failed; continuing standalone",
      expect.any(Error),
    );
  });
});
