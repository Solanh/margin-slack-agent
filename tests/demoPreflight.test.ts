import { describe, expect, it } from "vitest";
import {
  evaluateDemoSeed,
  formatCheckLine,
  normalizeBaseUrl,
  summarizeChecks,
} from "../src/demo/preflightChecks.js";

describe("submission preflight checks", () => {
  it("accepts a complete delivered demo dataset", () => {
    const checks = evaluateDemoSeed({
      noteCount: 9,
      meetingCount: 6,
      ambiguousCandidateCount: 3,
      digestStatus: "sent",
      digestChannelId: "D123",
      resurfacingStatus: "sent",
      resurfacingChannelId: "D123",
    });

    expect(summarizeChecks(checks)).toEqual({
      ready: true,
      passed: 5,
      warnings: 0,
      failed: 0,
    });
  });

  it("warns while seeded deliveries are waiting for a worker", () => {
    const checks = evaluateDemoSeed({
      noteCount: 10,
      meetingCount: 7,
      ambiguousCandidateCount: 3,
      digestStatus: "pending",
      digestChannelId: null,
      resurfacingStatus: "processing",
      resurfacingChannelId: null,
    });

    expect(summarizeChecks(checks)).toEqual({
      ready: true,
      passed: 3,
      warnings: 2,
      failed: 0,
    });
  });

  it("fails incomplete or incorrectly delivered seed state", () => {
    const checks = evaluateDemoSeed({
      noteCount: 2,
      meetingCount: 1,
      ambiguousCandidateCount: 0,
      digestStatus: null,
      digestChannelId: null,
      resurfacingStatus: "sent",
      resurfacingChannelId: "C_SHARED",
    });

    expect(summarizeChecks(checks)).toEqual({
      ready: false,
      passed: 0,
      warnings: 0,
      failed: 5,
    });
  });

  it("formats stable human-readable status lines", () => {
    expect(
      formatCheckLine({
        name: "Slack workspace",
        status: "pass",
        detail: "Authenticated.",
      }),
    ).toBe("[PASS] Slack workspace: Authenticated.");
  });

  it("normalizes HTTP base URLs and rejects other protocols", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3000///")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(normalizeBaseUrl("https://margin.example.com/app/")).toBe(
      "https://margin.example.com/app",
    );
    expect(() => normalizeBaseUrl("file:///tmp/margin")).toThrow(
      "PREFLIGHT_BASE_URL must use http or https",
    );
  });
});
