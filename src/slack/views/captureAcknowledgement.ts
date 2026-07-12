export function buildCaptureAcknowledgement() {
  return [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: "Note saved",
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: "Your exact message was saved privately before any enrichment step.",
      },
    },
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: ":lock: Original preserved. Meeting context and AI organization are not enabled yet.",
        },
      ],
    },
  ];
}

export function buildCaptureFailureAcknowledgement() {
  return [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: "Note not saved",
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: "Margin could not persist this note. Your original message is still visible in Slack; copy it before retrying if it is important.",
      },
    },
  ];
}
