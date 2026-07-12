import type { App } from "@slack/bolt";
import type { GoogleCalendarConnectionService } from "../services/googleCalendarOAuth.js";
import { getWorkspaceId } from "./listeners.js";
import { buildCalendarAuthorizationModal } from "./views/calendarConnection.js";
import { buildMarginHomeView } from "./views/home.js";

export function registerCalendarActions(
  app: App,
  connections: GoogleCalendarConnectionService,
): void {
  app.action(
    "margin_google_calendar_connect",
    async ({ ack, body, client, logger }) => {
      await ack();
      try {
        const workspaceId = getWorkspaceId(body);
        const userId = body.user.id;
        const triggerId = getTriggerId(body);
        if (!workspaceId || !userId) {
          throw new Error("Slack Calendar action is missing owner context");
        }

        const authorizationUrl = await connections.createAuthorizationUrl({
          workspaceId,
          userId,
        });
        await client.views.open({
          trigger_id: triggerId,
          view: buildCalendarAuthorizationModal(authorizationUrl),
        });
      } catch (error) {
        logger.error("Unable to start Google Calendar authorization", error);
      }
    },
  );

  app.action(
    "margin_google_calendar_authorize_link",
    async ({ ack }) => {
      // URL buttons still emit an interaction payload. Authorization happens in
      // the browser; acknowledging prevents Slack from treating it as failed.
      await ack();
    },
  );

  app.action(
    "margin_google_calendar_disconnect",
    async ({ ack, body, client, logger }) => {
      await ack();
      try {
        const workspaceId = getWorkspaceId(body);
        const userId = body.user.id;
        if (!workspaceId || !userId) {
          throw new Error("Slack Calendar action is missing owner context");
        }

        const owner = { workspaceId, userId };
        const result = await connections.disconnect(owner);
        if (result.disconnected && !result.revokedRemotely) {
          logger.warn(
            "Google Calendar credentials were deleted locally but remote revocation was not confirmed",
          );
        }

        await client.views.publish({
          user_id: userId,
          view: buildMarginHomeView({ calendarConnected: false }),
        });
      } catch (error) {
        logger.error("Unable to disconnect Google Calendar", error);
      }
    },
  );
}

function getTriggerId(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new Error("Slack Calendar action is missing a trigger ID");
  }

  const triggerId = (body as Record<string, unknown>).trigger_id;
  if (typeof triggerId !== "string" || !triggerId) {
    throw new Error("Slack Calendar action is missing a trigger ID");
  }

  return triggerId;
}
