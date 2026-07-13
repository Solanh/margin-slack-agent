import type { WebClient } from "@slack/web-api";
import { describeError } from "../observability/safeLogger.js";

export type SlackOperationSafety = "idempotent" | "non_idempotent";

export interface SlackApiExecutionOptions {
  operation: string;
  safety: SlackOperationSafety;
  maxAttempts?: number;
}

export interface SlackApiFailureClassification {
  retryable: boolean;
  rateLimited: boolean;
  retryAfterSeconds: number | null;
  status: number | null;
  code: string | null;
  reason:
    | "rate_limit"
    | "server_error"
    | "timeout"
    | "connection"
    | "permanent";
}

export interface SlackApiExecutorOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  defaultMaxAttempts?: number;
}

export class SlackApiOperationError extends Error {
  readonly retryable: boolean;
  readonly rateLimited: boolean;
  readonly retryAfterSeconds: number | null;
  readonly status: number | null;
  readonly code: string | null;
  readonly operation: string;
  readonly attempts: number;

  constructor(
    operation: string,
    attempts: number,
    classification: SlackApiFailureClassification,
    cause: unknown,
  ) {
    super(`slack_api_${safeOperation(operation)}_${classification.reason}`, {
      cause,
    });
    this.name = "SlackApiOperationError";
    this.operation = safeOperation(operation);
    this.attempts = attempts;
    this.retryable = classification.retryable;
    this.rateLimited = classification.rateLimited;
    this.retryAfterSeconds = classification.retryAfterSeconds;
    this.status = classification.status;
    this.code = classification.code;
  }
}

export class SlackApiExecutor {
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly defaultMaxAttempts: number;

  constructor(options: SlackApiExecutorOptions = {}) {
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 10_000;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
  }

  async execute<T>(
    options: SlackApiExecutionOptions,
    operation: () => Promise<T>,
  ): Promise<T> {
    const maxAttempts =
      options.safety === "non_idempotent"
        ? 1
        : Math.max(1, options.maxAttempts ?? this.defaultMaxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const classification = classifySlackApiFailure(error);
        const shouldRetry =
          options.safety === "idempotent" &&
          classification.retryable &&
          attempt < maxAttempts;

        if (!shouldRetry) {
          throw new SlackApiOperationError(
            options.operation,
            attempt,
            classification,
            error,
          );
        }

        await this.sleep(this.retryDelayMs(classification, attempt));
      }
    }

    throw new Error("unreachable_slack_api_executor_state");
  }

  retryDelayMs(
    classification: SlackApiFailureClassification,
    attempt: number,
  ): number {
    if (
      classification.rateLimited &&
      classification.retryAfterSeconds !== null
    ) {
      return Math.max(0, classification.retryAfterSeconds * 1000);
    }

    const exponent = Math.max(0, attempt - 1);
    const exponential = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** exponent,
    );
    const jitterMultiplier = 0.5 + this.random() * 0.5;
    return Math.max(1, Math.round(exponential * jitterMultiplier));
  }
}

export function classifySlackApiFailure(
  error: unknown,
): SlackApiFailureClassification {
  const record = asRecord(error);
  const data = asRecord(record?.data);
  const original = asRecord(record?.original);
  const descriptor = describeError(error);
  const status = firstNumber(
    record?.status,
    record?.statusCode,
    data?.status,
    original?.status,
  );
  const retryAfterSeconds = firstNumber(
    record?.retryAfter,
    record?.retry_after,
    record?.retryAfterSeconds,
    data?.retry_after,
  );
  const code = firstString(record?.code, data?.error, descriptor.code);
  const normalizedCode = code?.toLowerCase() ?? "";
  const rateLimited =
    status === 429 ||
    retryAfterSeconds !== null ||
    normalizedCode.includes("rate") && normalizedCode.includes("limit");

  if (rateLimited) {
    return {
      retryable: true,
      rateLimited: true,
      retryAfterSeconds,
      status: status ?? 429,
      code,
      reason: "rate_limit",
    };
  }

  if (status !== null && status >= 500) {
    return {
      retryable: true,
      rateLimited: false,
      retryAfterSeconds: null,
      status,
      code,
      reason: "server_error",
    };
  }

  if (
    normalizedCode.includes("timeout") ||
    normalizedCode === "etimedout" ||
    descriptor.category === "infrastructure" &&
      descriptor.code === "etimedout"
  ) {
    return {
      retryable: true,
      rateLimited: false,
      retryAfterSeconds: null,
      status,
      code,
      reason: "timeout",
    };
  }

  if (
    normalizedCode.startsWith("econn") ||
    normalizedCode === "enotfound" ||
    normalizedCode === "socket_hang_up"
  ) {
    return {
      retryable: true,
      rateLimited: false,
      retryAfterSeconds: null,
      status,
      code,
      reason: "connection",
    };
  }

  return {
    retryable: false,
    rateLimited: false,
    retryAfterSeconds: null,
    status,
    code,
    reason: "permanent",
  };
}

export function nextDurableSlackRetryAt(
  error: unknown,
  now: Date,
  attempts: number,
): Date {
  if (
    error instanceof SlackApiOperationError &&
    error.retryAfterSeconds !== null
  ) {
    return new Date(now.getTime() + error.retryAfterSeconds * 1000);
  }

  const classification = classifySlackApiFailure(error);
  if (classification.retryAfterSeconds !== null) {
    return new Date(now.getTime() + classification.retryAfterSeconds * 1000);
  }

  const exponent = Math.max(0, Math.min(6, attempts - 1));
  return new Date(
    now.getTime() + Math.min(60 * 60 * 1000, 60_000 * 2 ** exponent),
  );
}

export function installSlackApiPolicy(
  client: WebClient,
  executor = new SlackApiExecutor(),
): void {
  const marker = client as unknown as Record<string, unknown>;
  if (marker.__marginRetryPolicyInstalled === true) {
    return;
  }

  const operations: Array<{
    group: string;
    method: string;
    safety: SlackOperationSafety;
  }> = [
    { group: "chat", method: "update", safety: "idempotent" },
    { group: "chat", method: "postMessage", safety: "non_idempotent" },
    { group: "conversations", method: "open", safety: "idempotent" },
    { group: "users", method: "info", safety: "idempotent" },
    { group: "views", method: "publish", safety: "idempotent" },
    { group: "views", method: "open", safety: "non_idempotent" },
    { group: "views", method: "update", safety: "idempotent" },
  ];

  for (const definition of operations) {
    wrapMethod(client, executor, definition);
  }

  marker.__marginRetryPolicyInstalled = true;
}

function wrapMethod(
  client: WebClient,
  executor: SlackApiExecutor,
  definition: {
    group: string;
    method: string;
    safety: SlackOperationSafety;
  },
): void {
  const root = client as unknown as Record<string, unknown>;
  const group = asRecord(root[definition.group]);
  const original = group?.[definition.method];
  if (!group || typeof original !== "function") {
    return;
  }

  group[definition.method] = (...arguments_: unknown[]) =>
    executor.execute(
      {
        operation: `${definition.group}.${definition.method}`,
        safety: definition.safety,
      },
      async () =>
        (original as (...values: unknown[]) => Promise<unknown>).apply(
          group,
          arguments_,
        ),
    );
}

function safeOperation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/gu, "_")
    .slice(0, 80);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value) {
      return value.slice(0, 120);
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}
