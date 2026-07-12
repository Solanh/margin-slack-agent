import type { App } from "@slack/bolt";
import type { RawNoteCapturer } from "../services/captureRawNote.js";
import type { NoteCardService } from "../services/noteCard.js";
import type { OrganizeNoteService } from "../services/organizeNote.js";
import {
  buildCaptureFailureAcknowledgement,
} from "./views/captureAcknowledgement.js";
import { buildMarginHomeView } from "./views/home.js";
import {
  buildNoteCardBlocks,
  buildNoteCardFallbackText,
  buildProcessingNoteBlocks,
  type SlackBlock,
} from "./views/noteCard.js";

interface UserTextMessage {
  channel: string;
  text: string;
  ts: string;
  thread_ts?: string;
  user: string;
}

interface SlackMessagePayload {
  text: string;
  blocks: SlackBlock[];
  thread_ts?: string;
}

interface SlackPostResult {
  channel?: string;
  ts?: string;
}

export interface SlackListenerDependencies {
  rawNoteCapturer: RawNoteCapturer;
  organizer: OrganizeNoteService;
  noteCards: NoteCardService;
}

interface HandlePrivateNoteInput {
  workspaceId: string;
  message: UserTextMessage;
  capture: RawNoteCapturer["capture"];
  organize: OrganizeNoteService["organize"];
  recordCardReference: NoteCardService["recordCardReference"];
  getCardData: NoteCardService["getCardData"];
  post: (message: SlackMessagePayload) => Promise<SlackPostResult>;
  update: (message: {
    channel: string;
    ts: string;
    text: string;
    blocks: SlackBlock[];
  }) => Promise<unknown>;
  resolveTimeZone: () => Promise<string>;
  logError: (message: string, error?: unknown) => void;
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
    candidate.channel.startsWith("D") &&
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

export async function handlePrivateNoteMessage({
  workspaceId,
  message,
  capture,
  organize,
  recordCardReference,
  getCardData,
  post,
  update,
  resolveTimeZone,
  logError,
}: HandlePrivateNoteInput): Promise<void> {
  let rawNote;
  try {
    rawNote = await capture({
      workspaceId,
      userId: message.user,
      sourceChannelId: message.channel,
      sourceMessageTs: message.ts,
      rawText: message.text,
    });
  } catch (error) {
    logError("Unable to persist raw note", error);

    try {
      await post({
        text: "Margin could not save this note.",
        blocks: buildCaptureFailureAcknowledgement(),
        thread_ts: message.thread_ts ?? message.ts,
      });
    } catch (acknowledgementError) {
      logError(
        "Unable to send raw-note persistence failure acknowledgement",
        acknowledgementError,
      );
    }
    return;
  }

  let cardLocation: { channel: string; ts: string } | null = null;
  try {
    const response = await post({
      text: "Margin saved your note privately and is organizing it.",
      blocks: buildProcessingNoteBlocks(rawNote.rawText),
      thread_ts: message.thread_ts ?? message.ts,
    });
    if (
      typeof response.channel === "string" &&
      response.channel.startsWith("D") &&
      typeof response.ts === "string"
    ) {
      cardLocation = { channel: response.channel, ts: response.ts };
      try {
        await recordCardReference(
          { workspaceId, userId: message.user },
          rawNote.id,
          { channelId: response.channel, messageTs: response.ts },
        );
      } catch (error) {
        logError("Note saved, but card reference could not be stored", error);
      }
    } else {
      logError("Slack did not return a private note-card location");
    }
  } catch (error) {
    logError("Raw note saved, but processing card could not be posted", error);
  }

  let timeZone = "UTC";
  try {
    timeZone = await resolveTimeZone();
  } catch (error) {
    logError("Unable to resolve user timezone; using UTC", error);
  }

  try {
    await organize({
      workspaceId,
      userId: message.user,
      noteId: rawNote.id,
      userTimeZone: timeZone,
    });
  } catch (error) {
    // OrganizeNoteService normally returns a verbatim result; this protects the
    // card flow from unexpected programming or infrastructure failures.
    logError("Unexpected note organization failure", error);
  }

  if (!cardLocation) {
    return;
  }

  try {
    const data = await getCardData(
      { workspaceId, userId: message.user },
      rawNote.id,
    );
    await update({
      channel: cardLocation.channel,
      ts: cardLocation.ts,
      text: buildNoteCardFallbackText(data),
      blocks: buildNoteCardBlocks(data, timeZone),
    });
  } catch (error) {
    logError("Unable to update the saved note card", error);
  }
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

  app.message(async ({ message, body, say, client, logger }) => {
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

    await handlePrivateNoteMessage({
      workspaceId,
      message,
      capture: (input) => dependencies.rawNoteCapturer.capture(input),
      organize: (input) => dependencies.organizer.organize(input),
      recordCardReference: (owner, noteId, reference) =>
        dependencies.noteCards.recordCardReference(owner, noteId, reference),
      getCardData: (owner, noteId) =>
        dependencies.noteCards.getCardData(owner, noteId),
      post: (response) => say(response as never) as Promise<SlackPostResult>,
      update: (response) => client.chat.update(response as never),
      resolveTimeZone: async () => {
        try {
          const response = await client.users.info({ user: message.user });
          return response.user?.tz ?? "UTC";
        } catch {
          return "UTC";
        }
      },
      logError: (description, error) => logger.error(description, error),
    });
  });
}
