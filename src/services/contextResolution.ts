import { randomUUID } from "node:crypto";
import type {
  ContextCandidate,
  ContextConfidenceSchema,
  MeetingContext,
  Note,
  OwnerScope,
} from "../domain/note.js";
import type {
  ContextCandidateRepository,
  ScoredContextCandidateInput,
} from "../storage/contextCandidateRepository.js";
import type { MeetingRepository } from "../storage/meetingRepository.js";
import type { NoteRepository } from "../storage/noteRepository.js";
import type { SlackActiveContext } from "../storage/slackContextSignalRepository.js";
import type {
  GoogleCalendarApiService,
  GoogleCalendarEventCandidate,
} from "./googleCalendarApi.js";
import type { SlackContextSignalService } from "./slackContextSignals.js";

export const CONTEXT_AUTO_ATTACH_THRESHOLD = 85;
export const CONTEXT_CLOSE_SCORE_MARGIN = 15;
const CAPTURE_SKEW_MS = 30 * 1000;
const HUDDLE_TITLE = "Slack huddle (title unavailable)";

export interface ContextResolutionResult {
  status: Note["contextResolutionStatus"];
  note: Note;
  candidates: ContextCandidate[];
  selectedMeeting: MeetingContext | null;
  activeView: SlackActiveContext | null;
}

export interface CandidateScore {
  score: number;
  confidence: typeof ContextConfidenceSchema._output;
  signals: Record<string, unknown>;
}

export class ContextResolutionService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly meetings: MeetingRepository,
    private readonly candidates: ContextCandidateRepository,
    private readonly calendar: GoogleCalendarApiService,
    private readonly slackSignals: SlackContextSignalService,
  ) {}

  async resolveForNote(
    owner: OwnerScope,
    noteId: string,
    explicitMeetingId?: string | null,
  ): Promise<ContextResolutionResult> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Owner-scoped note was not found for context resolution");
    }

    const lookupAt = new Date(note.createdAt.getTime() + CAPTURE_SKEW_MS);
    const [calendarEvents, huddle, activeView] = await Promise.all([
      this.listCalendarEvents(owner, note.createdAt),
      this.slackSignals.getActiveHuddle(owner, lookupAt),
      this.slackSignals.getActiveContext(owner, lookupAt),
    ]);

    const scored: Array<{
      candidate: ScoredContextCandidateInput;
      meeting: MeetingContext | null;
    }> = [];

    if (explicitMeetingId !== undefined && explicitMeetingId !== null) {
      const explicitMeeting = await this.meetings.getById(owner, explicitMeetingId);
      if (!explicitMeeting) {
        throw new Error("Owner-scoped explicit meeting was not found");
      }
      scored.push({
        candidate: {
          id: randomUUID(),
          meetingId: explicitMeeting.id,
          source: "explicit",
          score: 100,
          confidence: "exact",
          signals: { userProvided: true },
        },
        meeting: explicitMeeting,
      });
    }

    const calendarCount = calendarEvents.length;
    for (const event of calendarEvents) {
      const score = scoreCalendarCandidate(
        note,
        event,
        calendarCount,
      );
      const meeting = await this.meetings.save({
        ...owner,
        provider: "google_calendar",
        providerEventId: event.providerEventId,
        seriesKey: event.seriesKey,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        participants: event.participants,
        confidence: score.confidence,
      });
      scored.push({
        candidate: {
          id: randomUUID(),
          meetingId: meeting.id,
          source: "google_calendar",
          ...score,
        },
        meeting,
      });
    }

    if (
      huddle &&
      huddle.observedAt.getTime() <= lookupAt.getTime() &&
      huddle.expiresAt.getTime() > note.createdAt.getTime()
    ) {
      const score = scoreHuddleCandidate(huddle.callId !== null);
      const meeting = await this.meetings.save({
        ...owner,
        provider: "slack_huddle",
        providerEventId: huddle.callId,
        title: HUDDLE_TITLE,
        startsAt: huddle.observedAt,
        endsAt: huddle.expiresAt,
        participants: [],
        confidence: score.confidence,
      });
      scored.push({
        candidate: {
          id: randomUUID(),
          meetingId: meeting.id,
          source: "slack_huddle",
          ...score,
        },
        meeting,
      });
    }

    const standalone: ScoredContextCandidateInput = {
      id: randomUUID(),
      meetingId: null,
      source: "standalone",
      score: 0,
      confidence: "unresolved",
      signals: { alwaysAvailable: true },
    };
    const decision = decideContextResolution(scored.map((item) => item.candidate));
    const allCandidates = [...scored.map((item) => item.candidate), standalone];
    const selectedCandidateId =
      decision.status === "standalone"
        ? standalone.id
        : decision.selectedCandidateId;

    const resolvedNote = await this.candidates.persistResolution({
      ...owner,
      noteId,
      candidates: allCandidates,
      resolutionStatus: decision.status,
      selectedCandidateId,
    });
    const persistedCandidates = await this.candidates.listForNote(owner, noteId);
    const selectedMeeting = decision.selectedCandidateId
      ? scored.find(
          (item) => item.candidate.id === decision.selectedCandidateId,
        )?.meeting ?? null
      : null;

    return {
      status: decision.status,
      note: resolvedNote,
      candidates: persistedCandidates,
      selectedMeeting,
      activeView,
    };
  }

  private async listCalendarEvents(
    owner: OwnerScope,
    capturedAt: Date,
  ): Promise<GoogleCalendarEventCandidate[]> {
    try {
      return await this.calendar.listOverlappingEvents(owner, capturedAt);
    } catch {
      return [];
    }
  }
}

export function scoreCalendarCandidate(
  note: Pick<Note, "rawText" | "createdAt">,
  event: GoogleCalendarEventCandidate,
  calendarCandidateCount: number,
): CandidateScore {
  const activeAtCapture =
    event.startsAt.getTime() <= note.createdAt.getTime() &&
    event.endsAt.getTime() > note.createdAt.getTime();
  const temporalRelation = activeAtCapture ? "active" : "tolerance";
  const titleSimilarity = calculateTextSimilarity(note.rawText, event.title);
  const textBonus = Math.min(8, Math.round(titleSimilarity * 8));
  const temporalScore = activeAtCapture ? 72 : 42;
  const primaryCalendarScore = 10;
  const uniqueCandidateScore =
    calendarCandidateCount === 1 ? (activeAtCapture ? 8 : 5) : 0;
  const score = Math.min(
    92,
    temporalScore + primaryCalendarScore + uniqueCandidateScore + textBonus,
  );

  return {
    score,
    confidence: confidenceForScore(score, false),
    signals: {
      temporalRelation,
      primaryCalendar: true,
      uniqueCalendarCandidate: calendarCandidateCount === 1,
      titleSimilarity,
      textBonus,
    },
  };
}

export function scoreHuddleCandidate(callIdPresent: boolean): CandidateScore {
  const score = callIdPresent ? 95 : 92;
  return {
    score,
    confidence: "exact",
    signals: {
      directActiveHuddleState: true,
      callIdPresent,
    },
  };
}

export function scoreTextOnlyCandidate(similarity: number): CandidateScore {
  const normalized = Math.max(0, Math.min(1, similarity));
  const score = Math.min(60, Math.round(normalized * 60));
  return {
    score,
    confidence: confidenceForScore(score, false),
    signals: {
      textSimilarity: normalized,
      textOnly: true,
      highConfidenceBlocked: true,
    },
  };
}

export function decideContextResolution(
  candidates: ScoredContextCandidateInput[],
): {
  status: "attached" | "needs_clarification" | "standalone";
  selectedCandidateId: string | null;
} {
  const meetingCandidates = candidates
    .filter(
      (candidate) =>
        candidate.source !== "standalone" && candidate.meetingId !== null,
    )
    .sort((left, right) => right.score - left.score);

  const top = meetingCandidates[0];
  if (!top) {
    return { status: "standalone", selectedCandidateId: null };
  }

  const second = meetingCandidates[1];
  const hasClearLead =
    !second || top.score - second.score > CONTEXT_CLOSE_SCORE_MARGIN;
  if (top.score >= CONTEXT_AUTO_ATTACH_THRESHOLD && hasClearLead) {
    return { status: "attached", selectedCandidateId: top.id };
  }

  return { status: "needs_clarification", selectedCandidateId: null };
}

export function confidenceForScore(
  score: number,
  directExactEvidence: boolean,
): typeof ContextConfidenceSchema._output {
  if (directExactEvidence && score >= 95) {
    return "exact";
  }
  if (score >= 85) {
    return "high";
  }
  if (score >= 65) {
    return "medium";
  }
  if (score >= 40) {
    return "low";
  }
  return "unresolved";
}

export function calculateTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenSet(value: string): Set<string> {
  const stopwords = new Set([
    "about",
    "after",
    "before",
    "from",
    "have",
    "into",
    "meeting",
    "that",
    "the",
    "this",
    "with",
  ]);
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/gu)
      ?.filter((token) => token.length >= 3 && !stopwords.has(token)) ?? [],
  );
}
