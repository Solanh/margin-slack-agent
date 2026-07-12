export function buildCalendarAuthorizationModal(authorizationUrl: string) {
  return {
    type: "modal" as const,
    callback_id: "margin_google_calendar_authorization",
    title: { type: "plain_text" as const, text: "Connect Calendar" },
    close: { type: "plain_text" as const, text: "Done" },
    blocks: [
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "Margin requests read-only access to Google Calendar events so it can match a note to the meeting occurring around that time.",
        },
      },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "*Requested data*\n• Event title\n• Start and end time\n• Limited attendee email identifiers\n\nMargin does not request permission to create or edit events, and it does not retrieve event descriptions for note transformation.",
        },
      },
      {
        type: "actions" as const,
        elements: [
          {
            type: "button" as const,
            action_id: "margin_google_calendar_authorize_link",
            text: { type: "plain_text" as const, text: "Continue to Google" },
            style: "primary" as const,
            url: authorizationUrl,
          },
        ],
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: "The authorization link expires after 10 minutes and can be used only once.",
          },
        ],
      },
    ],
  };
}
