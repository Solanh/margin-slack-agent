import type {
  NoteRetrievalResponse,
  RetrievedNote,
  RetrievedOriginalNote,
} from "../../domain/retrieval.js";
import { escapeSlackMrkdwn, type SlackBlock } from "./noteCard.js";

export function buildNoteRetrievalBlocks(
  response: NoteRetrievalResponse,
  timeZone: string,
): SlackBlock[] {
  if (response.notes.length === 0) {
    return buildNoResultsBlocks(response);
  }

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${response.notes.length} private note${response.notes.length === 1 ? "" : "s"} found`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${describeRequest(response)} · :lock: Only your Margin notes were searched`,
        },
      ],
    },
  ];

  for (const note of response.notes) {
    blocks.push(...buildResultBlocks(note, timeZone));
  }

  return blocks;
}

export function buildNoteRetrievalFallbackText(
  response: NoteRetrievalResponse,
): string {
  if (response.notes.length === 0) {
    return "Margin did not find any matching private notes.";
  }

  return `Margin found ${response.notes.length} matching private note${response.notes.length === 1 ? "" : "s"}.`;
}

export function buildOriginalNoteModal(
  original: RetrievedOriginalNote,
  timeZone: string,
) {
  const context = [
    original.meetingTitle,
    original.meetingStartsAt
      ? formatDateTime(original.meetingStartsAt, timeZone)
      : formatDateTime(original.createdAt, timeZone),
  ]
    .filter(Boolean)
    .join(" · ");

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Original*  _User-provided · immutable_\n>${escapeSlackMrkdwn(truncate(original.rawText, 2800)).replaceAll("\n", "\n>")}`,
      },
    },
  ];

  if (original.organizedText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Current organized view*\n${escapeSlackMrkdwn(truncate(original.organizedText, 2400))}`,
      },
    });
  }

  if (context) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: escapeSlackMrkdwn(context) }],
    });
  }

  return {
    type: "modal" as const,
    callback_id: "margin_retrieval_original_view",
    title: { type: "plain_text" as const, text: "Original note" },
    close: { type: "plain_text" as const, text: "Close" },
    blocks,
  };
}

function buildResultBlocks(note: RetrievedNote, timeZone: string): SlackBlock[] {
  const type = note.noteType ? capitalize(note.noteType) : "Unclassified";
  const status =
    note.contextResolutionStatus === "needs_clarification"
      ? `${capitalize(note.status)} · Context unresolved`
      : capitalize(note.status);
  const text = note.organizedText
    ? escapeSlackMrkdwn(truncate(note.organizedText, 1800))
    : "_Saved verbatim. Open the original to view it._";
  const meeting = note.meetingTitle
    ? `${escapeSlackMrkdwn(note.meetingTitle)}${note.meetingStartsAt ? ` · ${formatDateTime(note.meetingStartsAt, timeZone)}` : ""}`
    : `Captured ${formatDateTime(note.createdAt, timeZone)}`;
  const uncertainty = note.uncertainties.length > 0 ? " · Has uncertainty" : "";
  const reminder = note.explicitDueAt
    ? `\n*Reminder:* ${formatDateTime(note.explicitDueAt, timeZone)}`
    : note.reminderIntent
      ? `\n*Reminder:* ${escapeSlackMrkdwn(truncate(note.reminderIntent, 240))}`
      : "";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${type} · ${capitalize(note.priority)} priority · ${status}${uncertainty}*\n${text}${reminder}\n_${meeting}_`,
      },
      accessory: {
        type: "button",
        action_id: "margin_retrieval_view_original",
        text: { type: "plain_text", text: "View original" },
        value: note.id,
      },
    },
    { type: "divider" },
  ];
}

function buildNoResultsBlocks(response: NoteRetrievalResponse): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "No matching private notes" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Margin searched only your saved notes and found no matches for ${describeRequest(response)}.`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Try:\n• `Find notes about customer workflows`\n• `Show unresolved high priority actions`\n• `What did I note about Maya?`\n• `Find notes from Workflow Migration Review`",
      },
    },
  ];
}

function describeRequest(response: NoteRetrievalResponse): string {
  const parts: string[] = [];
  if (response.request.searchText) {
    parts.push(`“${escapeSlackMrkdwn(response.request.searchText)}”`);
  }
  if (response.request.noteTypes.length > 0) {
    parts.push(response.request.noteTypes.map(capitalize).join(", "));
  }
  if (response.request.priorities.length > 0) {
    parts.push(
      `${response.request.priorities.map(capitalize).join(", ")} priority`,
    );
  }
  if (response.request.status !== "any") {
    parts.push(capitalize(response.request.status));
  }
  return parts.length > 0 ? parts.join(" · ") : "your recent notes";
}

function formatDateTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1)}…`;
}
