import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { z } from "zod";
import type { OwnerScope } from "../domain/note.js";
import { NoteCardService } from "../services/noteCard.js";
import { resolveSlackUserTimeZone } from "./userTimeZone.js";
import {
  buildNoteCardBlocks,
  buildNoteCardFallbackText,
} from "./views/noteCard.js";
import {
  buildEditNoteModal,
  buildMeetingModal,
  buildReminderModal,
  decodeCardLocation,
  type CardLocation,
} from "./views/noteCardModals.js";

const DisplayActionSchema = z.object({
  noteId: z.string().uuid(),
  displayMode: z.enum(["organized", "verbatim"]),
});

interface SlackActionContext {
  owner: OwnerScope;
  userId: string;
  triggerId: string;
  location: CardLocation;
}

export function registerNoteCardActions(
  app: App,
  noteCards: NoteCardService,
): void {
  app.action("margin_note_edit", async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const context = actionContext(body, action);
      const data = await noteCards.getCardData(context.owner, context.location.noteId);
      await client.views.open({
        trigger_id: context.triggerId,
        view: buildEditNoteModal(data.note, context.location),
      });
    } catch (error) {
      logger.error("Unable to open note edit modal", error);
    }
  });

  app.action("margin_note_reminder", async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const context = actionContext(body, action);
      const data = await noteCards.getCardData(context.owner, context.location.noteId);
      await client.views.open({
        trigger_id: context.triggerId,
        view: buildReminderModal(data.note, context.location) as never,
      });
    } catch (error) {
      logger.error("Unable to open note reminder modal", error);
    }
  });

  app.action("margin_note_meeting", async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const context = actionContext(body, action);
      const [data, candidates] = await Promise.all([
        noteCards.getCardData(context.owner, context.location.noteId),
        noteCards.listMeetingCandidates(context.owner, context.location.noteId),
      ]);
      await client.views.open({
        trigger_id: context.triggerId,
        view: buildMeetingModal(
          data.note,
          candidates,
          context.location,
        ) as never,
      });
    } catch (error) {
      logger.error("Unable to open meeting context modal", error);
    }
  });

  app.action("margin_note_priority", async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const context = actionContext(body, action);
      const selected = selectedOptionValue(action);
      await noteCards.setPriority(
        context.owner,
        context.location.noteId,
        selected,
      );
      await refreshCard(
        client,
        noteCards,
        context.owner,
        context.userId,
        context.location,
      );
    } catch (error) {
      logger.error("Unable to update note priority", error);
    }
  });

  app.action(
    "margin_note_display_mode",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const context = actionContext(body, action);
        const parsed = DisplayActionSchema.parse(actionValue(action));
        if (parsed.noteId !== context.location.noteId) {
          throw new Error("Display action note does not match card context");
        }
        await noteCards.setDisplayMode(
          context.owner,
          parsed.noteId,
          parsed.displayMode,
        );
        await refreshCard(
          client,
          noteCards,
          context.owner,
          context.userId,
          context.location,
        );
      } catch (error) {
        logger.error("Unable to update note display mode", error);
      }
    },
  );

  app.view(
    "margin_note_edit_submit",
    async ({ ack, body, view, client, logger }) => {
      const text = plainTextValue(
        view.state.values,
        "margin_note_edit_block",
        "margin_note_edit_value",
      ).trim();
      if (!text) {
        await ack({
          response_action: "errors",
          errors: { margin_note_edit_block: "The organized note cannot be empty." },
        });
        return;
      }
      if (text.length > 2800) {
        await ack({
          response_action: "errors",
          errors: { margin_note_edit_block: "Keep the note under 2,800 characters." },
        });
        return;
      }

      await ack();
      try {
        const context = viewContext(body, view.private_metadata);
        await noteCards.editOrganizedText(
          context.owner,
          context.location.noteId,
          text,
        );
        await refreshCard(
          client,
          noteCards,
          context.owner,
          context.userId,
          context.location,
        );
      } catch (error) {
        logger.error("Unable to save note edit", error);
      }
    },
  );

  app.view(
    "margin_note_reminder_submit",
    async ({ ack, body, view, client, logger }) => {
      const value = plainTextValue(
        view.state.values,
        "margin_note_reminder_block",
        "margin_note_reminder_value",
      );
      if (value.length > 500) {
        await ack({
          response_action: "errors",
          errors: {
            margin_note_reminder_block: "Keep the reminder under 500 characters.",
          },
        });
        return;
      }

      await ack();
      try {
        const context = viewContext(body, view.private_metadata);
        await noteCards.setReminderIntent(
          context.owner,
          context.location.noteId,
          value,
        );
        await refreshCard(
          client,
          noteCards,
          context.owner,
          context.userId,
          context.location,
        );
      } catch (error) {
        logger.error("Unable to save reminder intent", error);
      }
    },
  );

  app.view(
    "margin_note_meeting_submit",
    async ({ ack, body, view, client, logger }) => {
      const selected = selectedViewOptionValue(
        view.state.values,
        "margin_note_meeting_block",
        "margin_note_meeting_value",
      );
      await ack();
      try {
        const context = viewContext(body, view.private_metadata);
        await noteCards.setMeeting(
          context.owner,
          context.location.noteId,
          selected === "none" ? null : selected,
        );
        await refreshCard(
          client,
          noteCards,
          context.owner,
          context.userId,
          context.location,
        );
      } catch (error) {
        logger.error("Unable to save meeting context", error);
      }
    },
  );
}

async function refreshCard(
  client: WebClient,
  noteCards: NoteCardService,
  owner: OwnerScope,
  userId: string,
  location: CardLocation,
): Promise<void> {
  if (!location.channelId.startsWith("D")) {
    throw new Error("Margin note cards may only be updated in DMs");
  }

  const data = await noteCards.getCardData(owner, location.noteId);
  if (
    data.note.cardChannelId !== null &&
    (data.note.cardChannelId !== location.channelId ||
      data.note.cardMessageTs !== location.messageTs)
  ) {
    throw new Error("Slack card location does not match the stored note card");
  }

  const timeZone = await resolveSlackUserTimeZone(client, userId);
  await client.chat.update({
    channel: location.channelId,
    ts: location.messageTs,
    text: buildNoteCardFallbackText(data),
    blocks: buildNoteCardBlocks(data, timeZone) as never,
  });
}

function actionContext(body: unknown, action: unknown): SlackActionContext {
  const record = object(body, "Slack action body");
  const team = object(record.team, "Slack action team");
  const user = object(record.user, "Slack action user");
  const channel = object(record.channel, "Slack action channel");
  const message = object(record.message, "Slack action message");
  const workspaceId = string(team.id, "Slack workspace ID");
  const userId = string(user.id, "Slack user ID");
  const channelId = string(channel.id, "Slack channel ID");
  const messageTs = string(message.ts, "Slack message timestamp");
  const triggerId = string(record.trigger_id, "Slack trigger ID");
  const noteId = noteIdFromAction(action);

  if (!channelId.startsWith("D")) {
    throw new Error("Margin interactions are restricted to private DMs");
  }

  return {
    owner: { workspaceId, userId },
    userId,
    triggerId,
    location: { noteId, channelId, messageTs },
  };
}

function viewContext(body: unknown, metadata: string): SlackActionContext {
  const record = object(body, "Slack view body");
  const team = object(record.team, "Slack view team");
  const user = object(record.user, "Slack view user");
  const workspaceId = string(team.id, "Slack workspace ID");
  const userId = string(user.id, "Slack user ID");
  const triggerId =
    typeof record.trigger_id === "string" ? record.trigger_id : "view-submit";
  const location = decodeCardLocation(metadata);

  return {
    owner: { workspaceId, userId },
    userId,
    triggerId,
    location,
  };
}

function noteIdFromAction(action: unknown): string {
  const record = object(action, "Slack block action");
  if (typeof record.value === "string") {
    try {
      const parsed = JSON.parse(record.value) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as Record<string, unknown>).noteId === "string"
      ) {
        return z.string().uuid().parse(
          (parsed as Record<string, unknown>).noteId,
        );
      }
    } catch {
      if (z.string().uuid().safeParse(record.value).success) {
        return record.value;
      }
    }

    if (z.string().uuid().safeParse(record.value).success) {
      return record.value;
    }
  }

  const blockId = string(record.block_id, "Slack action block ID");
  const match = /^margin_note_actions_([0-9a-f-]{36})_/i.exec(blockId);
  if (!match?.[1]) {
    throw new Error("Slack action did not identify a note");
  }
  return z.string().uuid().parse(match[1]);
}

function actionValue(action: unknown): unknown {
  const record = object(action, "Slack block action");
  return JSON.parse(string(record.value, "Slack action value"));
}

function selectedOptionValue(action: unknown): string {
  const record = object(action, "Slack select action");
  const option = object(record.selected_option, "Slack selected option");
  return string(option.value, "Slack selected option value");
}

function plainTextValue(
  values: unknown,
  blockId: string,
  actionId: string,
): string {
  const blocks = object(values, "Slack view values");
  const block = object(blocks[blockId], `Slack view block ${blockId}`);
  const action = object(block[actionId], `Slack view action ${actionId}`);
  return typeof action.value === "string" ? action.value : "";
}

function selectedViewOptionValue(
  values: unknown,
  blockId: string,
  actionId: string,
): string {
  const blocks = object(values, "Slack view values");
  const block = object(blocks[blockId], `Slack view block ${blockId}`);
  const action = object(block[actionId], `Slack view action ${actionId}`);
  const option = object(action.selected_option, "Slack selected view option");
  return string(option.value, "Slack selected view option value");
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
