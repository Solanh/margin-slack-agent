export interface MarginHomeViewState {
  calendarAvailable: boolean;
  calendarConnected: boolean;
}

export function buildMarginHomeView(state: MarginHomeViewState) {
  const calendarSection = state.calendarAvailable
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
      {
        type: "divider" as const,
      },
      calendarSection,
      {
        type: "divider" as const,
      },
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
