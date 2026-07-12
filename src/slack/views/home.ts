import { loadGoogleEnvironment } from "../../config.js";
import type { UserDataSettings } from "../../storage/userDataRepository.js";

export interface MarginHomeViewState {
  calendarAvailable?: boolean;
  calendarConnected: boolean;
  dataSettings?: UserDataSettings;
}

const DEFAULT_DATA_SETTINGS: UserDataSettings = {
  digestsEnabled: true,
  resurfacingEnabled: true,
  retentionDays: null,
};

export function buildMarginHomeView(state: MarginHomeViewState) {
  const calendarAvailable =
    state.calendarAvailable ?? loadGoogleEnvironment().enabled;
  const dataSettings = state.dataSettings ?? DEFAULT_DATA_SETTINGS;
  const notificationsEnabled =
    dataSettings.digestsEnabled && dataSettings.resurfacingEnabled;
  const retentionLabel = dataSettings.retentionDays
    ? `${dataSettings.retentionDays} days`
    : "Keep until I delete";
  const calendarSection = calendarAvailable
    ? {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: state.calendarConnected
            ? "*Google Calendar connected*\nMargin can read event titles, times, and limited attendee identifiers using a read-only event scope. Calendar descriptions are not requested or sent to the model."
            : "*Google Calendar not connected*\nConnect Calendar to attach verified meeting context. Notes still work normally without it.",
        },
        accessory: state.calendarConnected
          ? {
              type: "button" as const,
              action_id: "margin_google_calendar_disconnect",
              text: { type: "plain_text" as const, text: "Disconnect" },
              style: "danger" as const,
              confirm: {
                title: { type: "plain_text" as const, text: "Disconnect Calendar?" },
                text: {
                  type: "mrkdwn" as const,
                  text: "Margin will revoke the Google token when possible and delete the stored encrypted credentials.",
                },
                confirm: { type: "plain_text" as const, text: "Disconnect" },
                deny: { type: "plain_text" as const, text: "Cancel" },
              },
            }
          : {
              type: "button" as const,
              action_id: "margin_google_calendar_connect",
              text: { type: "plain_text" as const, text: "Connect Calendar" },
              style: "primary" as const,
            },
      }
    : {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "*Google Calendar unavailable*\nThis Margin deployment was started without Google Calendar integration. Private note capture, Slack huddle context, retrieval, digests, and other non-Calendar features remain available.",
        },
      };

  return {
    type: "home" as const,
    blocks: [
      {
        type: "header" as const,
        text: {
          type: "plain_text" as const,
          text: "Margin",
        },
      },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "*Your private margin notes for meetings.*\nSend Margin a direct message whenever something is worth remembering.",
        },
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: ":lock: Notes are private by default. Margin does not record or transcribe meetings.",
          },
        ],
      },
      { type: "divider" as const },
      calendarSection,
      { type: "divider" as const },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `*Data and privacy*\nRetention: *${retentionLabel}*\nProactive digests and resurfacing: *${notificationsEnabled ? "Enabled" : "Disabled"}*`,
        },
      },
      {
        type: "actions" as const,
        block_id: "margin_data_controls",
        elements: [
          {
            type: "button" as const,
            action_id: "margin_export_data",
            text: { type: "plain_text" as const, text: "Export my data" },
          },
          {
            type: "button" as const,
            action_id: "margin_retention_settings",
            text: { type: "plain_text" as const, text: "Retention" },
          },
          {
            type: "button" as const,
            action_id: "margin_toggle_notifications",
            value: notificationsEnabled ? "disable" : "enable",
            text: {
              type: "plain_text" as const,
              text: notificationsEnabled
                ? "Disable notifications"
                : "Enable notifications",
            },
          },
          {
            type: "button" as const,
            action_id: "margin_delete_all_data",
            style: "danger" as const,
            text: { type: "plain_text" as const, text: "Delete all data" },
            confirm: {
              title: { type: "plain_text" as const, text: "Delete all Margin data?" },
              text: {
                type: "mrkdwn" as const,
                text: "This permanently deletes your notes, revisions, reminders, meeting context, notification jobs, preferences, and connected integration credentials. This cannot be undone.",
              },
              confirm: { type: "plain_text" as const, text: "Delete everything" },
              deny: { type: "plain_text" as const, text: "Cancel" },
            },
          },
        ],
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: "Exports are delivered only to your private Margin DM. OAuth tokens and authorization state are never included.",
          },
        ],
      },
      { type: "divider" as const },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "*Try it*\nOpen the *Messages* tab and send:\n> Important: ask whether the migration affects customer-created workflows.",
        },
      },
    ],
  };
}
