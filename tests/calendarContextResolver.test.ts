import { describe, expect, it, vi } from "vitest";
import type { MeetingContext, Note } from "../src/domain/note.js";
import { CalendarContextResolver } from "../src/services/calendarContextResolver.js";
import {
  GoogleCalendarApiService,
  GoogleCalendarNotConnectedError,
} from "../src/services/googleCalendarApi.js";
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
  contextSource: "standalone",
  contextConfidence: "unresolved",
  contextResolutionStatus: "standalone",
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: [],
  uncertainties: [],
  transformationVersion: null,
  cardChannelId: null,
  cardMessageTs: null,
  createdAt: new Date("2026-07-12T18:00:00.000Z"),
  updatedAt: new Date("2026-07-12T18:00:00.000Z"),
};

function setup(events: Array<{
  providerEventId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  participants: string[];
}>) {
  const notes: NoteRepository = {
    createRaw: vi.fn(),
    getById: vi.fn(async () => note),
    saveDerived: vi.fn(),
    setMeetingContext: vi.fn(async (input) => ({
      ...note,
      meetingId: input.meetingId,
      contextSource: input.contextSource ?? "google_calendar",
      contextConfidence: input.contextConfidence,
      contextResolutionStatus: "attached",
    })),
    appendRevision: vi.fn(),
  };
  const meetings: MeetingRepository = {
    save: vi.fn(async (input) => ({
      id: `meeting-${input.providerEventId}`,
      ...input,
      createdAt: new Date("2026-07-12T18:01:00.000Z"),
      updatedAt: new Date("2026-07-12T18:01:00.000Z"),
    })),
    getById: vi.fn(async () => null),
    listOverlapping: vi.fn(async () => []),
  };
  const calendar = {
    listOverlappingEvents: vi.fn(async () => events),
  } as unknown as GoogleCalendarApiService;

  return {
    resolver: new CalendarContextResolver(notes, meetings, calendar),
    notes,
    meetings,
    calendar,
  };
}

const activeEvent = {
  providerEventId: "event-active",
  title: "Active meeting",
  startsAt: new Date("2026-07-12T17:45:00.000Z"),
  endsAt: new Date("2026-07-12T18:30:00.000Z"),
  participants: ["user@example.com"],
};

describe("CalendarContextResolver", () => {
  it("auto-attaches one active verified candidate", async () => {
    const { resolver, notes, meetings } = setup([activeEvent]);

    const result = await resolver.resolveForNote(owner, noteId);

    expect(result.status).toBe("attached");
    expect(result.selected).toMatchObject({
      provider: "google_calendar",
      providerEventId: "event-active",
      confidence: "exact",
    });
    expect(meetings.save).toHaveBeenCalledWith({
      ...owner,
      provider: "google_calendar",
      providerEventId: "event-active",
      title: "Active meeting",
      startsAt: activeEvent.startsAt,
      endsAt: activeEvent.endsAt,
      participants: ["user@example.com"],
      confidence: "exact",
    });
    expect(notes.setMeetingContext).toHaveBeenCalledWith({
      ...owner,
      noteId,
      meetingId: "meeting-event-active",
      contextConfidence: "exact",
    });
  });

  it("returns every plausible candidate without choosing among overlaps", async () => {
    const nearbyEvent = {
      providerEventId: "event-nearby",
      title: "Nearby meeting",
      startsAt: new Date("2026-07-12T18:02:00.000Z"),
      endsAt: new Date("2026-07-12T18:45:00.000Z"),
      participants: [],
    };
    const { resolver, notes } = setup([activeEvent, nearbyEvent]);

    const result = await resolver.resolveForNote(owner, noteId);

    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
    expect(result.selected).toBeNull();
    expect(result.candidates.map((candidate) => candidate.confidence)).toEqual([
      "exact",
      "high",
    ]);
    expect(notes.setMeetingContext).not.toHaveBeenCalled();
  });

  it("degrades to a standalone note when Calendar is disconnected", async () => {
    const { resolver, calendar, notes } = setup([]);
    vi.mocked(calendar.listOverlappingEvents).mockRejectedValue(
      new GoogleCalendarNotConnectedError(),
    );

    await expect(resolver.resolveForNote(owner, noteId)).resolves.toEqual({
      status: "not_connected",
      candidates: [],
      selected: null,
    });
    expect(notes.setMeetingContext).not.toHaveBeenCalled();
  });

  it("degrades to a standalone note for Calendar API failures", async () => {
    const { resolver, calendar } = setup([]);
    vi.mocked(calendar.listOverlappingEvents).mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(resolver.resolveForNote(owner, noteId)).resolves.toEqual({
      status: "unavailable",
      candidates: [],
      selected: null,
    });
  });
});
