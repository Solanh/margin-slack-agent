import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  GoogleCalendarConnectionService,
  GoogleCalendarOAuthClient,
} from "../src/services/googleCalendarOAuth.js";
import type { OAuthAuthorizationStateRepository } from "../src/storage/oauthAuthorizationStateRepository.js";
import type {
  OAuthConnection,
  OAuthConnectionRepository,
} from "../src/storage/oauthConnectionRepository.js";

const owner = { workspaceId: "T123", userId: "U123" };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function connection(overrides: Partial<OAuthConnection> = {}): OAuthConnection {
  return {
    id: "connection-1",
    ...owner,
    provider: "google_calendar",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    scopes: [GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE],
    expiresAt: new Date(Date.now() + 60_000),
    encryptionKeyVersion: 1,
    createdAt: new Date("2026-07-12T18:00:00.000Z"),
    updatedAt: new Date("2026-07-12T18:00:00.000Z"),
    ...overrides,
  };
}

function repositories() {
  const states: OAuthAuthorizationStateRepository = {
    create: vi.fn(async () => ({
      ...owner,
      state: "one-time-state",
      provider: "google_calendar",
      expiresAt: new Date(Date.now() + 600_000),
    })),
    consume: vi.fn(async () => owner),
    deleteExpired: vi.fn(async () => 0),
  };
  const connections: OAuthConnectionRepository = {
    save: vi.fn(async () => connection()),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => true),
  };
  return { states, connections };
}

describe("Google Calendar OAuth", () => {
  it("builds a least-privilege offline authorization URL", async () => {
    const { states, connections } = repositories();
    const client = new GoogleCalendarOAuthClient(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://margin.example/oauth/google/calendar/callback",
      },
      vi.fn(),
    );
    const service = new GoogleCalendarConnectionService(
      states,
      connections,
      client,
    );

    const url = new URL(await service.createAuthorizationUrl(owner));

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(
      GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("one-time-state");
    expect([...url.searchParams.getAll("scope")]).toHaveLength(1);
  });

  it("exchanges a one-time state and stores only the granted scope", async () => {
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("authorization-code");
      return jsonResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
        scope: GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
        token_type: "Bearer",
      });
    });
    const { states, connections } = repositories();
    const client = new GoogleCalendarOAuthClient(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://margin.example/oauth/google/calendar/callback",
      },
      fetchImpl,
    );
    const service = new GoogleCalendarConnectionService(
      states,
      connections,
      client,
    );

    await service.completeAuthorization(
      "one-time-state",
      "authorization-code",
    );

    expect(states.consume).toHaveBeenCalledWith(
      "one-time-state",
      "google_calendar",
    );
    expect(connections.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ...owner,
        provider: "google_calendar",
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        scopes: [GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE],
      }),
    );
  });

  it("rejects a token response without the required scope", async () => {
    const { states, connections } = repositories();
    const client = new GoogleCalendarOAuthClient(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://margin.example/oauth/google/calendar/callback",
      },
      vi.fn(async () =>
        jsonResponse({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "openid email",
        }),
      ),
    );
    const service = new GoogleCalendarConnectionService(
      states,
      connections,
      client,
    );

    await expect(
      service.completeAuthorization("one-time-state", "authorization-code"),
    ).rejects.toThrow("required read-only Calendar event scope");
    expect(connections.save).not.toHaveBeenCalled();
  });

  it("attempts remote revocation and always deletes local credentials", async () => {
    const { states, connections } = repositories();
    vi.mocked(connections.get).mockResolvedValue(connection());
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(String(init?.body)).toContain("refresh-token");
      return new Response("", { status: 200 });
    });
    const client = new GoogleCalendarOAuthClient(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://margin.example/oauth/google/calendar/callback",
      },
      fetchImpl,
    );
    const service = new GoogleCalendarConnectionService(
      states,
      connections,
      client,
    );

    await expect(service.disconnect(owner)).resolves.toEqual({
      disconnected: true,
      revokedRemotely: true,
    });
    expect(connections.delete).toHaveBeenCalledWith(owner, "google_calendar");
  });
});
