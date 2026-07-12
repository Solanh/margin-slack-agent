import type { MeetingContext, OwnerScope } from "../domain/note.js";
import type { MeetingRepository } from "../storage/meetingRepository.js";
import type { NoteRepository } from "../storage/noteRepository.js";
import {
  GoogleCalendarApiService,
  GoogleCalendarNotConnectedError,
} from "./googleCalendarApi.js";

export type CalendarResolutionStatus =
  | "already_attached"
  | "attached"
  | "ambiguous"
  | "no_candidates"
  | "not_connected"
  | "unavailable";

export interface CalendarResolutionResult {
  status: CalendarResolutionStatus;
  candidates: MeetingContext[];
  selected: MeetingContext | null;
}

export class CalendarContextResolver {
  constructor(
    private readonly notes: NoteRepository,
    private readonly meetings: MeetingRepository,
    private readonly calendar: GoogleCalendarApiService,
  ) {}

  async resolveForNote(
    owner: OwnerScope,
    noteId: string,
  ): Promise<CalendarResolutionResult> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Owner-scoped note was not found for calendar resolution");
    }

    if (note.meetingId) {
      const attached = await this.meetings.getById(owner, note.meetingId);
      if (attached) {
        return {
          status: "already_attached",
          candidates: [attached],
          selected: attached,
        };
      }
    }

    let events;
    try {
      events = await this.calendar.listOverlappingEvents(owner, note.createdAt);
    } catch (error) {
      return {
        status:
          error instanceof GoogleCalendarNotConnectedError
            ? "not_connected"
            : "unavailable",
        candidates: [],
        selected: null,
      };
    }

    const candidates: MeetingContext[] = [];
    for (const event of events) {
      const isActiveAtCapture =
        event.startsAt.getTime() <= note.createdAt.getTime() &&
        event.endsAt.getTime() > note.createdAt.getTime();
      const meeting = await this.meetings.save({
        ...owner,
        provider: "google_calendar",
        providerEventId: event.providerEventId,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        participants: event.participants,
        confidence: isActiveAtCapture ? "exact" : "high",
      });
      candidates.push(meeting);
    }

    if (candidates.length === 0) {
      return {
        status: "no_candidates",
        candidates,
        selected: null,
      };
    }

    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        candidates,
        selected: null,
      };
    }

    const selected = candidates[0];
    if (!selected) {
      throw new Error("Calendar candidate resolution produced no candidate");
    }

    await this.notes.setMeetingContext({
      ...owner,
      noteId,
      meetingId: selected.id,
      contextConfidence: selected.confidence,
    });

    return {
      status: "attached",
      candidates,
      selected,
    };
  }
}
