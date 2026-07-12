import type {
  DigestNoteItem,
  PostMeetingDigestContent,
} from "../../storage/postMeetingDigestRepository.js";
import { escapeSlackMrkdwn } from "./noteCard.js";

export type DigestSlackBlock = Record<string, unknown>;

const GROUPS: Array<{
  type: DigestNoteItem["noteType"];
  heading: string;
}> = [
  { type: "decision", heading: "Decisions" },
  { type: "action", heading: "Actions" },
  { type: "question", heading: "Open questions" },
  { type: "idea", heading: "Ideas" },
  { type: "reference", heading: "References" },
];

export function buildPostMeetingDigestBlocks(
  content: PostMeetingDigestContent,
): DigestSlackBlock[] {
  const { digest, notes } = content;
  const blocks: DigestSlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Your meeting notes" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(digest.meetingTitle)}*\n${slackDate(digest.meetingStartsAt)} · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`,
      },
    },
  ];

  for (const group of GROUPS) {
    const items = notes.filter((note) => note.noteType === group.type);
    if (items.length === 0) {
      continue;
    }
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${group.heading}*\n${items
          .slice(0, 8)
          .map(formatDigestItem)
          .join("\n")}${items.length > 8 ? `\n• _${items.length - 8} more in Review all_` : ""}`,
      },
    });
  }

  blocks.push(
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":lock: Private to you · Includes only notes you deliberately sent to Margin",
        },
      ],
    },
    {
      type: "actions",
      block_id: `margin_digest_actions_${digest.id}`,
      elements: [
        {
          type: "button",
          action_id: "margin_digest_review_all",
          text: { type: "plain_text", text: "Review all" },
          value: JSON.stringify({ digestId: digest.id }),
          style: "primary",
        },
        {
          type: "button",
          action_id: "margin_digest_snooze",
          text: { type: "plain_text", text: "Snooze digest" },
          value: JSON.stringify({ digestId: digest.id }),
        },
        {
          type: "button",
          action_id: "margin_digests_disable",
          text: { type: "plain_text", text: "Disable digests" },
          value: JSON.stringify({ digestId: digest.id }),
          confirm: {
            title: { type: "plain_text", text: "Disable digests?" },
            text: {
              type: "mrkdwn",
              text: "Margin will stop sending post-meeting digests. Your notes remain private and available.",
            },
            confirm: { type: "plain_text", text: "Disable" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
  );

  return blocks;
}

export function buildPostMeetingDigestFallback(
  content: PostMeetingDigestContent,
): string {
  return `Your notes from ${content.digest.meetingTitle}: ${content.notes.length} captured ${content.notes.length === 1 ? "note" : "notes"}.`;
}

export function buildDigestReviewModal(content: PostMeetingDigestContent) {
  const blocks: DigestSlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(content.digest.meetingTitle)}*\n${slackDate(content.digest.meetingStartsAt)}`,
      },
    },
  ];

  for (const group of GROUPS) {
    const items = content.notes.filter((note) => note.noteType === group.type);
    if (items.length === 0) {
      continue;
    }
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${group.heading}*\n${items
          .slice(0, 20)
          .map(formatDigestItem)
          .join("\n")}`,
      },
    });
  }

  return {
    type: "modal" as const,
    callback_id: "margin_digest_review_modal",
    title: { type: "plain_text" as const, text: "Meeting notes" },
    close: { type: "plain_text" as const, text: "Close" },
    blocks: blocks.slice(0, 45),
  };
}

export function buildDigestSnoozedBlocks(
  meetingTitle: string,
  until: Date,
): DigestSlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Digest snoozed" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(meetingTitle)}*\nMargin will resurface this private digest ${slackDate(until)}.`,
      },
    },
  ];
}

export function buildDigestsDisabledBlocks(): DigestSlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Post-meeting digests disabled" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Margin will keep saving your private notes but will not send post-meeting digests. You can re-enable them from App Home.",
      },
    },
  ];
}

function formatDigestItem(note: DigestNoteItem): string {
  const status = note.status === "open" ? "Open" : formatLabel(note.status);
  const priority = note.priority === "normal" ? "" : ` · ${formatLabel(note.priority)}`;
  const reminder = note.explicitDueAt
    ? ` · Reminder ${slackDate(note.explicitDueAt)}`
    : note.reminderIntent
      ? ` · Reminder: ${escapeSlackMrkdwn(truncate(note.reminderIntent, 120))}`
      : "";
  return `• ${escapeSlackMrkdwn(truncate(note.text, 420))} _[${status}${priority}${reminder}]_`;
}

function slackDate(date: Date): string {
  const epoch = Math.floor(date.getTime() / 1000);
  return `<!date^${epoch}^{date_short_pretty} at {time}|${date.toISOString()}>`;
}

function formatLabel(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}
