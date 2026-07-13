import { loadGoogleEnvironment } from "../../config.js";
import type {
  DashboardUpcomingItem,
  HomeDashboardData,
  RetrievedNote,
} from "../../domain/retrieval.js";
import type { UserDataSettings } from "../../storage/userDataRepository.js";

export interface MarginHomeViewState {
  calendarAvailable?: boolean;
  calendarConnected: boolean;
  dataSettings?: UserDataSettings;
  dashboard?: HomeDashboardData;
  timeZone?: string;
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
  const timeZone = state.timeZone ?? "UTC";
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

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Margin",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Your private margin notes for meetings.*\nSend Margin a direct message whenever something is worth remembering.",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":lock: Notes are private by default. Margin does not record or transcribe meetings.",
        },
      ],
    },
  ];

  if (state.dashboard) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Your memory*\n${state.dashboard.openActions.length} open action${state.dashboard.openActions.length === 1 ? "" : "s"} · ${state.dashboard.unresolvedQuestions.length} unresolved question${state.dashboard.unresolvedQuestions.length === 1 ? "" : "s"} · ${state.dashboard.upcoming.length} upcoming item${state.dashboard.upcoming.length === 1 ? "" : "s"}`,
        },
      },
      ...buildNoteSection(
        "Open actions",
        state.dashboard.openActions,
        "No open actions. Action notes you capture will appear here.",
        timeZone,
      ),
      ...buildNoteSection(
        "Unresolved questions",
        state.dashboard.unresolvedQuestions,
        "No unresolved questions.",
        timeZone,
      ),
      ...buildUpcomingSection(state.dashboard.upcoming, timeZone),
      ...buildNoteSection(
        "Recent notes",
        state.dashboard.recentNotes,
        "No notes yet. Send Margin a message to capture your first one.",
        timeZone,
      ),
    );
  }

  blocks.push(
    { type: "divider" },
    calendarSection,
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Data and privacy*\nRetention: *${retentionLabel}*\nProactive digests and resurfacing: *${notificationsEnabled ? "Enabled" : "Disabled"}*`,
      },
    },
    {
      type: "actions",
      block_id: "margin_data_controls",
      elements: [
        {
          type: "button",
          action_id: "margin_export_data",
          text: { type: "plain_text", text: "Export my data" },
        },
        {
          type: "button",
          action_id: "margin_retention_settings",
          text: { type: "plain_text", text: "Retention" },
        },
        {
          type: "button",
          action_id: "margin_toggle_notifications",
          value: notificationsEnabled ? "disable" : "enable",
          text: {
            type: "plain_text",
            text: notificationsEnabled
              ? "Disable notifications"
              : "Enable notifications",
          },
        },
        {
          type: "button",
          action_id: "margin_delete_all_data",
          style: "danger",
          text: { type: "plain_text", text: "Delete all data" },
          confirm: {
            title: { type: "plain_text", text: "Delete all Margin data?" },
            text: {
              type: "mrkdwn",
              text: "This permanently deletes your notes, revisions, reminders, meeting context, notification jobs, preferences, and connected integration credentials. This cannot be undone.",
            },
            confirm: { type: "plain_text", text: "Delete everything" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Exports are delivered only to your private Margin DM. OAuth tokens and authorization state are never included.",
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Try it*\nOpen the *Messages* tab and send:\n> Important: ask whether the migration affects customer-created workflows.",
      },
    },
  );

  return {
    type: "home" as const,
    blocks: blocks as never,
  };
}

function buildNoteSection(
  title: string,
  notes: RetrievedNote[],
  emptyText: string,
  timeZone: string,
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: title },
    },
  ];
  if (notes.length === 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: emptyText }],
    });
    return blocks;
  }

  for (const note of notes) {
    const label = note.noteType ? formatLabel(note.noteType) : "Private note";
    const meeting = note.meetingTitle
      ? ` · ${escapeSlackMrkdwn(truncate(note.meetingTitle, 50))}`
      : "";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(truncate(note.organizedText ?? "Saved verbatim note", 160))}*\n${label} · ${formatLabel(note.priority)} priority · ${formatDate(note.createdAt, timeZone)}${meeting}`,
      },
      accessory: {
        type: "button",
        action_id: "margin_retrieval_view_original",
        text: { type: "plain_text", text: "Open" },
        value: note.id,
      },
    });
  }
  return blocks;
}

function buildUpcomingSection(
  items: DashboardUpcomingItem[],
  timeZone: string,
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: "Coming up" },
    },
  ];
  if (items.length === 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "No upcoming reminders or verified pre-meeting resurfacing.",
        },
      ],
    });
    return blocks;
  }

  for (const item of items) {
    const kind = item.kind === "reminder" ? "Reminder" : "Pre-meeting review";
    const block: Record<string, unknown> = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackMrkdwn(truncate(item.text, 160))}*\n${kind} · ${formatDateTime(item.scheduledFor, timeZone)}`,
      },
    };
    if (item.noteId) {
      block.accessory = {
        type: "button",
        action_id: "margin_retrieval_view_original",
        text: { type: "plain_text", text: "Open" },
        value: item.noteId,
      };
    }
    blocks.push(block);
  }
  return blocks;
}

function formatDate(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function formatDateTime(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function formatLabel(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1)}…`;
}

function escapeSlackMrkdwn(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
