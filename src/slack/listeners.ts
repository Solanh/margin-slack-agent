import type { App } from "@slack/bolt";
import type { RawNoteCapturer } from "../services/captureRawNote.js";
import {
  buildCaptureAcknowledgement,
  buildCaptureFailureAcknowledgement,
} from "./views/captureAcknowledgement.js";
import { buildMarginHomeView } from "./views/home.js";

interface UserTextMessage {
  channel: string;
  text: string;
  ts: string;
  thread_ts?: string;
  user: string;
}

export interface SlackListenerDependencies {
  rawNoteCapturer: RawNoteCapturer;
}

export function isUserTextMessage(message: unknown): message is UserTextMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  const validThread =
    candidate.thread_ts === undefined || typeof candidate.thread_ts === "string";

  return (
    typeof candidate.channel === "string" &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0 &&
    typeof candidate.ts === "string" &&
    typeof candidate.user === "string" &&
    validThread &&
    candidate.bot_id === undefined &&
    candidate.subtype === undefined
  );
}

export function getWorkspaceId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.team_id === "string") {
    return candidate.team_id;
  }

  if (Array.isArray(candidate.authorizations)) {
    for (const authorization of candidate.authorizations) {
      if (typeof authorization !== "object" || authorization === null) {
        continue;
      }

      const teamId = (authorization as Record<string, unknown>).team_id;
      if (typeof teamId === "string") {
        return teamId;
      }
    }
  }

  return null;
}

export function registerSlackListeners(
  app: App,
  dependencies: SlackListenerDependencies,
): void {
  app.event("app_home_opened", async ({ event, client, logger }) => {
    if (event.tab !== "home") {
      return;
    }

    try {
      await client.views.publish({
        user_id: event.user,
        view: buildMarginHomeView(),
      });
    } catch (error) {
      logger.error("Unable to publish Margin App Home", error);
    }
  });

  app.event("app_context_changed", async ({ logger }) => {
    // The context is intentionally not persisted until the context-resolution
    // issue defines its retention and privacy behavior.
    logger.debug("Slack Agent View context changed");
  });

  app.message(async ({ message, body, say, logger }) => {
    if (!isUserTextMessage(message)) {
      return;
    }

    const workspaceId = getWorkspaceId(body);
    if (!workspaceId) {
      logger.error("Unable to identify Slack workspace for raw note capture");
      await say({
        text: "Margin could not save this note.",
        blocks: buildCaptureFailureAcknowledgement(),
        thread_ts: message.thread_ts ?? message.ts,
      });
      return;
    }

    try {
      await dependencies.rawNoteCapturer.capture({
        workspaceId,
        userId: message.user,
        sourceChannelId: message.channel,
        sourceMessageTs: message.ts,
        rawText: message.text,
      });
    } catch (error) {
      logger.error("Unable to persist raw note", error);

      try {
        await say({
          text: "Margin could not save this note.",
          blocks: buildCaptureFailureAcknowledgement(),
          thread_ts: message.thread_ts ?? message.ts,
        });
      } catch (acknowledgementError) {
        logger.error(
          "Unable to send raw-note persistence failure acknowledgement",
          acknowledgementError,
        );
      }
      return;
    }

    try {
      await say({
        text: "Margin saved your note privately and preserved the original.",
        blocks: buildCaptureAcknowledgement(),
        thread_ts: message.thread_ts ?? message.ts,
      });
    } catch (error) {
      logger.error("Raw note saved, but acknowledgement failed", error);
    }
  });
}
