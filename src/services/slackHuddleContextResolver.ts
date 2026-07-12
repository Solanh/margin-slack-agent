import type {
  MeetingContext,
  OwnerScope,
} from "../domain/note.js";
import type { MeetingRepository } from "../storage/meetingRepository.js";
import type { NoteRepository } from "../storage/noteRepository.js";
import type { SlackActiveContext } from "../storage/slackContextSignalRepository.js";
import type { SlackContextSignalService } from "./slackContextSignals.js";

const CAPTURE_SKEW_MS = 30 * 1000;
const GENERIC_HUDDLE_TITLE = "Slack huddle (title unavailable)";

export type SlackHuddleResolutionStatus =
  | "attached"
  | "no_active_huddle";

export interface SlackHuddleResolutionResult {
  status: SlackHuddleResolutionStatus;
  selected: MeetingContext | null;
  activeView: SlackActiveContext | null;
}

export class SlackHuddleContextResolver {
  constructor(
    private readonly notes: NoteRepository,
    private readonly meetings: MeetingRepository,
    private readonly signals: SlackContextSignalService,
  ) {}

  async resolveForNote(
    owner: OwnerScope,
    noteId: string,
  ): Promise<SlackHuddleResolutionResult> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Owner-scoped note was not found for huddle resolution");
    }

    // A users.info refresh may be recorded milliseconds after raw capture. A
    // small skew window treats that synchronous observation as capture-time
    // evidence without extending stale state indefinitely.
    const lookupAt = new Date(note.createdAt.getTime() + CAPTURE_SKEW_MS);
    const [huddle, activeView] = await Promise.all([
      this.signals.getActiveHuddle(owner, lookupAt),
      this.signals.getActiveContext(owner, lookupAt),
    ]);

    if (!huddle || huddle.expiresAt.getTime() <= note.createdAt.getTime()) {
      return {
        status: "no_active_huddle",
        selected: null,
        activeView,
      };
    }

    const meeting = await this.meetings.save({
      ...owner,
      provider: "slack_huddle",
      providerEventId: huddle.callId,
      title: GENERIC_HUDDLE_TITLE,
      startsAt: huddle.observedAt,
      endsAt: huddle.expiresAt,
      participants: [],
      confidence: "exact",
    });

    await this.notes.setMeetingContext({
      ...owner,
      noteId,
      meetingId: meeting.id,
      contextConfidence: "exact",
    });

    return {
      status: "attached",
      selected: meeting,
      activeView,
    };
  }
}
