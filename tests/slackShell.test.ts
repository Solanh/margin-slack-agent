import { describe, expect, it } from "vitest";
import {
  getWorkspaceId,
  isUserTextMessage,
} from "../src/slack/listeners.js";
import {
  buildCaptureAcknowledgement,
  buildCaptureFailureAcknowledgement,
} from "../src/slack/views/captureAcknowledgement.js";
import { buildMarginHomeView } from "../src/slack/views/home.js";

describe("Slack shell", () => {
  it("accepts a plain user-authored text message", () => {
    expect(
      isUserTextMessage({
        channel: "D123",
        user: "U123",
        text: "remember this",
        ts: "123.456",
      }),
    ).toBe(true);
  });

  it("rejects bot messages, subtypes, empty text, shared channels, and missing channels", () => {
    expect(
      isUserTextMessage({
        channel: "D123",
        bot_id: "B123",
        text: "bot echo",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        channel: "D123",
        user: "U123",
        subtype: "message_changed",
        text: "edited",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        channel: "D123",
        user: "U123",
        text: "   ",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        channel: "C123",
        user: "U123",
        text: "private note accidentally sent here",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        user: "U123",
        text: "remember this",
        ts: "123.456",
      }),
    ).toBe(false);
  });

  it("extracts the workspace from direct, team, and authorization payloads", () => {
    expect(getWorkspaceId({ team_id: "T123" })).toBe("T123");
    expect(getWorkspaceId({ team: { id: "T234" } })).toBe("T234");
    expect(
      getWorkspaceId({ authorizations: [{ team_id: "T456" }] }),
    ).toBe("T456");
    expect(getWorkspaceId({})).toBeNull();
  });

  it("builds disconnected and connected Home tabs with honest controls", () => {
    const disconnectedHome = buildMarginHomeView({
      calendarConnected: false,
    });
    const connectedHome = buildMarginHomeView({
      calendarConnected: true,
    });
    const acknowledgement = buildCaptureAcknowledgement();
    const failure = buildCaptureFailureAcknowledgement();

    expect(disconnectedHome.type).toBe("home");
    expect(disconnectedHome.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(disconnectedHome)).toContain(
      "does not record or transcribe",
    );
    expect(JSON.stringify(disconnectedHome)).toContain("Connect Calendar");
    expect(JSON.stringify(connectedHome)).toContain(
      "Google Calendar connected",
    );
    expect(JSON.stringify(connectedHome)).toContain("Disconnect");
    expect(JSON.stringify(acknowledgement)).toContain(
      "exact message was saved privately",
    );
    expect(JSON.stringify(failure)).toContain("could not persist this note");
  });
});
