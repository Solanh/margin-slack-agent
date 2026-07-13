import type { DueReminder } from "../../storage/reminderRepository.js";

export type SlackBlock = Record<string, unknown>;

export function buildReminderDeliveryFallback(reminder: DueReminder): string {
  return `Reminder: ${reminder.organizedText ?? reminder.rawText}`;
}

export function buildReminderDeliveryBlocks(
  reminder: DueReminder,
): SlackBlock[] {
  const text = reminder.organizedText ?? reminder.rawText;
  const scheduledUnix = Math.floor(reminder.scheduledFor.getTime() / 1000);

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Margin reminder" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: escapeSlackMrkdwn(text),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Scheduled for <!date^${scheduledUnix}^{date_short_pretty} at {time}|${reminder.scheduledFor.toISOString()}> · Private DM`,
        },
      ],
    },
  ];
}

function escapeSlackMrkdwn(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
