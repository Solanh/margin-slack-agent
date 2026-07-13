import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { OwnerScope } from "../domain/note.js";
import {
  handlePrivateNoteMessage,
  type SlackListenerDependencies,
} from "./listeners.js";
import { resolveSlackUserTimeZone } from "./userTimeZone.js";
import { buildCaptureShortcutModal } from "./views/captureShortcut.js";

interface ShortcutCaptureInput {
  workspaceId: string;
  userId: string;
  sourceChannelId: string;
  sourceMessageTs: string;
  text: string;
}

export function registerCaptureShortcuts(
  app: App,
  dependencies: SlackListenerDependencies,
): void {
  app.shortcut(
    { callback_id: "margin_capture_note", type: "shortcut" },
    async ({ ack, shortcut, client, logger }) => {
      await ack();
      try {
        const payload = object(shortcut, "Slack global shortcut");
        await client.views.open({
          trigger_id: string(payload.trigger_id, "Slack shortcut trigger ID"),
          view: buildCaptureShortcutModal(),
        });
      } catch (error) {
        logger.error("Unable to open the private capture shortcut", error);
      }
    },
  );

  app.shortcut(
    { callback_id: "margin_save_message", type: "message_action" },
    async ({ ack, shortcut, client, logger }) => {
      await ack();
      try {
        const payload = object(shortcut, "Slack message shortcut");
        const team = object(payload.team, "Slack shortcut team");
        const user = object(payload.user, "Slack shortcut user");
        const channel = object(payload.channel, "Slack shortcut channel");
        const message = object(payload.message, "Slack shortcut message");
        const text = optionalString(message.text);
        const userId = string(user.id, "Slack shortcut user ID");

        if (!text.trim()) {
          await sendPrivateNotice(
            client,
            userId,
            "Margin could not save that message because it does not contain text.",
          );
          return;
        }

        const channelId = string(channel.id, "Slack shortcut channel ID");
        const messageTs = string(message.ts, "Slack shortcut message timestamp");
        await captureShortcutNote(
          client,
          dependencies,
          {
            workspaceId: string(team.id, "Slack shortcut workspace ID"),
            userId,
            sourceChannelId: channelId,
            sourceMessageTs: `shortcut:message:${channelId}:${messageTs}`,
            text,
          },
          (description, error) => logger.error(description, error),
        );
      } catch (error) {
        logger.error("Unable to save the selected Slack message", error);
      }
    },
  );

  app.view(
    "margin_capture_note_submit",
    async ({ ack, body, view, client, logger }) => {
      const text = plainTextValue(
        view.state.values,
        "margin_capture_shortcut_block",
        "margin_capture_shortcut_value",
      );
      if (!text.trim()) {
        await ack({
          response_action: "errors",
          errors: {
            margin_capture_shortcut_block: "Enter the note you want Margin to save.",
          },
        });
        return;
      }

      await ack();
      try {
        const bodyRecord = object(body, "Slack capture modal body");
        const team = object(bodyRecord.team, "Slack modal team");
        const user = object(bodyRecord.user, "Slack modal user");
        await captureShortcutNote(
          client,
          dependencies,
          {
            workspaceId: string(team.id, "Slack modal workspace ID"),
            userId: string(user.id, "Slack modal user ID"),
            sourceChannelId: "SLACK_SHORTCUT",
            sourceMessageTs: `shortcut:global:${view.id}`,
            text,
          },
          (description, error) => logger.error(description, error),
        );
      } catch (error) {
        logger.error("Unable to save the private shortcut note", error);
      }
    },
  );
}

async function captureShortcutNote(
  client: WebClient,
  dependencies: SlackListenerDependencies,
  input: ShortcutCaptureInput,
  logError: (message: string, error?: unknown) => void,
): Promise<void> {
  const owner: OwnerScope = {
    workspaceId: input.workspaceId,
    userId: input.userId,
  };
  const opened = await client.conversations.open({ users: input.userId });
  const privateChannelId = opened.channel?.id;
  if (!privateChannelId?.startsWith("D")) {
    throw new Error("Slack did not return a private Margin DM channel");
  }

  let userInfoPromise: ReturnType<WebClient["users"]["info"]> | null = null;
  const getUserInfo = () => {
    userInfoPromise ??= client.users.info({ user: input.userId });
    return userInfoPromise;
  };

  await handlePrivateNoteMessage({
    workspaceId: input.workspaceId,
    message: {
      channel: input.sourceChannelId,
      text: input.text,
      ts: input.sourceMessageTs,
      user: input.userId,
    },
    capture: (captureInput) => dependencies.rawNoteCapturer.capture(captureInput),
    organize: (organizeInput) => dependencies.organizer.organize(organizeInput),
    resolveContext: (scope, noteId) =>
      dependencies.contextResolver.resolveForNote(scope, noteId),
    refreshSlackSignals: async () => {
      const response = await getUserInfo();
      await dependencies.slackContextSignals.recordHuddleUserProfile(
        owner,
        response.user,
        new Date(),
      );
    },
    recordCardReference: (scope, noteId, reference) =>
      dependencies.noteCards.recordCardReference(scope, noteId, reference),
    getCardData: (scope, noteId) =>
      dependencies.noteCards.getCardData(scope, noteId),
    post: async (response) => {
      const posted = await client.chat.postMessage({
        channel: privateChannelId,
        text: response.text,
        blocks: response.blocks as never,
      });
      return { channel: posted.channel, ts: posted.ts };
    },
    update: (response) =>
      client.chat.update({
        ...response,
        blocks: response.blocks as never,
      }),
    resolveTimeZone: async () =>
      resolveSlackUserTimeZone(client, input.userId),
    logError,
  });
}

async function sendPrivateNotice(
  client: WebClient,
  userId: string,
  text: string,
): Promise<void> {
  const opened = await client.conversations.open({ users: userId });
  const channel = opened.channel?.id;
  if (!channel?.startsWith("D")) {
    throw new Error("Slack did not return a private Margin DM channel");
  }
  await client.chat.postMessage({ channel, text });
}

function plainTextValue(
  values: unknown,
  blockId: string,
  actionId: string,
): string {
  const blocks = object(values, "Slack view values");
  const block = object(blocks[blockId], `Slack view block ${blockId}`);
  const action = object(block[actionId], `Slack view action ${actionId}`);
  return optionalString(action.value);
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

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
