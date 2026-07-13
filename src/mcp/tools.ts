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

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
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

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
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
