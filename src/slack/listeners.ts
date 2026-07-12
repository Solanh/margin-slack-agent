import type { App } from "@slack/bolt";
import { buildCaptureAcknowledgement } from "./views/captureAcknowledgement.js";
import { buildMarginHomeView } from "./views/home.js";

interface UserTextMessage {
  text: string;
  ts: string;
  thread_ts?: string;
  user: string;
}

export function isUserTextMessage(message: unknown): message is UserTextMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Record<string, unknown>;

  return (
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0 &&
    typeof candidate.ts === "string" &&
    typeof candidate.user === "string" &&
    candidate.bot_id === undefined &&
    candidate.subtype === undefined
  );
}

export function registerSlackListeners(app: App): void {
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

  app.message(async ({ message, say, logger }) => {
    if (!isUserTextMessage(message)) {
      return;
    }

    try {
      await say({
        text: "Margin received your note. Durable storage is not enabled yet.",
        blocks: buildCaptureAcknowledgement(),
        thread_ts: message.thread_ts ?? message.ts,
      });
    } catch (error) {
      logger.error("Unable to acknowledge private note capture", error);
    }
  });
}
