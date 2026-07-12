import { describe, expect, it } from "vitest";
import { transformNote, type TransformationModel } from "../src/services/transformation.js";

describe("transformNote", () => {
  it("accepts schema-valid conservative output", async () => {
    const model: TransformationModel = {
      async transform() {
        return {
          organizedText:
            "Confirm whether the migration affects customer-created workflows.",
          noteType: "question",
          priority: "high",
          reminderIntent: "before the next planning meeting",
          explicitDueAt: null,
          inferredFields: ["noteType", "priority"],
          uncertainties: [],
        };
      },
    };

    const result = await transformNote(model, {
      rawText:
        "important ask if migration also affects customer-created workflows. remind me before planning",
      verifiedMeetingTitle: "Workflow Migration Review",
      userTimeZone: "America/New_York",
    });

    expect(result.noteType).toBe("question");
    expect(result.organizedText).toContain("customer-created workflows");
  });

  it("rejects malformed model output", async () => {
    const model: TransformationModel = {
      async transform() {
        return {
          organizedText: "",
          noteType: "made-up-type",
        };
      },
    };

    await expect(
      transformNote(model, {
        rawText: "remember this",
        userTimeZone: "America/New_York",
      }),
    ).rejects.toThrow();
  });
});
