import { z } from "zod";
import type { MeetingContext, Note } from "../../domain/note.js";
import { escapeSlackMrkdwn, type SlackBlock } from "./noteCard.js";

const CardLocationSchema = z.object({
  noteId: z.string().uuid(),
  channelId: z.string().startsWith("D"),
  messageTs: z.string().min(1),
});

export type CardLocation = z.infer<typeof CardLocationSchema>;

export function encodeCardLocation(location: CardLocation): string {
  return JSON.stringify(CardLocationSchema.parse(location));
}

export function decodeCardLocation(value: string): CardLocation {
  return CardLocationSchema.parse(JSON.parse(value));
}

export function buildEditNoteModal(note: Note, location: CardLocation) {
  return {
    type: "modal" as const,
    callback_id: "margin_note_edit_submit",
    private_metadata: encodeCardLocation(location),
    title: { type: "plain_text" as const, text: "Edit note" },
    submit: { type: "plain_text" as const, text: "Save" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks: [
      {
        type: "input" as const,
        block_id: "margin_note_edit_block",
        label: { type: "plain_text" as const, text: "Organized note" },
        element: {
          type: "plain_text_input" as const,
          action_id: "margin_note_edit_value",
          multiline: true,
          initial_value: note.organizedText ?? note.rawText,
          max_length: 2800,
        },
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: "Editing changes only the organized view. The original remains immutable.",
          },
        ],
      },
    ],
  };
}

export function buildReminderModal(note: Note, location: CardLocation) {
  const element: Record<string, unknown> = {
    type: "plain_text_input",
    action_id: "margin_note_reminder_value",
    multiline: false,
    max_length: 500,
    placeholder: {
      type: "plain_text",
      text: "e.g. before the next planning meeting",
    },
  };

  if (note.reminderIntent) {
    element.initial_value = note.reminderIntent;
  }

  return {
    type: "modal" as const,
    callback_id: "margin_note_reminder_submit",
    private_metadata: encodeCardLocation(location),
    title: { type: "plain_text" as const, text: "Reminder intent" },
    submit: { type: "plain_text" as const, text: "Save" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks: [
      {
        type: "input" as const,
        block_id: "margin_note_reminder_block",
        optional: true,
        label: { type: "plain_text" as const, text: "When to resurface" },
        element,
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: "This records your reminder wording. Delivery scheduling is added by the reminder workflow.",
          },
        ],
      },
    ],
  };
}

export function buildMeetingModal(
  note: Note,
  candidates: MeetingContext[],
  location: CardLocation,
) {
  const options = [
    {
      text: { type: "plain_text" as const, text: "No meeting" },
      value: "none",
    },
    ...candidates.slice(0, 20).map((meeting) => ({
      text: {
        type: "plain_text" as const,
        text: truncatePlainText(meeting.title, 70),
      },
      description: {
        type: "plain_text" as const,
        text: `${meeting.startsAt.toISOString()} · ${meeting.provider}`,
      },
      value: meeting.id,
    })),
  ];
  const selectedValue = note.meetingId ?? "none";
  const initialOption = options.find((option) => option.value === selectedValue);
  const blocks: SlackBlock[] = [];

  if (candidates.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No verified meeting candidates are available yet. Calendar and huddle matching will populate this list.",
      },
    });
  }

  blocks.push({
    type: "input",
    block_id: "margin_note_meeting_block",
    label: { type: "plain_text", text: "Meeting context" },
    element: {
      type: "static_select",
      action_id: "margin_note_meeting_value",
      options,
      initial_option: initialOption ?? options[0],
    },
  });

  return {
    type: "modal" as const,
    callback_id: "margin_note_meeting_submit",
    private_metadata: encodeCardLocation(location),
    title: { type: "plain_text" as const, text: "Meeting context" },
    submit: { type: "plain_text" as const, text: "Save" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks,
  };
}

export function buildInteractionErrorBlocks(message: string): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: ${escapeSlackMrkdwn(message)}`,
      },
    },
  ];
}

function truncatePlainText(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1)}…`;
}
