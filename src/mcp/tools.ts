import { createHash } from "node:crypto";
import { z } from "zod";
import {
  NoteStatusSchema,
  NoteTypeSchema,
  PrioritySchema,
  type OwnerScope,
} from "../domain/note.js";
import type {
  MarginMcpNoteStore,
  McpNoteSearch,
} from "./noteStore.js";
import type {
  MarginMcpReminderStore,
  McpReminderStatus,
} from "./reminderStore.js";

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown> | undefined;
  isError?: boolean | undefined;
}

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a calendar date in YYYY-MM-DD format");

const ZonedDateTimeSchema = z.string().trim().refine(
  (value) =>
    /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value)),
  "Use an ISO 8601 timestamp with an explicit timezone, such as 2026-07-14T09:00:00-04:00",
);

const SearchNotesInputSchema = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    createdOn: DateSchema.optional(),
    timeZone: z.string().trim().min(1).max(100).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    meeting: z.string().trim().min(1).max(200).optional(),
    noteTypes: z.array(NoteTypeSchema).max(5).optional(),
    priorities: z.array(PrioritySchema).max(4).optional(),
    status: z
      .enum(["any", ...NoteStatusSchema.options] as const)
      .default("any"),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

const ListOpenNotesInputSchema = z
  .object({
    createdOn: DateSchema.optional(),
    timeZone: z.string().trim().min(1).max(100).optional(),
    meeting: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

const GetNoteInputSchema = z
  .object({
    noteId: z.string().uuid(),
  })
  .strict();

const CreateReminderInputSchema = z
  .object({
    noteId: z.string().uuid().optional(),
    text: z.string().trim().min(1).max(2_000).optional(),
    scheduledFor: ZonedDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.noteId) === Boolean(value.text)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one of noteId or text",
      });
    }
  });

const ListRemindersInputSchema = z
  .object({
    status: z
      .enum(["any", "pending", "sent", "snoozed", "cancelled"])
      .default("pending"),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

const CancelReminderInputSchema = z
  .object({
    reminderId: z.string().uuid(),
  })
  .strict();

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const CREATE_REMINDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const CANCEL_REMINDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const MARGIN_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "margin.search_notes",
    title: "Search Margin notes",
    description:
      "Search the current user's private Margin notes by date, meeting, topic, type, priority, or status. Use createdOn for questions like 'my notes today'. The server only retrieves data; use the host LLM to summarize or reason over the returned notes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: {
          type: "string",
          description: "Optional text to match in the raw note, organized note, or meeting title.",
        },
        createdOn: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Local calendar date in YYYY-MM-DD format.",
        },
        timeZone: {
          type: "string",
          description: "IANA timezone for createdOn, such as America/New_York.",
        },
        createdAfter: {
          type: "string",
          format: "date-time",
          description: "Inclusive ISO timestamp lower bound.",
        },
        createdBefore: {
          type: "string",
          format: "date-time",
          description: "Exclusive ISO timestamp upper bound.",
        },
        meeting: {
          type: "string",
          description: "Case-insensitive partial meeting-title match.",
        },
        noteTypes: {
          type: "array",
          items: { enum: NoteTypeSchema.options },
          maxItems: 5,
        },
        priorities: {
          type: "array",
          items: { enum: PrioritySchema.options },
          maxItems: 4,
        },
        status: {
          enum: ["any", ...NoteStatusSchema.options],
          default: "any",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "margin.list_open_notes",
    title: "List open Margin notes",
    description:
      "Return the user's open notes, including verbatim notes that were never AI-classified. Use this for questions like 'what do I need to do?' or 'what is still unresolved?', then let the host LLM identify actions and priorities.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        createdOn: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Optional local calendar date in YYYY-MM-DD format.",
        },
        timeZone: {
          type: "string",
          description: "IANA timezone for createdOn, such as America/New_York.",
        },
        meeting: {
          type: "string",
          description: "Optional case-insensitive partial meeting-title match.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50,
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "margin.get_note",
    title: "Get a Margin note",
    description:
      "Get one private Margin note by ID, including its immutable original, organized form, reminder information, status, uncertainty, and attached meeting metadata.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        noteId: { type: "string", format: "uuid" },
      },
      required: ["noteId"],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "margin.list_reminders",
    title: "List Margin reminders",
    description:
      "List the current user's fixed-time Margin reminders and their delivery status. Use this before changing or cancelling a reminder.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          enum: ["any", "pending", "sent", "snoozed", "cancelled"],
          default: "pending",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50,
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "margin.create_reminder",
    title: "Create a Margin reminder",
    description:
      "Create a fixed-time reminder that Margin will later deliver in the configured user's private Slack DM. Use only after the user asks to be reminded. Supply exactly one existing noteId or new reminder text. scheduledFor must be an exact ISO 8601 timestamp with timezone; do not guess an ambiguous date or time. This is a write action with an external future effect.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        noteId: {
          type: "string",
          format: "uuid",
          description: "Existing owner-scoped Margin note to remind about.",
        },
        text: {
          type: "string",
          minLength: 1,
          maxLength: 2_000,
          description: "Exact reminder text to preserve as a new Margin note.",
        },
        scheduledFor: {
          type: "string",
          description:
            "Exact ISO 8601 timestamp with timezone, for example 2026-07-14T09:00:00-04:00.",
        },
      },
      required: ["scheduledFor"],
      oneOf: [
        { required: ["noteId"], not: { required: ["text"] } },
        { required: ["text"], not: { required: ["noteId"] } },
      ],
    },
    annotations: CREATE_REMINDER_ANNOTATIONS,
  },
  {
    name: "margin.cancel_reminder",
    title: "Cancel a Margin reminder",
    description:
      "Cancel one pending or snoozed Margin reminder by ID. This changes future behavior and should be confirmed with the user. Sent reminders cannot be cancelled.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reminderId: { type: "string", format: "uuid" },
      },
      required: ["reminderId"],
    },
    annotations: CANCEL_REMINDER_ANNOTATIONS,
  },
];

export class UnknownMcpToolError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = "UnknownMcpToolError";
  }
}

export class MarginMcpTools {
  constructor(
    private readonly store: MarginMcpNoteStore,
    private readonly owner: OwnerScope,
    private readonly defaultTimeZone: string,
    private readonly reminders?: MarginMcpReminderStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    assertTimeZone(defaultTimeZone);
  }

  list(): McpToolDefinition[] {
    return MARGIN_MCP_TOOLS;
  }

  async call(name: string, argumentsValue: unknown): Promise<McpToolResult> {
    try {
      switch (name) {
        case "margin.search_notes":
          return await this.searchNotes(argumentsValue);
        case "margin.list_open_notes":
          return await this.listOpenNotes(argumentsValue);
        case "margin.get_note":
          return await this.getNote(argumentsValue);
        case "margin.list_reminders":
          return await this.listReminders(argumentsValue);
        case "margin.create_reminder":
          return await this.createReminder(argumentsValue);
        case "margin.cancel_reminder":
          return await this.cancelReminder(argumentsValue);
        default:
          throw new UnknownMcpToolError(name);
      }
    } catch (error) {
      if (error instanceof UnknownMcpToolError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Unknown tool error";
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  }

  private async searchNotes(argumentsValue: unknown): Promise<McpToolResult> {
    const input = SearchNotesInputSchema.parse(argumentsValue ?? {});
    const timeZone = input.timeZone ?? this.defaultTimeZone;
    assertTimeZone(timeZone);

    const request: McpNoteSearch = {
      timeZone,
      status: input.status,
      sort: "newest",
      limit: input.limit,
      ...(input.text ? { text: input.text } : {}),
      ...(input.createdOn ? { createdOn: input.createdOn } : {}),
      ...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
      ...(input.createdBefore ? { createdBefore: input.createdBefore } : {}),
      ...(input.meeting ? { meeting: input.meeting } : {}),
      ...(input.noteTypes ? { noteTypes: input.noteTypes } : {}),
      ...(input.priorities ? { priorities: input.priorities } : {}),
    };
    const notes = await this.store.search(this.owner, request);
    return toolJson({ count: notes.length, notes });
  }

  private async listOpenNotes(argumentsValue: unknown): Promise<McpToolResult> {
    const input = ListOpenNotesInputSchema.parse(argumentsValue ?? {});
    const timeZone = input.timeZone ?? this.defaultTimeZone;
    assertTimeZone(timeZone);

    const request: McpNoteSearch = {
      timeZone,
      status: "open",
      sort: "due",
      limit: input.limit,
      ...(input.createdOn ? { createdOn: input.createdOn } : {}),
      ...(input.meeting ? { meeting: input.meeting } : {}),
    };
    const notes = await this.store.search(this.owner, request);
    return toolJson({ count: notes.length, notes });
  }

  private async getNote(argumentsValue: unknown): Promise<McpToolResult> {
    const input = GetNoteInputSchema.parse(argumentsValue ?? {});
    const note = await this.store.getById(this.owner, input.noteId);
    if (!note) {
      return {
        content: [{ type: "text", text: `No note found for ID ${input.noteId}` }],
        structuredContent: { note: null },
        isError: true,
      };
    }
    return toolJson({ note });
  }

  private async listReminders(argumentsValue: unknown): Promise<McpToolResult> {
    const input = ListRemindersInputSchema.parse(argumentsValue ?? {});
    const reminders = await this.requireReminderStore().list(
      this.owner,
      input.status as McpReminderStatus,
      input.limit,
    );
    return toolJson({ count: reminders.length, reminders });
  }

  private async createReminder(argumentsValue: unknown): Promise<McpToolResult> {
    const input = CreateReminderInputSchema.parse(argumentsValue ?? {});
    const scheduledFor = new Date(input.scheduledFor);
    const oldestAllowed = this.now().getTime() - 5 * 60_000;
    if (scheduledFor.getTime() < oldestAllowed) {
      throw new Error(
        "scheduledFor is more than five minutes in the past; confirm the intended date and timezone",
      );
    }

    const requestKey = reminderRequestKey(
      this.owner,
      input.noteId,
      input.text,
      scheduledFor.toISOString(),
    );
    const reminder = await this.requireReminderStore().createFixed(this.owner, {
      scheduledFor,
      requestKey,
      ...(input.noteId ? { noteId: input.noteId } : {}),
      ...(input.text ? { text: input.text } : {}),
    });
    return toolJson({
      reminder,
      delivery:
        "Margin will deliver this reminder in the configured user's private Slack DM while the Margin application is running.",
    });
  }

  private async cancelReminder(argumentsValue: unknown): Promise<McpToolResult> {
    const input = CancelReminderInputSchema.parse(argumentsValue ?? {});
    const reminder = await this.requireReminderStore().cancel(
      this.owner,
      input.reminderId,
    );
    if (!reminder) {
      return {
        content: [
          { type: "text", text: `No reminder found for ID ${input.reminderId}` },
        ],
        structuredContent: { reminder: null },
        isError: true,
      };
    }
    if (reminder.status !== "cancelled") {
      return {
        content: [
          {
            type: "text",
            text: `Reminder ${reminder.id} is already ${reminder.status} and cannot be cancelled`,
          },
        ],
        structuredContent: { reminder },
        isError: true,
      };
    }
    return toolJson({ reminder });
  }

  private requireReminderStore(): MarginMcpReminderStore {
    if (!this.reminders) {
      throw new Error("Reminder tools are unavailable in this MCP server configuration");
    }
    return this.reminders;
  }
}

function reminderRequestKey(
  owner: OwnerScope,
  noteId: string | undefined,
  text: string | undefined,
  scheduledFor: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        noteId: noteId ?? null,
        text: text ?? null,
        scheduledFor,
      }),
    )
    .digest("hex");
  return `mcp:${digest}`;
}

function toolJson(value: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA timezone: ${value}`);
  }
}
