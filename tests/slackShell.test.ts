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

  it("rejects bot messages, subtypes, empty text, and missing channels", () => {
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
        user: "U123",
        text: "remember this",
        ts: "123.456",
      }),
    ).toBe(false);
  });

  it("extracts the workspace from direct and authorization payloads", () => {
    expect(getWorkspaceId({ team_id: "T123" })).toBe("T123");
    expect(
      getWorkspaceId({ authorizations: [{ team_id: "T456" }] }),
    ).toBe("T456");
    expect(getWorkspaceId({})).toBeNull();
  });

  it("builds a Home tab and honest capture acknowledgements", () => {
    const home = buildMarginHomeView();
    const acknowledgement = buildCaptureAcknowledgement();
    const failure = buildCaptureFailureAcknowledgement();

    expect(home.type).toBe("home");
    expect(home.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(home)).toContain("does not record or transcribe");
    expect(JSON.stringify(acknowledgement)).toContain(
      "exact message was saved privately",
    );
    expect(JSON.stringify(failure)).toContain("could not persist this note");
  });
});
