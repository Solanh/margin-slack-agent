import { describe, expect, it } from "vitest";
import { isUserTextMessage } from "../src/slack/listeners.js";
import { buildCaptureAcknowledgement } from "../src/slack/views/captureAcknowledgement.js";
import { buildMarginHomeView } from "../src/slack/views/home.js";

describe("Slack shell", () => {
  it("accepts a plain user-authored text message", () => {
    expect(
      isUserTextMessage({
        user: "U123",
        text: "remember this",
        ts: "123.456",
      }),
    ).toBe(true);
  });

  it("rejects bot messages, subtypes, and empty text", () => {
    expect(
      isUserTextMessage({
        bot_id: "B123",
        text: "bot echo",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        user: "U123",
        subtype: "message_changed",
        text: "edited",
        ts: "123.456",
      }),
    ).toBe(false);

    expect(
      isUserTextMessage({
        user: "U123",
        text: "   ",
        ts: "123.456",
      }),
    ).toBe(false);
  });

  it("builds a Home tab and a transparent acknowledgement", () => {
    const home = buildMarginHomeView();
    const acknowledgement = buildCaptureAcknowledgement();

    expect(home.type).toBe("home");
    expect(home.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(home)).toContain("does not record or transcribe");
    expect(JSON.stringify(acknowledgement)).toContain(
      "Durable storage and AI organization are not enabled yet",
    );
  });
});
