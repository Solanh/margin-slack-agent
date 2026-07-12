import type {
  ContextCandidateWithMeeting,
  InferredField,
  MeetingContext,
  Note,
} from "../../domain/note.js";
import type { NoteCardData } from "../../storage/noteRepository.js";

export type SlackBlock = Record<string, unknown>;

const PRIORITY_OPTIONS = [
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["critical", "Critical"],
] as const;

export function buildProcessingNoteBlocks(rawText: string): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Note saved" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Original*  _User-provided · immutable_\n>${escapeSlackMrkdwn(truncate(rawText, 1800)).replaceAll("\n", "\n>")}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":lock: Saved privately. Organizing without changing your original…",
        },
      ],
    },
  ];
}

export function buildNoteCardBlocks(
  data: NoteCardData,
  timeZone: string,
): SlackBlock[] {
  const { note, meeting } = data;
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: buildHeader(note),
      },
    },
  ];

  if (note.displayMode === "organized" && note.organizedText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Organized note*  _${fieldProvenance(note, "organizedText")}_\n${escapeSlackMrkdwn(truncate(note.organizedText, 2400))}`,
      },
    });
  } else if (note.displayMode === "organized") {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Saved verbatim*\nOrganization is unavailable, so the original remains the authoritative note.",
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Original*  _User-provided · immutable_\n>${escapeSlackMrkdwn(truncate(note.rawText, 1800)).replaceAll("\n", "\n>")}`,
    },
  });

  blocks.push({
    type: "section",
    fields: buildMetadataFields(note, meeting, timeZone),
  });

  if (note.contextResolutionStatus === "needs_clarification") {
    blocks.push(...buildContextClarificationBlocks(data.contextCandidates));
  }

  if (note.uncertainties.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Unresolved*  _AI-identified uncertainty_\n${note.uncertainties
          .slice(0, 4)
          .map((item) => `• ${escapeSlackMrkdwn(truncate(item, 500))}`)
          .join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: ":lock: Private DM · Original preserved · Inferences are labeled",
      },
    ],
  });

  blocks.push({
    type: "actions",
    block_id: `margin_note_actions_${note.id}_${note.updatedAt.getTime()}`,
    elements: [
      {
        type: "button",
        action_id: "margin_note_edit",
        text: { type: "plain_text", text: "Edit" },
        value: note.id,
      },
      {
        type: "static_select",
        action_id: "margin_note_priority",
        placeholder: { type: "plain_text", text: "Priority" },
        options: PRIORITY_OPTIONS.map(([value, label]) => ({
          text: { type: "plain_text", text: label },
          value,
        })),
        initial_option: {
          text: {
            type: "plain_text",
            text: formatPriority(note.priority),
          },
          value: note.priority,
        },
      },
      {
        type: "button",
        action_id: "margin_note_reminder",
        text: { type: "plain_text", text: "Reminder" },
        value: note.id,
      },
      {
        type: "button",
        action_id: "margin_note_meeting",
        text: { type: "plain_text", text: "Meeting" },
        value: note.id,
      },
      {
        type: "button",
        action_id: "margin_note_display_mode",
        text: {
          type: "plain_text",
          text:
            note.displayMode === "organized"
              ? "Keep verbatim"
              : "Use organized",
        },
        value: JSON.stringify({
          noteId: note.id,
          displayMode:
            note.displayMode === "organized" ? "verbatim" : "organized",
        }),
      },
    ],
  });

  return blocks;
}

export function buildNoteCardFallbackText(data: NoteCardData): string {
  const { note } = data;
  const contextPrompt =
    note.contextResolutionStatus === "needs_clarification"
      ? "\n\nChoose the meeting context in Slack."
      : "";
  if (note.displayMode === "organized" && note.organizedText) {
    return `${note.organizedText}\n\nOriginal preserved: ${note.rawText}${contextPrompt}`;
  }
  return `Note saved verbatim: ${note.rawText}${contextPrompt}`;
}

function buildContextClarificationBlocks(
  candidates: ContextCandidateWithMeeting[],
): SlackBlock[] {
  const rankedMeetings = candidates
    .filter(
      (item) =>
        item.candidate.source !== "standalone" && item.meeting !== null,
    )
    .slice(0, 3);
  const standalone = candidates.find(
    (item) => item.candidate.source === "standalone",
  );
  const elements = rankedMeetings.map((item) => ({
    type: "button",
    action_id: "margin_context_candidate_select",
    text: {
      type: "plain_text",
      text: truncatePlainText(item.meeting?.title ?? "Meeting", 70),
    },
    value: JSON.stringify({
      noteId: item.candidate.noteId,
      candidateId: item.candidate.id,
    }),
  }));

  if (standalone) {
    elements.push({
      type: "button",
      action_id: "margin_context_candidate_select",
      text: { type: "plain_text", text: "No meeting" },
      value: JSON.stringify({
        noteId: standalone.candidate.noteId,
        candidateId: standalone.candidate.id,
      }),
    });
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Which meeting was this from?*\nMargin found more than one plausible context and will not guess.",
      },
    },
    {
      type: "actions",
      block_id: `margin_context_candidates_${candidates[0]?.candidate.noteId ?? "unknown"}`,
      elements,
    },
  ];
}

function buildHeader(note: Note): string {
  if (note.displayMode === "verbatim") {
    return "Verbatim note";
  }

  const type = note.noteType ? formatLabel(note.noteType) : "Private note";
  return `${type} · ${formatPriority(note.priority)} priority`;
}

function buildMetadataFields(
  note: Note,
  meeting: MeetingContext | null,
  timeZone: string,
) {
  const typeValue = note.noteType
    ? `${formatLabel(note.noteType)} · ${fieldProvenance(note, "noteType")}`
    : "Not classified · Unresolved";
  const priorityValue = `${formatPriority(note.priority)} · ${fieldProvenance(note, "priority")}`;
  const reminderValue = buildReminderValue(note, timeZone);
  const meetingValue = buildMeetingValue(note, meeting, timeZone);

  return [
    { type: "mrkdwn", text: `*Type*\n${typeValue}` },
    { type: "mrkdwn", text: `*Priority*\n${priorityValue}` },
    { type: "mrkdwn", text: `*Reminder*\n${reminderValue}` },
    { type: "mrkdwn", text: `*Meeting*\n${meetingValue}` },
  ];
}

function buildMeetingValue(
  note: Note,
  meeting: MeetingContext | null,
  timeZone: string,
): string {
  if (meeting) {
    return `${escapeSlackMrkdwn(meeting.title)}\n${formatDateRange(meeting, timeZone)} · ${formatContextSource(note.contextSource)} · ${formatLabel(note.contextConfidence)}`;
  }
  if (note.contextResolutionStatus === "needs_clarification") {
    return "Needs confirmation · choose below";
  }
  return "No meeting · Standalone";
}

function buildReminderValue(note: Note, timeZone: string): string {
  if (note.explicitDueAt) {
    return `${formatDateTime(note.explicitDueAt, timeZone)} · ${fieldProvenance(note, "explicitDueAt")}`;
  }
  if (note.reminderIntent) {
    return `${escapeSlackMrkdwn(truncate(note.reminderIntent, 300))} · ${fieldProvenance(note, "reminderIntent")}`;
  }
  return "None requested";
}

function fieldProvenance(note: Note, field: InferredField): string {
  return note.inferredFields.includes(field) ? "AI-derived" : "User-edited";
}

function formatDateRange(meeting: MeetingContext, timeZone: string): string {
  return `${formatDateTime(meeting.startsAt, timeZone)}–${new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(meeting.endsAt)}`;
}

function formatDateTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatContextSource(source: Note["contextSource"]): string {
  switch (source) {
    case "google_calendar":
      return "Google Calendar";
    case "slack_huddle":
      return "Slack huddle";
    case "explicit":
      return "User-selected";
    case "standalone":
    default:
      return "Standalone";
  }
}

function formatPriority(priority: Note["priority"]): string {
  return formatLabel(priority);
}

function formatLabel(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function escapeSlackMrkdwn(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) {
    return value;
  }
  return `${value.slice(0, maximum - 1)}…`;
}

function truncatePlainText(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1)}…`;
}
