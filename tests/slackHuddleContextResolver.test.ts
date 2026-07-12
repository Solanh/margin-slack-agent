import { describe, expect, it, vi } from "vitest";
import type { MeetingContext, Note } from "../src/domain/note.js";
import { SlackHuddleContextResolver } from "../src/services/slackHuddleContextResolver.js";
import type { SlackContextSignalService } from "../src/services/slackContextSignals.js";
import type { MeetingRepository } from "../src/storage/meetingRepository.js";
import type { NoteRepository } from "../src/storage/noteRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };
const noteId = "11111111-1111-4111-8111-111111111111";

const note: Note = {
  id: noteId,
  ...owner,
  sourceChannelId: "D123",
  sourceMessageTs: "123.456",
  rawText: "remember this",
  organizedText: null,
  noteType: null,
  priority: "normal",
  status: "open",
  displayMode: "organized",
  meetingId: null,
  contextConfidence: "unresolved",
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: [],
  uncertainties: [],
  transformationVersion: null,
  cardChannelId: null,
  cardMessageTs: null,
  createdAt: new Date("2026-07-12T20:00:00.000Z"),
  updatedAt: new Date("2026-07-12T20:00:00.000Z"),
};

const meeting: MeetingContext = {
  id: "22222222-2222-4222-8222-222222222222",
  ...owner,
  provider: "slack_huddle",
  providerEventId: "R123",
  title: "Slack huddle (title unavailable)",
  startsAt: new Date("2026-07-12T19:59:00.000Z"),
  endsAt: new Date("2026-07-12T20:30:00.000Z"),
  participants: [],
  confidence: "exact",
  createdAt: new Date("2026-07-12T20:00:01.000Z"),
  updatedAt: new Date("2026-07-12T20:00:01.000Z"),
};

function setup(active = true) {
  const notes: NoteRepository = {
    createRaw: vi.fn(),
    getById: vi.fn(async () => note),
    saveDerived: vi.fn(),
    setMeetingContext: vi.fn(async () => ({
      ...note,
      meetingId: meeting.id,
      contextConfidence: "exact",
    })),
    appendRevision: vi.fn(),
  };
  const meetings: MeetingRepository = {
    save: vi.fn(async () => meeting),
    getById: vi.fn(),
    listOverlapping: vi.fn(),
  };
  const signals = {
    getActiveHuddle: vi.fn(async () =>
      active
        ? {
            ...owner,
            callId: "R123",
            observedAt: new Date("2026-07-12T19:59:00.000Z"),
            expiresAt: new Date("2026-07-12T20:30:00.000Z"),
            sourceEventTs: "1783886340.000001",
          }
        : null,
    ),
    getActiveContext: vi.fn(async () => ({
      ...owner,
      entityType: "channel" as const,
      channelId: "C123",
      messageTs: null,
      observedAt: new Date("2026-07-12T19:59:30.000Z"),
      expiresAt: new Date("2026-07-12T20:15:00.000Z"),
      sourceEventTs: "1783886370.000001",
    })),
  } as unknown as SlackContextSignalService;

  return {
    resolver: new SlackHuddleContextResolver(notes, meetings, signals),
    notes,
    meetings,
    signals,
  };
}

describe("SlackHuddleContextResolver", () => {
  it("attaches a current huddle without inventing title or participants", async () => {
    const { resolver, notes, meetings } = setup();

    const result = await resolver.resolveForNote(owner, noteId);

    expect(result.status).toBe("attached");
    expect(result.selected).toEqual(meeting);
    expect(result.activeView).toMatchObject({ channelId: "C123" });
    expect(meetings.save).toHaveBeenCalledWith({
      ...owner,
      provider: "slack_huddle",
      providerEventId: "R123",
      title: "Slack huddle (title unavailable)",
      startsAt: new Date("2026-07-12T19:59:00.000Z"),
      endsAt: new Date("2026-07-12T20:30:00.000Z"),
      participants: [],
      confidence: "exact",
    });
    expect(notes.setMeetingContext).toHaveBeenCalledWith({
      ...owner,
      noteId,
      meetingId: meeting.id,
      contextConfidence: "exact",
    });
  });

  it("returns active-view context without pretending it proves a huddle", async () => {
    const { resolver, notes, meetings } = setup(false);

    await expect(resolver.resolveForNote(owner, noteId)).resolves.toEqual({
      status: "no_active_huddle",
      selected: null,
      activeView: expect.objectContaining({ channelId: "C123" }),
    });
    expect(meetings.save).not.toHaveBeenCalled();
    expect(notes.setMeetingContext).not.toHaveBeenCalled();
  });
});
