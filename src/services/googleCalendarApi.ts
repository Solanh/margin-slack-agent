import { z } from "zod";
import type { OwnerScope } from "../domain/note.js";
import type { OAuthConnectionRepository } from "../storage/oauthConnectionRepository.js";
import {
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  GoogleCalendarOAuthClient,
  type FetchLike,
} from "./googleCalendarOAuth.js";

const GOOGLE_CALENDAR_EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;
const DEFAULT_UPCOMING_HORIZON_MS = 24 * 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
const EVENT_FIELDS =
  "items(id,iCalUID,recurringEventId,summary,status,eventType,start(dateTime),end(dateTime),attendees(email,self,responseStatus),organizer(email,self))";

const EventAttendeeSchema = z.object({
  email: z.string().optional(),
  self: z.boolean().optional(),
  responseStatus: z.string().optional(),
});

const CalendarEventSchema = z.object({
  id: z.string().min(1),
  iCalUID: z.string().optional(),
  recurringEventId: z.string().optional(),
  summary: z.string().optional(),
  status: z.string().optional(),
  eventType: z.string().optional(),
  start: z.object({ dateTime: z.string().optional() }),
  end: z.object({ dateTime: z.string().optional() }),
  attendees: z.array(EventAttendeeSchema).optional(),
  organizer: z
    .object({
      email: z.string().optional(),
      self: z.boolean().optional(),
    })
    .optional(),
});

const EventsListResponseSchema = z.object({
  items: z.array(CalendarEventSchema).optional(),
});

export interface GoogleCalendarEventCandidate {
  providerEventId: string;
  seriesKey: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  participants: string[];
}

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected");
    this.name = "GoogleCalendarNotConnectedError";
  }
}

export class GoogleCalendarApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

export class GoogleCalendarApiService {
  constructor(
    private readonly connections: OAuthConnectionRepository,
    private readonly oauthClient: GoogleCalendarOAuthClient,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async listOverlappingEvents(
    owner: OwnerScope,
    capturedAt: Date,
    toleranceMs = DEFAULT_TOLERANCE_MS,
  ): Promise<GoogleCalendarEventCandidate[]> {
    if (!Number.isFinite(toleranceMs) || toleranceMs < 0) {
      throw new Error("Calendar overlap tolerance must be non-negative");
    }

    const windowStart = new Date(capturedAt.getTime() - toleranceMs);
    const windowEnd = new Date(capturedAt.getTime() + toleranceMs);
    return this.listEvents(owner, windowStart, windowEnd, 20);
  }

  async listUpcomingEvents(
    owner: OwnerScope,
    from: Date,
    horizonMs = DEFAULT_UPCOMING_HORIZON_MS,
  ): Promise<GoogleCalendarEventCandidate[]> {
    if (!Number.isFinite(horizonMs) || horizonMs <= 0) {
      throw new Error("Calendar upcoming horizon must be positive");
    }
    const until = new Date(from.getTime() + horizonMs);
    return this.listEvents(owner, from, until, 50);
  }

  private async listEvents(
    owner: OwnerScope,
    windowStart: Date,
    windowEnd: Date,
    maxResults: number,
  ): Promise<GoogleCalendarEventCandidate[]> {
    const accessToken = await this.getAccessToken(owner);
    const url = new URL(GOOGLE_CALENDAR_EVENTS_ENDPOINT);
    url.searchParams.set("timeMin", windowStart.toISOString());
    url.searchParams.set("timeMax", windowEnd.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("fields", EVENT_FIELDS);

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new GoogleCalendarApiError(
        `Google Calendar events endpoint returned HTTP ${response.status}`,
      );
    }

    const parsed = EventsListResponseSchema.parse(payload);
    return (parsed.items ?? [])
      .map((event) => this.normalizeEvent(event, windowStart, windowEnd))
      .filter(
        (event): event is GoogleCalendarEventCandidate => event !== null,
      );
  }

  private async getAccessToken(owner: OwnerScope): Promise<string> {
    const connection = await this.connections.get(owner, "google_calendar");
    if (!connection) {
      throw new GoogleCalendarNotConnectedError();
    }

    if (!connection.scopes.includes(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE)) {
      throw new GoogleCalendarApiError(
        "Stored Google connection lacks the required Calendar event scope",
      );
    }

    if (
      connection.expiresAt === null ||
      connection.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
    ) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      throw new GoogleCalendarApiError(
        "Google Calendar access expired without a refresh token",
      );
    }

    const refreshed = await this.oauthClient.refreshAccessToken(
      connection.refreshToken,
    );
    await this.connections.save({
      ...owner,
      provider: "google_calendar",
      accessToken: refreshed.accessToken,
      refreshToken: connection.refreshToken,
      scopes: refreshed.scopes,
      expiresAt: refreshed.expiresAt,
    });

    return refreshed.accessToken;
  }

  private normalizeEvent(
    event: z.infer<typeof CalendarEventSchema>,
    windowStart: Date,
    windowEnd: Date,
  ): GoogleCalendarEventCandidate | null {
    if (event.status === "cancelled") {
      return null;
    }
    if (event.eventType && event.eventType !== "default") {
      return null;
    }

    const selfAttendee = event.attendees?.find((attendee) => attendee.self);
    if (selfAttendee?.responseStatus === "declined") {
      return null;
    }

    if (!event.start.dateTime || !event.end.dateTime) {
      return null;
    }

    const startsAt = new Date(event.start.dateTime);
    const endsAt = new Date(event.end.dateTime);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime() ||
      startsAt.getTime() >= windowEnd.getTime() ||
      endsAt.getTime() <= windowStart.getTime()
    ) {
      return null;
    }

    const participants = new Set<string>();
    for (const attendee of event.attendees ?? []) {
      if (attendee.email && attendee.responseStatus !== "declined") {
        participants.add(attendee.email.trim().toLowerCase());
      }
    }
    if (event.organizer?.email) {
      participants.add(event.organizer.email.trim().toLowerCase());
    }

    const iCalUID = event.iCalUID?.trim();
    return {
      providerEventId: event.id,
      seriesKey: iCalUID ? `google:${iCalUID}` : null,
      title:
        event.summary?.trim() || "Calendar event (title unavailable)",
      startsAt,
      endsAt,
      participants: [...participants].filter(Boolean).slice(0, 50),
    };
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new GoogleCalendarApiError(
        "Google Calendar returned a non-JSON response",
      );
    }
  }
}
