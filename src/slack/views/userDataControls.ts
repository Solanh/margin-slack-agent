import type { UserDataSettings } from "../../storage/userDataRepository.js";

export function buildRetentionSettingsModal(settings: UserDataSettings) {
  const selectedValue = settings.retentionDays?.toString() ?? "forever";
  const options = [
    ["forever", "Keep until I delete"],
    ["30", "30 days"],
    ["90", "90 days"],
    ["365", "1 year"],
  ] as const;
  const initialOption = options.find(([value]) => value === selectedValue) ??
    options[0];

  return {
    type: "modal" as const,
    callback_id: "margin_retention_settings_submit",
    title: { type: "plain_text" as const, text: "Data retention" },
    submit: { type: "plain_text" as const, text: "Save" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks: [
      {
        type: "input" as const,
        block_id: "margin_retention_block",
        label: { type: "plain_text" as const, text: "Keep my Margin data" },
        element: {
          type: "static_select" as const,
          action_id: "margin_retention_value",
          options: options.map(([value, label]) => ({
            text: { type: "plain_text" as const, text: label },
            value,
          })),
          initial_option: {
            text: {
              type: "plain_text" as const,
              text: initialOption[1],
            },
            value: initialOption[0],
          },
        },
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: "Retention cleanup runs from a durable queue. Changing the period never deletes data newer than the selected cutoff.",
          },
        ],
      },
    ],
  };
}
