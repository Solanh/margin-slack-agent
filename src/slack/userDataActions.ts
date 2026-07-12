import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { GoogleCalendarConnectionService } from "../services/googleCalendarOAuth.js";
import type { UserDataControlService } from "../services/userDataControls.js";
import type { OwnerScope } from "../domain/note.js";
import { getWorkspaceId } from "./listeners.js";
import { buildMarginHomeView } from "./views/home.js";
import { buildRetentionSettingsModal } from "./views/userDataControls.js";

interface FilesUploadClient {
  filesUploadV2(input: {
    channel_id: string;
    content: string;
    filename: string;
    title: string;
    initial_comment: string;
  }): Promise<unknown>;
}

export function registerUserDataActions(
  app: App,
  userData: UserDataControlService,
  calendarConnections: GoogleCalendarConnectionService,
): void {
  app.action("margin_export_data", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const owner = ownerFromBody(body);
      const exportedAt = new Date();
      const content = await userData.exportJson(owner, exportedAt);
      const opened = await client.conversations.open({ users: owner.userId });
      const channelId = opened.channel?.id;
      if (!channelId || !channelId.startsWith("D")) {
        throw new Error("private_export_channel_unavailable");
      }

      await (client as WebClient as unknown as FilesUploadClient).filesUploadV2({
        channel_id: channelId,
        content,
        filename: `margin-data-export-${exportedAt.toISOString().slice(0, 10)}.json`,
        title: "Margin data export",
        initial_comment:
          "Your private Margin data export. OAuth tokens and authorization state are excluded.",
      });
    } catch (error) {
      logger.error("Unable to export Margin user data", error);
    }
  });

  app.action(
    "margin_retention_settings",
    async ({ ack, body, client, logger }) => {
      await ack();
      try {
        const owner = ownerFromBody(body);
        const settings = await userData.getSettings(owner);
        await client.views.open({
          trigger_id: triggerIdFromBody(body),
          view: buildRetentionSettingsModal(settings),
        });
      } catch (error) {
        logger.error("Unable to open retention settings", error);
      }
    },
  );

  app.view(
    "margin_retention_settings_submit",
    async ({ ack, body, view, client, logger }) => {
      const selected = selectedRetentionValue(view.state.values);
      await ack();
      try {
        const owner = ownerFromBody(body);
        await userData.setRetentionDays(
          owner,
          selected === "forever" ? null : Number.parseInt(selected, 10),
        );
        await refreshHome(client, owner, userData, calendarConnections);
      } catch (error) {
        logger.error("Unable to save retention settings", error);
      }
    },
  );

  app.action(
    "margin_toggle_notifications",
    async ({ ack, body, action, client, logger }) => {
      await ack();
      try {
        const owner = ownerFromBody(body);
        const record = asRecord(action);
        const enabled = record?.value === "enable";
        await userData.setNotificationsEnabled(owner, enabled);
        await refreshHome(client, owner, userData, calendarConnections);
      } catch (error) {
        logger.error("Unable to update notification preferences", error);
      }
    },
  );

  app.action(
    "margin_delete_all_data",
    async ({ ack, body, client, logger }) => {
      await ack();
      try {
        const owner = ownerFromBody(body);
        await userData.deleteAllData(owner);
        await refreshHome(client, owner, userData, calendarConnections);
      } catch (error) {
        logger.error("Unable to delete Margin user data", error);
      }
    },
  );
}

async function refreshHome(
  client: WebClient,
  owner: OwnerScope,
  userData: UserDataControlService,
  calendarConnections: GoogleCalendarConnectionService,
): Promise<void> {
  const [settings, calendarConnected] = await Promise.all([
    userData.getSettings(owner),
    calendarConnections.isConnected(owner),
  ]);
  await client.views.publish({
    user_id: owner.userId,
    view: buildMarginHomeView({
      calendarAvailable: calendarConnections.isAvailable(),
      calendarConnected,
      dataSettings: settings,
    }),
  });
}

function ownerFromBody(body: unknown): OwnerScope {
  const workspaceId = getWorkspaceId(body);
  const record = asRecord(body);
  const user = asRecord(record?.user);
  const userId = typeof user?.id === "string" ? user.id : null;
  if (!workspaceId || !userId) {
    throw new Error("Slack user-data action is missing owner context");
  }
  return { workspaceId, userId };
}

function triggerIdFromBody(body: unknown): string {
  const record = asRecord(body);
  const triggerId = record?.trigger_id;
  if (typeof triggerId !== "string" || !triggerId) {
    throw new Error("Slack user-data action is missing a trigger ID");
  }
  return triggerId;
}

function selectedRetentionValue(values: unknown): string {
  const blocks = asRecord(values);
  const block = asRecord(blocks?.margin_retention_block);
  const action = asRecord(block?.margin_retention_value);
  const option = asRecord(action?.selected_option);
  const value = option?.value;
  if (
    typeof value !== "string" ||
    !["forever", "30", "90", "365"].includes(value)
  ) {
    throw new Error("Slack retention submission is invalid");
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
