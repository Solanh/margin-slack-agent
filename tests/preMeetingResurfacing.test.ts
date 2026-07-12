import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { PreMeetingResurfacingService } from "../src/services/preMeetingResurfacing.js";
import {
  buildPreMeetingResurfacingBlocks,
  buildPreMeetingResurfacingFallback,
} from "../src/slack/views/preMeetingResurfacing.js";
import type { MeetingRepository } from "../src/storage/meetingRepository.js";
import type {
  PreMeetingResurfacing,
  PreMeetingResurfacingContent,
  PreMeetingResurfacingRepository,
} from "../src/storage/preMeetingResurfacingRepository.js";
import type { GoogleCalendarApiService } from "../src/services/googleCalendarApi.js";

const owner = { workspaceId: "T123", userId: "U123" };
const now = new Date("2026-07-12T18:00:00.000Z");
const resurfacing: PreMeetingResurfacing = {
  id: "11111111-1111-4111-8111-111111111111",
  ...owner,
  upcomingMeetingId: "22222222-2222-4222-8222-222222222222",
  upcomingMeetingTitle: "Planning",
  upcomingStartsAt: new Date("2026-07-12T19:00:00.000Z"),
  seriesKey: "google:planning@example.com",
  status: "processing",
  scheduledFor: new Date("2026-07-12T18:50:00.000Z"),
  deliveredAt: null,
  snoozedUntil: null,
  slackChannelId: null,
  slackMessageTs: null,
  attempts: 1,
};

const content: PreMeetingResurfacingContent = {
  resurfacing,
  notes: [
    {
      id: "action-1",
      priorMeetingId: "prior-1",
      priorMeetingTitle: "Planning",
      priorMeetingStartsAt: new Date("2026-07-05T19:00:00.000Z"),
      noteType: "action",
      status: "open",
      priority: "high",
      text: "Verify rollout flag ownership.",
      rawText: "check rollout flag owner",
      reminderIntent: null,
    },
    {
      id: "question-1",
      priorMeetingId: "prior-1",
      priorMeetingTitle: "Planning",
      priorMeetingStartsAt: new Date("2026-07-05T19:00:00.000Z"),
      noteType: "question",
      status: "open",
      priority: "normal",
      text: "Does migration affect customer workflows?",
      rawText: "ask about customer workflows",
      reminderIntent: "before planning",
    },
  ],
};

function repository(
  overrides: Partial<PreMeetingResurfacingRepository> = {},
): PreMeetingResurfacingRepository {
  return Object.assign(
    {
      listEligibleOwners: vi.fn(async () => [owner]),
      prepareForUpcoming: vi.fn(async () => true),
      claimDue: vi.fn(async () => [resurfacing]),
      getContent: vi.fn(async () => content),
      markDelivered: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
      snooze: vi.fn(async () => resurfacing),
      markIncludedNotesResolved: vi.fn(async () => 2),
      setResurfacingEnabled: vi.fn(async () => undefined),
      setSeriesEnabled: vi.fn(async () => undefined),
    },
    overrides,
  );
}

function meetings(): MeetingRepository {
  return {
    save: vi.fn(async (input) => ({
      id: resurfacing.upcomingMeetingId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      participants: input.participants,
      confidence: input.confidence,
      createdAt: now,
      updatedAt: now,
    })),
    getById: vi.fn(async () => null),
    listOverlapping: vi.fn(async () => []),
  };
}

function calendar(events: unknown[] | Error): GoogleCalendarApiService {
  return {
    listUpcomingEvents: vi.fn(async () => {
      if (events instanceof Error) {
        throw events;
      }
      return events;
    }),
  } as unknown as GoogleCalendarApiService;
}

function slackClient(): WebClient {
  return {
    conversations: {
      open: vi.fn(async () => ({ channel: { id: "D-owner" } })),
    },
    chat: {
      postMessage: vi.fn(async () => ({ ts: "999.000" })),
      update: vi.fn(async () => ({ ok: true })),
    },
  } as unknown as WebClient;
}

describe("pre-meeting resurfacing", () => {
  it("renders prior meeting provenance, status, and required controls", () => {
    const rendered = JSON.stringify(buildPreMeetingResurfacingBlocks(content));
    expect(rendered).toContain("From *Planning*");
    expect(rendered).toContain("Open actions");
    expect(rendered).toContain("Open questions");
    expect(rendered).toContain("Verify rollout flag ownership");
    expect(rendered).toContain("[Open · High]");
    expect(rendered).toContain("margin_resurfacing_resolve");
    expect(rendered).toContain("margin_resurfacing_snooze");
    expect(rendered).toContain("margin_resurfacing_open_notes");
    expect(buildPreMeetingResurfacingFallback(content)).toContain(
      "2 unresolved notes",
    );
  });

  it("prepares only a verified future series and delivers to the owner DM", async () => {
    const storage = repository();
    const meetingStorage = meetings();
    const google = calendar([
      {
        providerEventId: "instance-2",
        seriesKey: "google:planning@example.com",
        title: "Planning",
        startsAt: new Date("2026-07-12T19:00:00.000Z"),
        endsAt: new Date("2026-07-12T19:30:00.000Z"),
        participants: [],
      },
      {
        providerEventId: "one-off",
        seriesKey: null,
        title: "One off",
        startsAt: new Date("2026-07-12T20:00:00.000Z"),
        endsAt: new Date("2026-07-12T20:30:00.000Z"),
        participants: [],
      },
    ]);
    const client = slackClient();
    const service = new PreMeetingResurfacingService(
      storage,
      meetingStorage,
      google,
      client,
    );

    await expect(service.runOnce(now)).resolves.toEqual({
      owners: 1,
      prepared: 1,
      claimed: 1,
      delivered: 1,
      failed: 0,
    });
    expect(meetingStorage.save).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "instance-2",
        seriesKey: "google:planning@example.com",
      }),
    );
    expect(storage.prepareForUpcoming).toHaveBeenCalledWith({
      ...owner,
      upcomingMeetingId: resurfacing.upcomingMeetingId,
      seriesKey: "google:planning@example.com",
      scheduledFor: new Date("2026-07-12T18:50:00.000Z"),
    });
    expect(client.conversations.open).toHaveBeenCalledWith({ users: "U123" });
    expect(storage.markDelivered).toHaveBeenCalledWith(
      owner,
      resurfacing.id,
      { channelId: "D-owner", messageTs: "999.000" },
      now,
    );
  });

  it("creates no guessed reminder when Calendar resolution fails", async () => {
    const storage = repository({ claimDue: vi.fn(async () => []) });
    const service = new PreMeetingResurfacingService(
      storage,
      meetings(),
      calendar(new Error("Calendar unavailable")),
      slackClient(),
    );

    await expect(service.runOnce(now)).resolves.toEqual({
      owners: 1,
      prepared: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
    });
    expect(storage.prepareForUpcoming).not.toHaveBeenCalled();
  });

  it("updates the same private message after snooze", async () => {
    const existing = {
      ...resurfacing,
      slackChannelId: "D-owner",
      slackMessageTs: "999.000",
    };
    const storage = repository({
      listEligibleOwners: vi.fn(async () => []),
      claimDue: vi.fn(async () => [existing]),
      getContent: vi.fn(async () => ({ ...content, resurfacing: existing })),
    });
    const client = slackClient();
    const service = new PreMeetingResurfacingService(
      storage,
      meetings(),
      calendar([]),
      client,
    );

    await service.runOnce(now);
    expect(client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D-owner", ts: "999.000" }),
    );
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});
