import type { App } from "@slack/bolt";
import { z } from "zod";
import type { PreMeetingResurfacingRepository } from "../storage/preMeetingResurfacingRepository.js";
import { getWorkspaceId } from "./listeners.js";
import {
  buildResurfacingDisabledBlocks,
  buildResurfacingResolvedBlocks,
  buildResurfacingReviewModal,
  buildResurfacingSnoozedBlocks,
} from "./views/preMeetingResurfacing.js";

const ActionSchema = z.object({ resurfacingId: z.string().uuid() });

export function registerPreMeetingResurfacingActions(
  app: App,
  repository: PreMeetingResurfacingRepository,
): void {
  app.action(
    "margin_resurfacing_open_notes",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.resurfacingId,
        );
        if (!content) {
          throw new Error("Owner-scoped resurfacing was not found");
        }
        await client.views.open({
          trigger_id: context.triggerId,
          view: buildResurfacingReviewModal(content) as never,
        });
      } catch (error) {
        logger.error("Unable to open resurfaced notes", error);
      }
    },
  );

  app.action(
    "margin_resurfacing_resolve",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.resurfacingId,
        );
        if (!content) {
          throw new Error("Owner-scoped resurfacing was not found");
        }
        const count = await repository.markIncludedNotesResolved(
          context.owner,
          context.resurfacingId,
        );
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: `${count} resurfaced notes marked resolved.`,
          blocks: buildResurfacingResolvedBlocks(
            content.resurfacing.upcomingMeetingTitle,
            count,
          ) as never,
        });
      } catch (error) {
        logger.error("Unable to resolve resurfaced notes", error);
      }
    },
  );

  app.action(
    "margin_resurfacing_snooze",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.resurfacingId,
        );
        if (!content) {
          throw new Error("Owner-scoped resurfacing was not found");
        }
        const now = Date.now();
        const preferred = now + 10 * 60 * 1000;
        const latest = content.resurfacing.upcomingStartsAt.getTime() - 60_000;
        const until = new Date(latest > now ? Math.min(preferred, latest) : now + 60_000);
        await repository.snooze(
          context.owner,
          context.resurfacingId,
          until,
        );
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: `Meeting memory snoozed until ${until.toISOString()}.`,
          blocks: buildResurfacingSnoozedBlocks(
            content.resurfacing.upcomingMeetingTitle,
            until,
          ) as never,
        });
      } catch (error) {
        logger.error("Unable to snooze pre-meeting memory", error);
      }
    },
  );

  app.action(
    "margin_resurfacing_disable_series",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.resurfacingId,
        );
        if (!content) {
          throw new Error("Owner-scoped resurfacing was not found");
        }
        await repository.setSeriesEnabled(
          context.owner,
          content.resurfacing.seriesKey,
          false,
        );
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: "Meeting-series resurfacing disabled.",
          blocks: buildResurfacingDisabledBlocks(
            content.resurfacing.upcomingMeetingTitle,
            "series",
          ) as never,
        });
      } catch (error) {
        logger.error("Unable to mute meeting-series resurfacing", error);
      }
    },
  );

  app.action(
    "margin_resurfacing_disable_all",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const content = await repository.getContent(
          context.owner,
          context.resurfacingId,
        );
        if (!content) {
          throw new Error("Owner-scoped resurfacing was not found");
        }
        await repository.setResurfacingEnabled(context.owner, false);
        await client.chat.update({
          channel: context.channelId,
          ts: context.messageTs,
          text: "Pre-meeting resurfacing disabled.",
          blocks: buildResurfacingDisabledBlocks(
            content.resurfacing.upcomingMeetingTitle,
            "all",
          ) as never,
        });
      } catch (error) {
        logger.error("Unable to disable pre-meeting resurfacing", error);
      }
    },
  );
}

function actionContext(body: unknown, action: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new Error("Slack resurfacing action body is missing");
  }
  const record = body as Record<string, unknown>;
  const workspaceId = getWorkspaceId(body);
  const user = object(record.user, "Slack resurfacing user");
  const channel = object(record.channel, "Slack resurfacing channel");
  const message = object(record.message, "Slack resurfacing message");
  const actionRecord = object(action, "Slack resurfacing action");
  const userId = string(user.id, "Slack resurfacing user ID");
  const channelId = string(channel.id, "Slack resurfacing channel ID");
  const messageTs = string(message.ts, "Slack resurfacing message timestamp");
  const triggerId = string(record.trigger_id, "Slack resurfacing trigger ID");
  const parsed = ActionSchema.parse(
    JSON.parse(string(actionRecord.value, "Slack resurfacing action value")),
  );

  if (!workspaceId || !channelId.startsWith("D")) {
    throw new Error("Resurfacing interactions are restricted to the owner's DM");
  }

  return {
    owner: { workspaceId, userId },
    resurfacingId: parsed.resurfacingId,
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
