import type { App } from "@slack/bolt";
import { z } from "zod";
import type { PostMeetingDigestRepository } from "../storage/postMeetingDigestRepository.js";
import { getWorkspaceId } from "./listeners.js";
import {
  buildDigestReviewModal,
  buildDigestSnoozedBlocks,
  buildDigestsDisabledBlocks,
  buildPostMeetingDigestBlocks,
  buildPostMeetingDigestFallback,
} from "./views/postMeetingDigest.js";

const DigestActionSchema = z.object({ digestId: z.string().uuid() });

export function registerPostMeetingDigestActions(
  app: App,
  repository: PostMeetingDigestRepository,
): void {
  app.action(
    "margin_digest_review_all",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.digestId,
        );
        if (!content) {
          throw new Error("Owner-scoped digest was not found");
        }
        await client.views.open({
          trigger_id: context.triggerId,
          view: buildDigestReviewModal(content) as never,
        });
      } catch (error) {
        logger.error("Unable to open post-meeting digest review", error);
      }
    },
  );

  app.action(
    "margin_digest_snooze",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const until = new Date(Date.now() + 60 * 60 * 1000);
        const digest = await repository.snooze(
          context.owner,
          context.digestId,
          until,
        );
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: `Digest snoozed until ${until.toISOString()}`,
          blocks: buildDigestSnoozedBlocks(digest.meetingTitle, until) as never,
        });
      } catch (error) {
        logger.error("Unable to snooze post-meeting digest", error);
      }
    },
  );

  app.action(
    "margin_digests_disable",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        await repository.setDigestsEnabled(context.owner, false);
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: "Post-meeting digests disabled.",
          blocks: [
            ...buildDigestsDisabledBlocks(),
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  action_id: "margin_digests_enable",
                  text: { type: "plain_text", text: "Re-enable digests" },
                  value: JSON.stringify({ digestId: context.digestId }),
                  style: "primary",
                },
              ],
            },
          ] as never,
        });
      } catch (error) {
        logger.error("Unable to disable post-meeting digests", error);
      }
    },
  );

  app.action(
    "margin_digests_enable",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        await repository.setDigestsEnabled(context.owner, true);
        const content = await repository.getContent(
          context.owner,
          context.digestId,
        );
        if (!content) {
          throw new Error("Owner-scoped digest was not found");
        }
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: buildPostMeetingDigestFallback(content),
          blocks: buildPostMeetingDigestBlocks(content) as never,
        });
      } catch (error) {
        logger.error("Unable to enable post-meeting digests", error);
      }
    },
  );
}

function actionContext(body: unknown, action: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new Error("Slack digest action body is missing");
  }
  const record = body as Record<string, unknown>;
  const workspaceId = getWorkspaceId(body);
  const user = object(record.user, "Slack digest user");
  const channel = object(record.channel, "Slack digest channel");
  const message = object(record.message, "Slack digest message");
  const actionRecord = object(action, "Slack digest action");
  const userId = string(user.id, "Slack digest user ID");
  const channelId = string(channel.id, "Slack digest channel ID");
  const messageTs = string(message.ts, "Slack digest message timestamp");
  const triggerId = string(record.trigger_id, "Slack digest trigger ID");
  const parsed = DigestActionSchema.parse(
    JSON.parse(string(actionRecord.value, "Slack digest action value")),
  );

  if (!workspaceId || !channelId.startsWith("D")) {
    throw new Error("Digest interactions are restricted to the owner's DM");
  }

  return {
    owner: { workspaceId, userId },
    digestId: parsed.digestId,
    channelId,
    messageTs,
    triggerId,
  };
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
