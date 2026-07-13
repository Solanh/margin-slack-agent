import { describe, expect, it } from "vitest";
import {
  assertDemoResetAllowed,
  loadDemoOwnerEnvironment,
} from "../src/demo/demoEnvironment.js";

describe("demo environment", () => {
  it("requires explicit workspace and user identifiers", () => {
    expect(() => loadDemoOwnerEnvironment({})).toThrow(
      "DEMO_WORKSPACE_ID is required",
    );
    expect(() =>
      loadDemoOwnerEnvironment({ DEMO_WORKSPACE_ID: "T123" }),
    ).toThrow("DEMO_USER_ID is required");
  });

  it("uses a deterministic fallback source channel", () => {
    expect(
      loadDemoOwnerEnvironment({
        DEMO_WORKSPACE_ID: "T123",
        DEMO_USER_ID: "U123",
      }),
    ).toEqual({
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D-MARGIN-DEMO",
    });
  });

  it("requires a confirmation token matching the exact owner", () => {
    const owner = {
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
    };
    expect(() =>
      assertDemoResetAllowed(owner, {
        NODE_ENV: "test",
        DEMO_CONFIRM_RESET: "T123:U999",
      }),
    ).toThrow("DEMO_CONFIRM_RESET must exactly equal T123:U123");
  });

  it("allows confirmed resets in development and test", () => {
    const owner = {
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
    };
    expect(() =>
      assertDemoResetAllowed(owner, {
        NODE_ENV: "test",
        DEMO_CONFIRM_RESET: "T123:U123",
      }),
    ).not.toThrow();
  });

  it("requires an additional opt-in outside development and test", () => {
    const owner = {
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
    };
    expect(() =>
      assertDemoResetAllowed(owner, {
        NODE_ENV: "production",
        DEMO_CONFIRM_RESET: "T123:U123",
      }),
    ).toThrow("Refusing demo reset outside development/test");

    expect(() =>
      assertDemoResetAllowed(owner, {
        NODE_ENV: "production",
        DEMO_CONFIRM_RESET: "T123:U123",
        DEMO_ALLOW_NON_DEVELOPMENT_RESET: "true",
      }),
    ).not.toThrow();
  });
});
