import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { ReminderDeliveryService } from "../src/services/reminderDelivery.js";
import {
  buildReminderDeliveryBlocks,
  buildReminderDeliveryFallback,
} from "../src/slack/views/reminderDelivery.js";
import type {
  DueReminder,
  ReminderDeliveryRepository,
} from "../src/storage/reminderRepository.js";

const reminder: DueReminder = {
  id: "11111111-1111-4111-8111-111111111111",
  noteId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "T123",
  userId: "U123",
  scheduledFor: new Date("2026-07-13T22:00:00.000Z"),
  rawText: "remember to check ngrok",
  organizedText: "Check the ngrok setup.",
  attempts: 1,
};

function repository(
  overrides: Partial<ReminderDeliveryRepository> = {},
): ReminderDeliveryRepository {
  const base: ReminderDeliveryRepository = {
    create: vi.fn(async () => {
      throw new Error("not used");
    }),
    getById: vi.fn(async () => null),
    cancel: vi.fn(async () => null),
    claimDue: vi.fn(async () => [reminder]),
    markDelivered: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
  return Object.assign(base, overrides);
}

function slackClient() {
  return {
    conversations: {
      open: vi.fn(async () => ({ channel: { id: "D-owner" } })),
    },
    chat: {
      postMessage: vi.fn(async () => ({ channel: "D-owner", ts: "999.000" })),
    },
  } as unknown as WebClient;
}

describe("reminder delivery", () => {
  it("renders the organized note while preserving a useful fallback", () => {
    expect(buildReminderDeliveryFallback(reminder)).toContain("Check the ngrok setup");
    const rendered = JSON.stringify(buildReminderDeliveryBlocks(reminder));
    expect(rendered).toContain("Margin reminder");
    expect(rendered).toContain("Check the ngrok setup");
    expect(rendered).toContain("Private DM");
  });

  it("delivers a due reminder only to its owner's private DM", async () => {
    const storage = repository();
    const client = slackClient();
    const service = new ReminderDeliveryService(storage, client);
    const now = new Date("2026-07-13T22:00:30.000Z");

    await expect(service.runOnce(now)).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      failed: 0,
    });

    expect(client.conversations.open).toHaveBeenCalledWith({ users: "U123" });
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D-owner" }),
    );
    expect(storage.markDelivered).toHaveBeenCalledWith(
      { workspaceId: "T123", userId: "U123" },
      reminder.id,
      { channelId: "D-owner", messageTs: "999.000" },
      now,
    );
  });

  it("records a retry instead of losing a failed Slack delivery", async () => {
    const storage = repository();
    const client = slackClient();
    vi.mocked(client.chat.postMessage).mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), {
        code: "slack_webapi_rate_limited_error",
        retryAfter: 2,
      }),
    );
    const service = new ReminderDeliveryService(storage, client);
    const now = new Date("2026-07-13T22:00:30.000Z");

    await expect(service.runOnce(now)).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      failed: 1,
    });

    expect(storage.markFailed).toHaveBeenCalledWith(
      { workspaceId: "T123", userId: "U123" },
      reminder.id,
      expect.any(String),
      expect.any(Date),
    );
    expect(storage.markDelivered).not.toHaveBeenCalled();
  });
});
