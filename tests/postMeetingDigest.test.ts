import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { PostMeetingDigestService } from "../src/services/postMeetingDigest.js";
import {
  buildPostMeetingDigestBlocks,
  buildPostMeetingDigestFallback,
} from "../src/slack/views/postMeetingDigest.js";
import type {
  PostMeetingDigest,
  PostMeetingDigestContent,
  PostMeetingDigestRepository,
} from "../src/storage/postMeetingDigestRepository.js";

const digest: PostMeetingDigest = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "T123",
  userId: "U123",
  meetingId: "22222222-2222-4222-8222-222222222222",
  meetingTitle: "Workflow Migration Review",
  meetingStartsAt: new Date("2026-07-12T18:00:00.000Z"),
  meetingEndsAt: new Date("2026-07-12T18:30:00.000Z"),
  status: "processing",
  scheduledFor: new Date("2026-07-12T18:30:00.000Z"),
  deliveredAt: null,
  snoozedUntil: null,
  slackChannelId: null,
  slackMessageTs: null,
  attempts: 1,
};

const content: PostMeetingDigestContent = {
  digest,
  notes: [
    {
      id: "note-action",
      noteType: "action",
      priority: "high",
      status: "open",
      text: "Verify rollout flag ownership.",
      rawText: "check who owns rollout flags",
      reminderIntent: "tomorrow morning",
      explicitDueAt: null,
      createdAt: new Date("2026-07-12T18:10:00.000Z"),
    },
    {
      id: "note-question",
      noteType: "question",
      priority: "normal",
      status: "resolved",
      text: "Does migration affect customer-created workflows?",
      rawText: "ask if customer workflows affected",
      reminderIntent: null,
      explicitDueAt: null,
      createdAt: new Date("2026-07-12T18:15:00.000Z"),
    },
  ],
};

function repository(overrides: Partial<PostMeetingDigestRepository> = {}) {
  const base: PostMeetingDigestRepository = {
    prepareDue: vi.fn(async () => 1),
    claimDue: vi.fn(async () => [digest]),
    getContent: vi.fn(async () => content),
    markDelivered: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    snooze: vi.fn(async () => digest),
    setDigestsEnabled: vi.fn(async () => undefined),
    areDigestsEnabled: vi.fn(async () => true),
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
      update: vi.fn(async () => ({ ok: true })),
    },
  } as unknown as WebClient;
}

describe("post-meeting digest", () => {
  it("groups owner-captured notes and shows status reminders and controls", () => {
    const rendered = JSON.stringify(buildPostMeetingDigestBlocks(content));

    expect(rendered).toContain("Actions");
    expect(rendered).toContain("Open questions");
    expect(rendered).toContain("Verify rollout flag ownership");
    expect(rendered).toContain("Reminder: tomorrow morning");
    expect(rendered).toContain("Resolved");
    expect(rendered).toContain("margin_digest_review_all");
    expect(rendered).toContain("margin_digest_snooze");
    expect(rendered).toContain("margin_digests_disable");
    expect(buildPostMeetingDigestFallback(content)).toContain("2 captured notes");
  });

  it("delivers only to the claimed owner's private DM", async () => {
    const storage = repository();
    const client = slackClient();
    const service = new PostMeetingDigestService(storage, client);

    await expect(
      service.runOnce(new Date("2026-07-12T18:31:00.000Z")),
    ).resolves.toEqual({ prepared: 1, claimed: 1, delivered: 1, failed: 0 });

    expect(client.conversations.open).toHaveBeenCalledWith({ users: "U123" });
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D-owner" }),
    );
    expect(storage.markDelivered).toHaveBeenCalledWith(
      { workspaceId: "T123", userId: "U123" },
      digest.id,
      { channelId: "D-owner", messageTs: "999.000" },
      new Date("2026-07-12T18:31:00.000Z"),
    );
  });

  it("updates the persisted message when a snoozed digest becomes due", async () => {
    const existing = {
      ...digest,
      slackChannelId: "D-owner",
      slackMessageTs: "999.000",
      attempts: 2,
    };
    const storage = repository({
      claimDue: vi.fn(async () => [existing]),
      getContent: vi.fn(async () => ({ ...content, digest: existing })),
    });
    const client = slackClient();
    const service = new PostMeetingDigestService(storage, client);

    await service.runOnce(new Date("2026-07-12T19:31:00.000Z"));

    expect(client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D-owner", ts: "999.000" }),
    );
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("does not send when the owner disabled digests", async () => {
    const storage = repository({ areDigestsEnabled: vi.fn(async () => false) });
    const client = slackClient();
    const service = new PostMeetingDigestService(storage, client);

    const result = await service.runOnce(
      new Date("2026-07-12T18:31:00.000Z"),
    );

    expect(result).toEqual({ prepared: 1, claimed: 1, delivered: 1, failed: 0 });
    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(storage.markFailed).toHaveBeenCalledWith(
      { workspaceId: "T123", userId: "U123" },
      digest.id,
      "digests_disabled",
      new Date("2026-07-13T18:31:00.000Z"),
    );
  });
});
