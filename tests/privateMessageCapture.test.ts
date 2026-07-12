import { describe, expect, it, vi } from "vitest";
import { handlePrivateNoteMessage } from "../src/slack/listeners.js";

const message = {
  channel: "D123",
  user: "U123",
  text: "remember the exact thing",
  ts: "123.456",
};

describe("handlePrivateNoteMessage", () => {
  it("sends success only after durable capture resolves", async () => {
    const order: string[] = [];

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        order.push("capture-start");
        await Promise.resolve();
        order.push("capture-finished");
        return {
          id: "note-1",
          workspaceId: "T123",
          userId: "U123",
          sourceChannelId: "D123",
          sourceMessageTs: "123.456",
          rawText: message.text,
          createdAt: new Date("2026-07-12T18:00:00.000Z"),
        };
      },
      reply: async (response) => {
        order.push("reply");
        expect(response.text).toContain("saved your note");
      },
      logError: vi.fn(),
    });

    expect(order).toEqual(["capture-start", "capture-finished", "reply"]);
  });

  it("reports a visible failure without claiming success", async () => {
    const replies: string[] = [];
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture: async () => {
        throw new Error("database unavailable");
      },
      reply: async (response) => {
        replies.push(response.text);
      },
      logError,
    });

    expect(replies).toEqual(["Margin could not save this note."]);
    expect(logError).toHaveBeenCalledWith(
      "Unable to persist raw note",
      expect.any(Error),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(message.text);
  });

  it("does not retry persistence when only the Slack reply fails", async () => {
    const capture = vi.fn(async () => ({
      id: "note-1",
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: message.text,
      createdAt: new Date("2026-07-12T18:00:00.000Z"),
    }));
    const logError = vi.fn();

    await handlePrivateNoteMessage({
      workspaceId: "T123",
      message,
      capture,
      reply: async () => {
        throw new Error("Slack unavailable");
      },
      logError,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "Raw note saved, but acknowledgement failed",
      expect.any(Error),
    );
  });
});
