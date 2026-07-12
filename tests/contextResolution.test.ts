import { describe, expect, it, vi } from "vitest";
import type { Note } from "../src/domain/note.js";
import {
  calculateTextSimilarity,
  ContextResolutionService,
  decideContextResolution,
  scoreCalendarCandidate,
  scoreHuddleCandidate,
  scoreTextOnlyCandidate,
} from "../src/services/contextResolution.js";
import type { GoogleCalendarApiService } from "../src/services/googleCalendarApi.js";
import type { SlackContextSignalService } from "../src/services/slackContextSignals.js";
import type { ContextCandidateRepository } from "../src/storage/contextCandidateRepository.js";
import type { MeetingRepository } from "../src/storage/meetingRepository.js";
import type { NoteRepository } from "../src/storage/noteRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };
const capturedAt = new Date("2026-07-12T18:00:00.000Z");
const note: Note = {
  id: "11111111-1111-4111-8111-111111111111",
  ...owner,
  sourceChannelId: "D123",
  sourceMessageTs: "123.456",
  rawText: "ask whether workflow migration affects customer workflows",
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
  createdAt: capturedAt,
  updatedAt: capturedAt,
};

function candidate(
  id: string,
  score: number,
  source: "google_calendar" | "slack_huddle" | "explicit" =
    "google_calendar",
) {
  return {
    id,
    meetingId: `22222222-2222-4222-8222-${id.padStart(12, "0")}`,
    source,
    score,
    confidence: score >= 95 ? ("exact" as const) : ("high" as const),
    signals: {},
  };
}

describe("context scoring", () => {
  it("auto-attaches one clear active Calendar event", () => {
    const scored = scoreCalendarCandidate(
      note,
      {
        providerEventId: "event-1",
        title: "Workflow migration review",
        startsAt: new Date("2026-07-12T17:45:00.000Z"),
        endsAt: new Date("2026-07-12T18:30:00.000Z"),
        participants: [],
      },
      1,
    );

    expect(scored.score).toBeGreaterThanOrEqual(85);
    expect(scored.confidence).toBe("high");
    expect(
      decideContextResolution([
        { ...candidate("1", scored.score), ...scored },
      ]),
    ).toEqual({ status: "attached", selectedCandidateId: "1" });
  });

  it("asks when overlapping candidates are closely scored", () => {
    expect(
      decideContextResolution([candidate("1", 90), candidate("2", 86)]),
    ).toEqual({
      status: "needs_clarification",
      selectedCandidateId: null,
    });
  });

  it("asks when direct huddle and Calendar evidence could describe different meetings", () => {
    const huddle = scoreHuddleCandidate(true);
    expect(
      decideContextResolution([
        { ...candidate("1", huddle.score, "slack_huddle"), ...huddle },
        candidate("2", 90),
      ]),
    ).toEqual({
      status: "needs_clarification",
      selectedCandidateId: null,
    });
  });

  it("does not auto-attach a stale tolerance-only Calendar event", () => {
    const scored = scoreCalendarCandidate(
      note,
      {
        providerEventId: "event-stale",
        title: "Workflow migration review",
        startsAt: new Date("2026-07-12T17:30:00.000Z"),
        endsAt: new Date("2026-07-12T17:58:00.000Z"),
        participants: [],
      },
      1,
    );

    expect(scored.score).toBeLessThan(85);
    expect(
      decideContextResolution([
        { ...candidate("1", scored.score), ...scored },
      ]),
    ).toEqual({
      status: "needs_clarification",
      selectedCandidateId: null,
    });
  });

  it("uses standalone when there is no meeting evidence", () => {
    expect(decideContextResolution([])).toEqual({
      status: "standalone",
      selectedCandidateId: null,
    });
  });

  it("never allows text similarity alone to create high confidence", () => {
    const scored = scoreTextOnlyCandidate(1);
    expect(scored.score).toBeLessThan(85);
    expect(scored.confidence).not.toBe("high");
    expect(scored.confidence).not.toBe("exact");
    expect(scored.signals).toMatchObject({
      textOnly: true,
      highConfidenceBlocked: true,
    });
  });

  it("normalizes explicit context as exact and decisive", () => {
    expect(
      decideContextResolution([candidate("1", 100, "explicit")]),
    ).toEqual({ status: "attached", selectedCandidateId: "1" });
  });

  it("uses bounded token overlap rather than raw substring matching", () => {
    expect(
      calculateTextSimilarity(
        "ask about customer workflow migration",
        "Customer workflow migration review",
      ),
    ).toBeGreaterThan(0.5);
    expect(calculateTextSimilarity("unrelated note", "Planning sync")).toBe(0);
  });
});

describe("ContextResolutionService", () => {
  it("persists Calendar, huddle, and standalone candidates before returning ambiguity", async () => {
    const notes: NoteRepository = {
      createRaw: vi.fn(),
      getById: vi.fn(async () => note),
      saveDerived: vi.fn(),
      setMeetingContext: vi.fn(),
      appendRevision: vi.fn(),
    };
    let meetingNumber = 0;
    const meetings: MeetingRepository = {
      save: vi.fn(async (input) => ({
        id: `22222222-2222-4222-8222-${String(++meetingNumber).padStart(12, "0")}`,
        ...input,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      })),
      getById: vi.fn(async () => null),
      listOverlapping: vi.fn(async () => []),
    };
    const candidates: ContextCandidateRepository = {
      persistResolution: vi.fn(async (input) => ({
        ...note,
        contextResolutionStatus: input.resolutionStatus,
      })),
      listForNote: vi.fn(async () => []),
      selectCandidate: vi.fn(),
      selectExplicitMeeting: vi.fn(),
    };
    const calendar = {
      listOverlappingEvents: vi.fn(async () => [
        {
          providerEventId: "event-1",
          title: "Workflow migration review",
          startsAt: new Date("2026-07-12T17:45:00.000Z"),
          endsAt: new Date("2026-07-12T18:30:00.000Z"),
          participants: [],
        },
      ]),
    } as unknown as GoogleCalendarApiService;
    const slackSignals = {
      getActiveHuddle: vi.fn(async () => ({
        ...owner,
        callId: "R123",
        observedAt: new Date("2026-07-12T17:55:00.000Z"),
        expiresAt: new Date("2026-07-12T18:30:00.000Z"),
        sourceEventTs: null,
      })),
      getActiveContext: vi.fn(async () => null),
    } as unknown as SlackContextSignalService;
    const service = new ContextResolutionService(
      notes,
      meetings,
      candidates,
      calendar,
      slackSignals,
    );

    const result = await service.resolveForNote(owner, note.id);

    expect(result.status).toBe("needs_clarification");
    expect(candidates.persistResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        ...owner,
        noteId: note.id,
        resolutionStatus: "needs_clarification",
        selectedCandidateId: null,
        candidates: expect.arrayContaining([
          expect.objectContaining({ source: "google_calendar" }),
          expect.objectContaining({ source: "slack_huddle" }),
          expect.objectContaining({ source: "standalone", meetingId: null }),
        ]),
      }),
    );
  });
});
