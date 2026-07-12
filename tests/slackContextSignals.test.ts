import { describe, expect, it, vi } from "vitest";
import {
  parseHuddleEvent,
  parseSlackAppContext,
  SlackContextSignalService,
} from "../src/services/slackContextSignals.js";
import type { SlackContextSignalRepository } from "../src/storage/slackContextSignalRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };

function repository(known = true): SlackContextSignalRepository {
  return {
    isKnownOwner: vi.fn(async () => known),
    saveHuddleState: vi.fn(async (input) => ({
      ...input,
      sourceEventTs: input.sourceEventTs ?? null,
    })),
    deleteHuddleState: vi.fn(async () => true),
    getActiveHuddle: vi.fn(async () => null),
    saveActiveContext: vi.fn(async (input) => ({
      ...input,
      sourceEventTs: input.sourceEventTs ?? null,
    })),
    deleteActiveContext: vi.fn(async () => true),
    getActiveContext: vi.fn(async () => null),
    deleteExpired: vi.fn(async () => 0),
  };
}

function huddleEvent(state = "in_a_huddle") {
  return {
    type: "user_huddle_changed",
    event_ts: "1783886400.000001",
    user: {
      id: "U123",
      profile: {
        huddle_state: state,
        huddle_state_call_id: "R123",
        huddle_state_expiration_ts: 1783888200,
      },
    },
  };
}

describe("SlackContextSignalService", () => {
  it("parses the documented huddle state, expiration, and call ID only", () => {
    const parsed = parseHuddleEvent(huddleEvent());

    expect(parsed).toEqual({
      snapshot: {
        userId: "U123",
        state: "in_a_huddle",
        callId: "R123",
        expirationSeconds: 1783888200,
      },
      observedAt: new Date("2026-07-12T20:00:00.000Z"),
      sourceEventTs: "1783886400.000001",
    });
  });

  it("does not retain workspace-wide huddle events for unknown Margin users", async () => {
    const storage = repository(false);
    const service = new SlackContextSignalService(storage);

    await expect(
      service.recordHuddleEvent("T123", huddleEvent()),
    ).resolves.toBeNull();
    expect(storage.saveHuddleState).not.toHaveBeenCalled();
  });

  it("stores an active huddle and deletes state on leave", async () => {
    const storage = repository();
    const service = new SlackContextSignalService(storage);

    await service.recordHuddleEvent("T123", huddleEvent());
    await service.recordHuddleEvent("T123", huddleEvent("not_in_a_huddle"));

    expect(storage.saveHuddleState).toHaveBeenCalledWith({
      ...owner,
      callId: "R123",
      observedAt: new Date("2026-07-12T20:00:00.000Z"),
      expiresAt: new Date("2026-07-12T20:30:00.000Z"),
      sourceEventTs: "1783886400.000001",
    });
    expect(storage.deleteHuddleState).toHaveBeenCalledWith(owner);
  });

  it("uses a bounded fallback when Slack omits or returns stale expiration", async () => {
    const storage = repository();
    const service = new SlackContextSignalService(storage);
    const observedAt = new Date("2026-07-12T20:00:00.000Z");

    await service.recordHuddleUserProfile(
      owner,
      {
        id: "U123",
        profile: {
          huddle_state: "in_a_huddle",
          huddle_state_call_id: "R123",
          huddle_state_expiration_ts: 1,
        },
      },
      observedAt,
    );

    expect(storage.saveHuddleState).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAt,
        expiresAt: new Date("2026-07-12T20:30:00.000Z"),
      }),
    );
  });

  it("selects the first supported active-view entity by Slack relevance", () => {
    expect(
      parseSlackAppContext(
        {
          entities: [
            {
              type: "slack#/types/canvas_id",
              value: "F123",
              team_id: "T123",
            },
            {
              type: "slack#/types/message_context",
              value: { channel_id: "C123", message_ts: "123.456" },
              team_id: "T123",
            },
            {
              type: "slack#/types/channel_id",
              value: "C999",
              team_id: "T123",
            },
          ],
        },
        "T123",
      ),
    ).toEqual({
      entityType: "message",
      channelId: "C123",
      messageTs: "123.456",
    });
  });

  it("ignores cross-workspace and unsupported view context", async () => {
    const storage = repository();
    const service = new SlackContextSignalService(storage);

    await expect(
      service.recordAppContext(
        owner,
        {
          entities: [
            {
              type: "slack#/types/channel_id",
              value: "C999",
              team_id: "T-other",
            },
            { type: "slack#/types/list_id", value: "L123" },
          ],
        },
      ),
    ).resolves.toBeNull();

    expect(storage.saveActiveContext).not.toHaveBeenCalled();
    expect(storage.deleteActiveContext).toHaveBeenCalledWith(owner);
  });
});
