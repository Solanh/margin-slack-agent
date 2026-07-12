export function buildCaptureAcknowledgement() {
  return [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: "Note received",
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: "Margin received your message through the private Agent View capture path.",
      },
    },
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: ":construction: This first implementation verifies Slack connectivity only. Durable storage and AI organization are not enabled yet.",
        },
      ],
    },
  ];
}
