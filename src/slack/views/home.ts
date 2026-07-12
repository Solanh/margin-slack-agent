export function buildMarginHomeView() {
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
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: "*Prototype status*\nThe Slack capture shell is connected. Durable storage, meeting context, and organization are implemented in the next roadmap issues.",
        },
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
