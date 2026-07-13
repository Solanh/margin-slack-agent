export function buildCaptureShortcutModal() {
  return {
    type: "modal" as const,
    callback_id: "margin_capture_note_submit",
    title: { type: "plain_text" as const, text: "Capture a note" },
    submit: { type: "plain_text" as const, text: "Save privately" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks: [
      {
        type: "input" as const,
        block_id: "margin_capture_shortcut_block",
        label: {
          type: "plain_text" as const,
          text: "What should Margin remember?",
        },
        element: {
          type: "plain_text_input" as const,
          action_id: "margin_capture_shortcut_value",
          multiline: true,
          max_length: 4000,
          placeholder: {
            type: "plain_text" as const,
            text: "Important: ask whether this affects customer-created workflows.",
          },
        },
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: ":lock: Margin saves this only to your private memory. It does not record or transcribe the conversation.",
          },
        ],
      },
    ],
  };
}
