import { describe, expect, it } from "vitest";
import { loadGoogleEnvironment } from "../src/config.js";
import { GoogleCalendarApiService } from "../src/services/googleCalendarApi.js";
import {
  GoogleCalendarConnectionService,
  GoogleCalendarNotConfiguredError,
} from "../src/services/googleCalendarOAuth.js";

const owner = { workspaceId: "T123", userId: "U123" };

describe("optional Google Calendar integration", () => {
  it("is disabled when no Google configuration is present", () => {
    expect(loadGoogleEnvironment({})).toEqual({ enabled: false });
  });

  it("supports an explicit disabled state even when stale values exist", () => {
    expect(
      loadGoogleEnvironment({
        GOOGLE_CALENDAR_ENABLED: "false",
        GOOGLE_CLIENT_ID: "stale-client-id",
      }),
    ).toEqual({ enabled: false });
  });

  it("keeps complete legacy configuration enabled without the flag", () => {
    expect(
      loadGoogleEnvironment({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REDIRECT_URI:
          "https://margin.example/oauth/google/calendar/callback",
      }),
    ).toMatchObject({
      enabled: true,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REDIRECT_URI:
        "https://margin.example/oauth/google/calendar/callback",
      OAUTH_HTTP_HOST: "0.0.0.0",
      OAUTH_HTTP_PORT: 3000,
    });
  });

  it("rejects enabled or inferred partial configuration", () => {
    expect(() =>
      loadGoogleEnvironment({
        GOOGLE_CALENDAR_ENABLED: "true",
        GOOGLE_CLIENT_ID: "client-id",
      }),
    ).toThrow("must all be set");

    expect(() =>
      loadGoogleEnvironment({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toThrow("must all be set");
  });

  it("rejects an invalid feature flag", () => {
    expect(() =>
      loadGoogleEnvironment({ GOOGLE_CALENDAR_ENABLED: "sometimes" }),
    ).toThrow("must be true or false");
  });

  it("provides disabled service objects that fail closed", async () => {
    const connections = GoogleCalendarConnectionService.disabled();
    const calendar = GoogleCalendarApiService.disabled();

    expect(connections.isAvailable()).toBe(false);
    expect(calendar.isAvailable()).toBe(false);
    await expect(connections.isConnected(owner)).resolves.toBe(false);
    await expect(connections.disconnect(owner)).resolves.toEqual({
      disconnected: false,
      revokedRemotely: false,
    });
    await expect(connections.createAuthorizationUrl(owner)).rejects.toBeInstanceOf(
      GoogleCalendarNotConfiguredError,
    );
    await expect(
      calendar.listOverlappingEvents(owner, new Date()),
    ).rejects.toBeInstanceOf(GoogleCalendarNotConfiguredError);
  });
});
