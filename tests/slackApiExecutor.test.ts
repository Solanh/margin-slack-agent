import { describe, expect, it, vi } from "vitest";
import {
  SlackApiExecutor,
  SlackApiOperationError,
  classifySlackApiFailure,
  nextDurableSlackRetryAt,
} from "../src/slack/slackApiExecutor.js";

describe("SlackApiExecutor", () => {
  it("honors Retry-After for idempotent operations", async () => {
    const delays: number[] = [];
    const executor = new SlackApiExecutor({
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      random: () => 0,
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        code: "slack_webapi_rate_limited_error",
        status: 429,
        retryAfter: 7,
      })
      .mockResolvedValue("updated");

    await expect(
      executor.execute(
        { operation: "chat.update", safety: "idempotent" },
        operation,
      ),
    ).resolves.toBe("updated");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([7000]);
  });

  it("retries transient server failures with bounded jitter", async () => {
    const delays: number[] = [];
    const executor = new SlackApiExecutor({
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      random: () => 0,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      defaultMaxAttempts: 3,
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 503, code: "service_unavailable" })
      .mockRejectedValueOnce({ code: "ETIMEDOUT" })
      .mockResolvedValue("ok");

    await expect(
      executor.execute(
        { operation: "views.publish", safety: "idempotent" },
        operation,
      ),
    ).resolves.toBe("ok");
    expect(delays).toEqual([500, 1000]);
  });

  it("never blindly retries message creation", async () => {
    const sleep = vi.fn(async () => undefined);
    const executor = new SlackApiExecutor({ sleep });
    const operation = vi.fn(async () => {
      throw { status: 503, code: "service_unavailable" };
    });

    await expect(
      executor.execute(
        { operation: "chat.postMessage", safety: "non_idempotent" },
        operation,
      ),
    ).rejects.toMatchObject({
      name: "SlackApiOperationError",
      operation: "chat.postmessage",
      attempts: 1,
      retryable: true,
      status: 503,
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry permanent Slack 4xx errors", async () => {
    const executor = new SlackApiExecutor({ sleep: vi.fn() });

    await expect(
      executor.execute(
        { operation: "chat.update", safety: "idempotent" },
        async () => {
          throw { status: 400, code: "message_not_found" };
        },
      ),
    ).rejects.toBeInstanceOf(SlackApiOperationError);
  });

  it("classifies rate limits, timeouts, connection failures, and permanent errors", () => {
    expect(classifySlackApiFailure({ status: 429, retryAfter: 3 })).toMatchObject({
      retryable: true,
      rateLimited: true,
      retryAfterSeconds: 3,
      reason: "rate_limit",
    });
    expect(classifySlackApiFailure({ code: "ETIMEDOUT" })).toMatchObject({
      retryable: true,
      reason: "timeout",
    });
    expect(classifySlackApiFailure({ code: "ECONNRESET" })).toMatchObject({
      retryable: true,
      reason: "connection",
    });
    expect(classifySlackApiFailure({ status: 403, code: "not_allowed" })).toMatchObject({
      retryable: false,
      reason: "permanent",
    });
  });

  it("persists Slack-requested timing for durable jobs", () => {
    const now = new Date("2026-07-12T20:00:00.000Z");
    const error = new SlackApiOperationError(
      "chat.postMessage",
      1,
      {
        retryable: true,
        rateLimited: true,
        retryAfterSeconds: 11,
        status: 429,
        code: "rate_limited",
        reason: "rate_limit",
      },
      new Error("provider detail"),
    );

    expect(nextDurableSlackRetryAt(error, now, 1).toISOString()).toBe(
      "2026-07-12T20:00:11.000Z",
    );
    expect(
      nextDurableSlackRetryAt(new Error("other"), now, 3).toISOString(),
    ).toBe("2026-07-12T20:04:00.000Z");
  });
});
