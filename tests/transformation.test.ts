import { describe, expect, it } from "vitest";
import {
  transformNote,
  UnsafeTransformationError,
  type TransformationModel,
} from "../src/services/transformation.js";

const baseTransformation = {
  priority: "normal" as const,
  reminderIntent: null,
  explicitDueAt: null,
  inferredFields: ["organizedText", "noteType", "priority"] as const,
  uncertainties: [] as string[],
};

function modelReturning(output: unknown): TransformationModel {
  return {
    async transform() {
      return output;
    },
  };
}

describe("transformNote", () => {
  for (const [noteType, rawText, organizedText] of [
    ["decision", "decided to ship Friday", "Decision: ship Friday."],
    ["action", "I need to email Maya", "Email Maya."],
    ["question", "ask if migration affects customers", "Does the migration affect customers?"],
    ["idea", "maybe add a dry-run mode", "Idea: add a dry-run mode."],
    ["reference", "resolver starts in service factory", "The resolver starts in the service factory."],
  ] as const) {
    it(`accepts a conservative ${noteType} transformation`, async () => {
      const result = await transformNote(
        modelReturning({
          ...baseTransformation,
          organizedText,
          noteType,
        }),
        {
          rawText,
          userTimeZone: "America/New_York",
        },
      );

      expect(result.noteType).toBe(noteType);
      expect(result.organizedText).toBe(organizedText);
    });
  }

  it("accepts an explicitly requested relative reminder", async () => {
    const result = await transformNote(
      modelReturning({
        organizedText:
          "Confirm whether the migration affects customer-created workflows.",
        noteType: "question",
        priority: "high",
        reminderIntent: "before the next planning meeting",
        explicitDueAt: null,
        inferredFields: [
          "organizedText",
          "noteType",
          "priority",
          "reminderIntent",
        ],
        uncertainties: [
          "The next planning meeting must be resolved from calendar context.",
        ],
      }),
      {
        rawText:
          "important ask if migration also affects customer-created workflows. remind me before planning",
        verifiedMeetingTitle: "Workflow Migration Review",
        userTimeZone: "America/New_York",
      },
    );

    expect(result.reminderIntent).toBe("before the next planning meeting");
    expect(result.explicitDueAt).toBeNull();
  });

  it("rejects malformed model output", async () => {
    await expect(
      transformNote(
        modelReturning({
          organizedText: "",
          noteType: "made-up-type",
        }),
        {
          rawText: "remember this",
          userTimeZone: "America/New_York",
        },
      ),
    ).rejects.toThrow();
  });

  it("rejects output that hides model-derived fields", async () => {
    await expect(
      transformNote(
        modelReturning({
          ...baseTransformation,
          organizedText: "Email Maya.",
          noteType: "action",
          inferredFields: ["noteType", "priority"],
        }),
        {
          rawText: "I need to email Maya",
          userTimeZone: "America/New_York",
        },
      ),
    ).rejects.toBeInstanceOf(UnsafeTransformationError);
  });

  it("rejects an exact due time without reminder intent", async () => {
    await expect(
      transformNote(
        modelReturning({
          ...baseTransformation,
          organizedText: "Review the proposal.",
          noteType: "action",
          explicitDueAt: "2026-07-13T13:00:00.000Z",
          inferredFields: [
            "organizedText",
            "noteType",
            "priority",
            "explicitDueAt",
          ],
        }),
        {
          rawText: "review the proposal",
          userTimeZone: "America/New_York",
        },
      ),
    ).rejects.toThrow("requires a reminder intent");
  });
});
