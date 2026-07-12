import { createHash, randomUUID } from "node:crypto";
import { LogLevel } from "@slack/bolt";

export type ErrorCategory =
  | "authentication"
  | "validation"
  | "rate_limit"
  | "provider"
  | "infrastructure"
  | "programming"
  | "unknown";

export type SafeLogLevel = "debug" | "info" | "warn" | "error";

export interface SafeLogContext {
  correlationId?: string;
  component: string;
  eventType: string;
  workspaceId?: string;
  userId?: string;
  retryable?: boolean;
  metadata?: Record<string, boolean | number | string | null>;
}

export interface SafeLogRecord {
  timestamp: string;
  level: SafeLogLevel;
  logger: string;
  correlationId: string;
  component: string;
  eventType: string;
  workspaceRef?: string;
  userRef?: string;
  retryable?: boolean;
  metadata?: Record<string, boolean | number | string | null>;
  error?: SafeErrorDescriptor;
}

export interface SafeErrorDescriptor {
  name: string;
  category: ErrorCategory;
  code: string | null;
  status: number | null;
  retryAfterSeconds: number | null;
  fingerprint: string | null;
}

export type SafeLogSink = (record: SafeLogRecord) => void;

const LEVEL_RANK: Record<SafeLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY =
  /(authorization|token|secret|password|code|state|body|payload|text|note|description|calendar|raw|organized|content)/iu;

export class SafeStructuredLogger {
  private name = "margin";
  private level: LogLevel;

  constructor(
    level: LogLevel = LogLevel.INFO,
    private readonly sink: SafeLogSink = defaultSink,
  ) {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setName(name: string): void {
    this.name = safeLabel(name, "margin");
  }

  debug(...messages: unknown[]): void {
    this.frameworkLog("debug", messages);
  }

  info(...messages: unknown[]): void {
    this.frameworkLog("info", messages);
  }

  warn(...messages: unknown[]): void {
    this.frameworkLog("warn", messages);
  }

  error(...messages: unknown[]): void {
    this.frameworkLog("error", messages);
  }

  logEvent(
    level: SafeLogLevel,
    context: SafeLogContext,
    error?: unknown,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const record: SafeLogRecord = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      correlationId: context.correlationId ?? randomUUID(),
      component: safeLabel(context.component, "application"),
      eventType: safeLabel(context.eventType, "unknown_event"),
    };

    if (context.workspaceId) {
      record.workspaceRef = hashIdentifier(context.workspaceId);
    }
    if (context.userId) {
      record.userRef = hashIdentifier(context.userId);
    }
    if (context.retryable !== undefined) {
      record.retryable = context.retryable;
    }
    if (context.metadata) {
      record.metadata = sanitizeMetadata(context.metadata);
    }
    if (error !== undefined) {
      record.error = describeError(error);
    }

    this.sink(record);
  }

  private frameworkLog(level: SafeLogLevel, messages: unknown[]): void {
    const error = messages.find((message) => message instanceof Error);
    this.logEvent(
      level,
      {
        component: "slack_bolt",
        eventType: "framework_log",
        metadata: {
          argumentCount: messages.length,
          containedError: error !== undefined,
        },
      },
      error,
    );
  }

  private shouldLog(level: SafeLogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[toSafeLogLevel(this.level)];
  }
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function describeError(error: unknown): SafeErrorDescriptor {
  const record = asRecord(error);
  const name =
    error instanceof Error
      ? safeLabel(error.name, "Error")
      : safeLabel(typeof record?.name === "string" ? record.name : "UnknownError", "UnknownError");
  const code = safeCode(record?.code);
  const status = safeNumber(record?.status ?? record?.statusCode);
  const retryAfterSeconds = safeNumber(
    record?.retryAfter ?? record?.retry_after ?? record?.retryAfterSeconds,
  );
  const message = error instanceof Error ? error.message : null;

  return {
    name,
    category: classifyError({ name, code, status }),
    code,
    status,
    retryAfterSeconds,
    fingerprint: message ? shortHash(message) : null,
  };
}

export function classifyError(input: {
  name?: string | null;
  code?: string | null;
  status?: number | null;
}): ErrorCategory {
  const name = input.name?.toLowerCase() ?? "";
  const code = input.code?.toLowerCase() ?? "";
  const status = input.status ?? null;

  if (status === 429 || name.includes("ratelimit") || code.includes("rate_limit")) {
    return "rate_limit";
  }
  if (
    status === 401 ||
    status === 403 ||
    name.includes("authorization") ||
    code.includes("auth") ||
    code.includes("token")
  ) {
    return "authentication";
  }
  if (
    status === 400 ||
    name.includes("zod") ||
    name.includes("validation") ||
    code.includes("invalid")
  ) {
    return "validation";
  }
  if (
    code.startsWith("econn") ||
    code === "etimedout" ||
    code === "enotfound" ||
    name.includes("requesterror")
  ) {
    return "infrastructure";
  }
  if (status !== null && status >= 500) {
    return "provider";
  }
  if (name && name !== "unknownerror" && name !== "error") {
    return "programming";
  }
  return "unknown";
}

export function redactSensitive(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

export function hashIdentifier(value: string): string {
  return shortHash(value);
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value instanceof Error) {
    return describeError(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, seen));
  }
  if (typeof value !== "object") {
    return `[${typeof value}]`;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, 50)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED]"
      : redactValue(nested, seen);
  }
  return output;
}

function redactString(value: string): string {
  return value
    .replace(/\b(?:xox[baprs]-|xapp-|sk-)[A-Za-z0-9_-]+\b/gu, "[REDACTED_TOKEN]")
    .replace(/Bearer\s+[^\s]+/giu, "Bearer [REDACTED]")
    .replace(/[?&](?:code|state|token|access_token|refresh_token)=[^&\s]+/giu, "&$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED_EMAIL]")
    .slice(0, 500);
}

function sanitizeMetadata(
  metadata: Record<string, boolean | number | string | null>,
): Record<string, boolean | number | string | null> {
  const output: Record<string, boolean | number | string | null> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 30)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      output[key] = safeLabel(value, "unknown");
    } else {
      output[key] = value;
    }
  }
  return output;
}

function safeCode(value: unknown): string | null {
  return typeof value === "string"
    ? safeLabel(value, "unknown_code").slice(0, 80)
    : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeLabel(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 120);
  return normalized || fallback;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toSafeLogLevel(level: LogLevel): SafeLogLevel {
  switch (level) {
    case LogLevel.DEBUG:
      return "debug";
    case LogLevel.WARN:
      return "warn";
    case LogLevel.ERROR:
      return "error";
    case LogLevel.INFO:
    default:
      return "info";
  }
}

function defaultSink(record: SafeLogRecord): void {
  console.log(JSON.stringify(record));
}
