import type {
  PreMeetingResurfacingContent,
  ResurfacingNoteItem,
} from "../../storage/preMeetingResurfacingRepository.js";
import { escapeSlackMrkdwn } from "./noteCard.js";

export type ResurfacingSlackBlock = Record<string, unknown>;

export function buildPreMeetingResurfacingBlocks(
  content: PreMeetingResurfacingContent,
): ResurfacingSlackBlock[] {
  const { resurfacing, notes } = content;
  const prior = notes[0];
  const blocks: ResurfacingSlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Before your next meeting" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(resurfacing.upcomingMeetingTitle)}*\nStarts ${slackDate(resurfacing.upcomingStartsAt)}`,
      },
    },
  ];

  if (prior) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `From *${escapeSlackMrkdwn(prior.priorMeetingTitle)}* · ${slackDate(prior.priorMeetingStartsAt)}`,
        },
      ],
    });
  }

  pushGroup(blocks, "Open actions", notes.filter((note) => note.noteType === "action"));
  pushGroup(
    blocks,
    "Open questions",
    notes.filter((note) => note.noteType === "question"),
  );

  blocks.push(
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":lock: Private to you · Matched by verified Calendar series identity",
        },
      ],
    },
    {
      type: "actions",
      block_id: `margin_resurfacing_actions_${resurfacing.id}`,
      elements: [
        button("margin_resurfacing_resolve", "Mark resolved", resurfacing.id, true),
        button("margin_resurfacing_snooze", "Snooze", resurfacing.id),
        button("margin_resurfacing_open_notes", "Open notes", resurfacing.id),
        button("margin_resurfacing_disable_series", "Mute series", resurfacing.id),
        button("margin_resurfacing_disable_all", "Disable all", resurfacing.id),
      ],
    },
  );

  return blocks;
}

export function buildPreMeetingResurfacingFallback(
  content: PreMeetingResurfacingContent,
): string {
  return `${content.notes.length} unresolved ${content.notes.length === 1 ? "note" : "notes"} before ${content.resurfacing.upcomingMeetingTitle}.`;
}

export function buildResurfacingReviewModal(
  content: PreMeetingResurfacingContent,
) {
  const blocks: ResurfacingSlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Before ${escapeSlackMrkdwn(content.resurfacing.upcomingMeetingTitle)}*\n${slackDate(content.resurfacing.upcomingStartsAt)}`,
      },
    },
  ];
  pushGroup(blocks, "Open actions", content.notes.filter((note) => note.noteType === "action"));
  pushGroup(blocks, "Open questions", content.notes.filter((note) => note.noteType === "question"));
  return {
    type: "modal" as const,
    callback_id: "margin_resurfacing_review_modal",
    title: { type: "plain_text" as const, text: "Prior notes" },
    close: { type: "plain_text" as const, text: "Close" },
    blocks: blocks.slice(0, 45),
  };
}

export function buildResurfacingSnoozedBlocks(
  title: string,
  until: Date,
): ResurfacingSlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Meeting memory snoozed" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(title)}*\nMargin will resurface these notes ${slackDate(until)}.`,
      },
    },
  ];
}

export function buildResurfacingResolvedBlocks(
  title: string,
  count: number,
): ResurfacingSlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Notes resolved" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Marked ${count} ${count === 1 ? "note" : "notes"} resolved before *${escapeSlackMrkdwn(title)}*.`,
      },
    },
  ];
}

export function buildResurfacingDisabledBlocks(
  title: string,
  scope: "series" | "all",
): ResurfacingSlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: scope === "series" ? "Meeting series muted" : "Resurfacing disabled",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          scope === "series"
            ? `Margin will not resurface prior notes for *${escapeSlackMrkdwn(title)}* again.`
            : "Margin will not send pre-meeting memory until you re-enable it.",
      },
    },
  ];
}

function pushGroup(
  blocks: ResurfacingSlackBlock[],
  heading: string,
  notes: ResurfacingNoteItem[],
): void {
  if (notes.length === 0) {
    return;
  }
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${heading}*\n${notes
        .slice(0, 10)
        .map(formatNote)
        .join("\n")}`,
    },
  });
}

function formatNote(note: ResurfacingNoteItem): string {
  const priority = note.priority === "normal" ? "" : ` · ${label(note.priority)}`;
  const reminder = note.reminderIntent
    ? ` · Reminder: ${escapeSlackMrkdwn(truncate(note.reminderIntent, 100))}`
    : "";
  return `• ${escapeSlackMrkdwn(truncate(note.text, 420))} _[${label(note.status)}${priority}${reminder}]_`;
}

function button(
  actionId: string,
  text: string,
  resurfacingId: string,
  primary = false,
) {
  return {
    type: "button",
    action_id: actionId,
    text: { type: "plain_text", text },
    value: JSON.stringify({ resurfacingId }),
    ...(primary ? { style: "primary" } : {}),
  };
}

function slackDate(date: Date): string {
  const epoch = Math.floor(date.getTime() / 1000);
  return `<!date^${epoch}^{date_short_pretty} at {time}|${date.toISOString()}>`;
}

function label(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}
