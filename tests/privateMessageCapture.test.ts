import { describe, expect, it, vi } from "vitest";
import type { Note } from "../src/domain/note.js";
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
    contextConfidence: "unresolved",
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

const noCalendarContext = async () => ({
  status: "not_connected" as const,
  candidates: [],
  selected: null,
});

describe("handlePrivateNoteMessage", () => {
  it("resolves optional context before organizing and updates one card", async () => {
    const order: string[] = [];
    const post = vi.fn(async () => {
      order.push("post");
      return { channel: "D123", ts: "999.000" };
    });
    const update = vi.fn(async () => {
      order.push("update");
    });

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        order.push("capture");
        return {
          id: noteId,
          workspaceId: "T123",
          userId: "U123",
          sourceChannelId: "D123",
          sourceMessageTs: "123.456",
          rawText: message.text,
          createdAt: new Date("2026-07-12T18:00:00.000Z"),
        };
      },
      recordCardReference: async () => {
        order.push("record-card");
        return completeNote({ organizedText: null, noteType: null });
      },
      resolveTimeZone: async () => "America/New_York",
      resolveCalendarContext: async () => {
        order.push("calendar");
        return {
          status: "no_candidates",
          candidates: [],
          selected: null,
        };
      },
      organize: async (input) => {
        order.push("organize");
        expect(input.verifiedMeeting).toBeUndefined();
        return {
          status: "organized",
          note: completeNote(),
          transformation: {
            organizedText: "Remember the exact thing.",
            noteType: "reference",
            priority: "normal",
            reminderIntent: null,
            explicitDueAt: null,
            inferredFields: ["organizedText", "noteType", "priority"],
            uncertainties: [],
          },
        };
      },
      getCardData: async () => {
        order.push("load-card");
        return { note: completeNote(), meeting: null };
      },
      post,
      update,
      logError: vi.fn(),
    });

    expect(order).toEqual([
      "capture",
      "post",
      "record-card",
      "calendar",
      "organize",
      "load-card",
      "update",
    ]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "D123",
        ts: "999.000",
      }),
    );
  });

  it("reports a visible persistence failure without context or organization", async () => {
    const posts: string[] = [];
    const organize = vi.fn();
    const resolveCalendarContext = vi.fn();
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        throw new Error("database unavailable");
      },
      recordCardReference: vi.fn(),
      resolveTimeZone: async () => "UTC",
      resolveCalendarContext,
      organize,
      getCardData: vi.fn(),
      post: async (response) => {
        posts.push(response.text);
        return { channel: "D123", ts: "999.000" };
      },
      update: vi.fn(),
      logError,
    });

    expect(posts).toEqual(["Margin could not save this note."]);
    expect(resolveCalendarContext).not.toHaveBeenCalled();
    expect(organize).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "Unable to persist raw note",
      expect.any(Error),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(message.text);
  });

  it("continues standalone when Calendar resolution fails", async () => {
    const organize = vi.fn(async () => ({
      status: "verbatim" as const,
      note: completeNote({ organizedText: null, noteType: null }),
      reason: "provider_failure" as const,
    }));
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => ({
        id: noteId,
        workspaceId: "T123",
        userId: "U123",
        sourceChannelId: "D123",
        sourceMessageTs: "123.456",
        rawText: message.text,
        createdAt: new Date("2026-07-12T18:00:00.000Z"),
      }),
      recordCardReference: async () => completeNote(),
      resolveTimeZone: async () => "UTC",
      resolveCalendarContext: async () => {
        throw new Error("Calendar unavailable");
      },
      organize,
      getCardData: async () => ({
        note: completeNote({ organizedText: null, noteType: null }),
        meeting: null,
      }),
      post: async () => ({ channel: "D123", ts: "999.000" }),
      update: vi.fn(),
      logError,
    });

    expect(organize).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "Calendar context resolution failed; continuing standalone",
      expect.any(Error),
    );
  });

  it("does not duplicate the note when the processing card cannot be posted", async () => {
    const capture = vi.fn(async () => ({
      id: noteId,
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: message.text,
      createdAt: new Date("2026-07-12T18:00:00.000Z"),
    }));
    const organize = vi.fn(async () => ({
      status: "verbatim" as const,
      note: completeNote({ organizedText: null, noteType: null }),
      reason: "provider_failure" as const,
    }));
    const update = vi.fn();
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture,
      recordCardReference: vi.fn(),
      resolveTimeZone: async () => "UTC",
      resolveCalendarContext: noCalendarContext,
      organize,
      getCardData: vi.fn(),
      post: async () => {
        throw new Error("Slack unavailable");
      },
      update,
      logError,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(organize).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "Raw note saved, but processing card could not be posted",
      expect.any(Error),
    );
  });
});
