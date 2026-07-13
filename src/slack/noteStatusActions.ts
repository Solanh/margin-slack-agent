import type { App } from "@slack/bolt";
import { z } from "zod";
import type { OwnerScope } from "../domain/note.js";
import type { NoteCardService } from "../services/noteCard.js";
import { resolveSlackUserTimeZone } from "./userTimeZone.js";
import {
  buildNoteCardBlocks,
  buildNoteCardFallbackText,
} from "./views/noteCard.js";

const NoteStatusActionSchema = z.object({
  noteId: z.string().uuid(),
  status: z.enum(["open", "resolved"]),
});

export function registerNoteStatusActions(
  app: App,
  noteCards: NoteCardService,
): void {
  app.action(
    "margin_note_status",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const actionRecord = object(action, "Slack status action");
        const parsed = NoteStatusActionSchema.parse(
          JSON.parse(string(actionRecord.value, "Slack status action value")),
        );
        const bodyRecord = object(body, "Slack status action body");
        const team = object(bodyRecord.team, "Slack action team");
        const user = object(bodyRecord.user, "Slack action user");
        const channel = object(bodyRecord.channel, "Slack action channel");
        const message = object(bodyRecord.message, "Slack action message");
        const workspaceId = string(team.id, "Slack workspace ID");
        const userId = string(user.id, "Slack user ID");
        const channelId = string(channel.id, "Slack channel ID");
        const messageTs = string(message.ts, "Slack message timestamp");

        if (!channelId.startsWith("D")) {
          throw new Error("Margin completion controls are restricted to private DMs");
        }

        const owner: OwnerScope = { workspaceId, userId };
        await noteCards.setStatus(owner, parsed.noteId, parsed.status);
        const data = await noteCards.getCardData(owner, parsed.noteId);
        if (
          data.note.cardChannelId !== null &&
          (data.note.cardChannelId !== channelId ||
            data.note.cardMessageTs !== messageTs)
        ) {
          throw new Error("Slack card location does not match the stored note card");
        }

        const timeZone = await resolveSlackUserTimeZone(client, userId);
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: buildNoteCardFallbackText(data),
          blocks: buildNoteCardBlocks(data, timeZone) as never,
        });
      } catch (error) {
        logger.error("Unable to update note completion status", error);
      }
    },
  );
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is missing`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is missing`);
  }
  return value;
}
