import { LogLevel } from "@slack/bolt";
import { describe, expect, it } from "vitest";
import {
  SafeStructuredLogger,
  classifyError,
  describeError,
  redactSensitive,
  type SafeLogRecord,
} from "../src/observability/safeLogger.js";

describe("SafeStructuredLogger", () => {
  it("never serializes arbitrary framework strings or Error messages", () => {
    const records: SafeLogRecord[] = [];
    const logger = new SafeStructuredLogger(LogLevel.DEBUG, (record) => {
      records.push(record);
    });
    logger.setName("Margin Slack");

    logger.error(
      "raw note: launch customer workflow",
      new Error("OAuth code=secret-code and note body=private words"),
    );

    expect(records).toHaveLength(1);
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("launch customer workflow");
    expect(serialized).not.toContain("secret-code");
    expect(serialized).not.toContain("private words");
    expect(records[0]).toMatchObject({
      level: "error",
      logger: "margin_slack",
      component: "slack_bolt",
      eventType: "framework_log",
      error: {
        name: "error",
        category: "unknown",
      },
    });
  });

  it("hashes owner identifiers and redacts sensitive metadata", () => {
    const records: SafeLogRecord[] = [];
    const logger = new SafeStructuredLogger(LogLevel.INFO, (record) => {
      records.push(record);
    });

    logger.logEvent("error", {
      component: "slack",
      eventType: "unhandled_bolt_error",
      correlationId: "correlation-1",
      workspaceId: "T-PRIVATE",
      userId: "U-PRIVATE",
      metadata: {
        attempt: 2,
        noteText: "private note",
        route: "message.im",
      },
    });

    expect(records[0]?.workspaceRef).toMatch(/^[0-9a-f]{16}$/u);
    expect(records[0]?.userRef).toMatch(/^[0-9a-f]{16}$/u);
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("T-PRIVATE");
    expect(serialized).not.toContain("U-PRIVATE");
    expect(serialized).not.toContain("private note");
    expect(records[0]?.metadata).toEqual({
      attempt: 2,
      noteText: "[REDACTED]",
      route: "message.im",
    });
  });

  it("redacts representative Slack, Google, OpenAI, and database payloads", () => {
    const redacted = redactSensitive({
      token: "xoxb-secret-token",
      authorization: "Bearer secret",
      body: { event: { text: "private note" } },
      oauth: { code: "authorization-code", state: "csrf-state" },
      googleCalendarDescription: "customer strategy",
      openai: { output_text: "organized private note" },
      database: {
        code: "23505",
        table: "notes",
        detail: "safe structural detail",
      },
      email: "person@example.com",
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain("xoxb-secret-token");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("authorization-code");
    expect(serialized).not.toContain("csrf-state");
    expect(serialized).not.toContain("customer strategy");
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("23505");
    expect(serialized).toContain("safe structural detail");
  });

  it("classifies retryable and non-retryable error families without messages", () => {
    expect(classifyError({ name: "RateLimitedError", status: 429 })).toBe(
      "rate_limit",
    );
    expect(classifyError({ name: "AuthorizationError", status: 401 })).toBe(
      "authentication",
    );
    expect(classifyError({ name: "ZodError", status: 400 })).toBe(
      "validation",
    );
    expect(classifyError({ name: "RequestError", code: "ETIMEDOUT" })).toBe(
      "infrastructure",
    );
    expect(classifyError({ name: "HTTPError", status: 503 })).toBe(
      "provider",
    );

    const descriptor = describeError(
      Object.assign(new Error("private body contents"), {
        code: "ETIMEDOUT",
        retryAfter: 7,
      }),
    );
    expect(descriptor).toMatchObject({
      code: "etimedout",
      category: "infrastructure",
      retryAfterSeconds: 7,
    });
    expect(JSON.stringify(descriptor)).not.toContain("private body contents");
  });
});
