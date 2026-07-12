import type { App } from "@slack/bolt";
import { z } from "zod";
import type { NoteRetrievalService } from "../services/noteRetrieval.js";
import { resolveSlackUserTimeZone } from "./userTimeZone.js";
import { buildOriginalNoteModal } from "./views/noteRetrieval.js";

export function registerNoteRetrievalActions(
  app: App,
  retrieval: NoteRetrievalService,
): void {
  app.action(
    "margin_retrieval_view_original",
    async ({ ack, body, action, client, logger }) => {
      await ack();

      try {
        const record = asRecord(body, "Slack retrieval action");
        const team = asRecord(record.team, "Slack team");
        const user = asRecord(record.user, "Slack user");
        const channel = asRecord(record.channel, "Slack channel");
        const actionRecord = asRecord(action, "Slack button action");
        const workspaceId = requiredString(team.id, "workspace ID");
        const userId = requiredString(user.id, "user ID");
        const channelId = requiredString(channel.id, "channel ID");
        const triggerId = requiredString(record.trigger_id, "trigger ID");
        const noteId = z
          .string()
          .uuid()
          .parse(requiredString(actionRecord.value, "note ID"));

        if (!channelId.startsWith("D")) {
          throw new Error("Retrieved originals may only be opened from a DM");
        }

        const original = await retrieval.getOriginal(
          { workspaceId, userId },
          noteId,
        );
        if (!original) {
          throw new Error("Owner-scoped original note was not found");
        }

        const timeZone = await resolveSlackUserTimeZone(client, userId);
        await client.views.open({
          trigger_id: triggerId,
          view: buildOriginalNoteModal(original, timeZone) as never,
        });
      } catch (error) {
        logger.error("Unable to open retrieved original note", error);
      }
    },
  );
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is missing`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is missing`);
  }
  return value;
}
