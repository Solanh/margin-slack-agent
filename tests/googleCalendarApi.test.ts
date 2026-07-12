import { describe, expect, it, vi } from "vitest";
import {
  GoogleCalendarApiService,
  GoogleCalendarNotConnectedError,
} from "../src/services/googleCalendarApi.js";
import {
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  GoogleCalendarOAuthClient,
} from "../src/services/googleCalendarOAuth.js";
import type {
  OAuthConnection,
  OAuthConnectionRepository,
} from "../src/storage/oauthConnectionRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };
const capturedAt = new Date("2026-07-12T18:00:00.000Z");

function connection(overrides: Partial<OAuthConnection> = {}): OAuthConnection {
  return {
    id: "connection-1",
    ...owner,
    provider: "google_calendar",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    scopes: [GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE],
    expiresAt: new Date(Date.now() + 3_600_000),
    encryptionKeyVersion: 1,
    createdAt: new Date("2026-07-12T17:00:00.000Z"),
    updatedAt: new Date("2026-07-12T17:00:00.000Z"),
    ...overrides,
  };
}

function repository(value: OAuthConnection | null): OAuthConnectionRepository {
  return {
    save: vi.fn(async (input) =>
      connection({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      }),
    ),
    get: vi.fn(async () => value),
    delete: vi.fn(async () => true),
  };
}

function oauthClient(fetchImpl = vi.fn()) {
  return new GoogleCalendarOAuthClient(
    {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://margin.example/oauth/google/calendar/callback",
    },
    fetchImpl,
  );
}

describe("GoogleCalendarApiService", () => {
  it("queries only a small overlap window and requests minimized fields", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("timeMin")).toBe(
        "2026-07-12T17:55:00.000Z",
      );
      expect(url.searchParams.get("timeMax")).toBe(
        "2026-07-12T18:05:00.000Z",
      );
      expect(url.searchParams.get("singleEvents")).toBe("true");
      const fields = url.searchParams.get("fields") ?? "";
      expect(fields).toContain("summary");
      expect(fields).toContain("attendees(email,self,responseStatus)");
      expect(fields).not.toContain("description");
      expect(fields).not.toContain("location");
      expect(fields).not.toContain("conferenceData");

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "event-1",
              summary: "Workflow Review",
              status: "confirmed",
              eventType: "default",
              start: { dateTime: "2026-07-12T17:45:00.000Z" },
              end: { dateTime: "2026-07-12T18:30:00.000Z" },
              attendees: [
                {
                  email: "USER@example.com",
                  self: true,
                  responseStatus: "accepted",
                },
                {
                  email: "MAYA@example.com",
                  responseStatus: "accepted",
                },
                {
                  email: "declined@example.com",
                  responseStatus: "declined",
                },
              ],
              organizer: { email: "owner@example.com" },
            },
            {
              id: "all-day",
              summary: "Vacation",
              start: {},
              end: {},
            },
            {
              id: "cancelled",
              summary: "Cancelled",
              status: "cancelled",
              start: { dateTime: "2026-07-12T17:45:00.000Z" },
              end: { dateTime: "2026-07-12T18:30:00.000Z" },
            },
            {
              id: "focus-time",
              summary: "Focus time",
              eventType: "focusTime",
              start: { dateTime: "2026-07-12T17:45:00.000Z" },
              end: { dateTime: "2026-07-12T18:30:00.000Z" },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const service = new GoogleCalendarApiService(
      repository(connection()),
      oauthClient(),
      fetchImpl,
    );

    await expect(
      service.listOverlappingEvents(owner, capturedAt),
    ).resolves.toEqual([
      {
        providerEventId: "event-1",
        title: "Workflow Review",
        startsAt: new Date("2026-07-12T17:45:00.000Z"),
        endsAt: new Date("2026-07-12T18:30:00.000Z"),
        participants: [
          "user@example.com",
          "maya@example.com",
          "owner@example.com",
        ],
      },
    ]);
  });

  it("refreshes an expired access token and persists the replacement", async () => {
    const connections = repository(
      connection({ expiresAt: new Date(Date.now() - 60_000) }),
    );
    const oauthFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "refreshed-token",
          expires_in: 3600,
          scope: GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
        }),
        { status: 200 },
      ),
    );
    const eventsFetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer refreshed-token",
        });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    );
    const service = new GoogleCalendarApiService(
      connections,
      oauthClient(oauthFetch),
      eventsFetch,
    );

    await service.listOverlappingEvents(owner, capturedAt);

    expect(connections.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ...owner,
        accessToken: "refreshed-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it("distinguishes a missing connection from an API failure", async () => {
    const service = new GoogleCalendarApiService(
      repository(null),
      oauthClient(),
      vi.fn(),
    );

    await expect(
      service.listOverlappingEvents(owner, capturedAt),
    ).rejects.toBeInstanceOf(GoogleCalendarNotConnectedError);
  });
});
