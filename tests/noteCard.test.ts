import { describe, expect, it } from "vitest";
import type { MeetingContext, Note } from "../src/domain/note.js";
import {
  buildNoteCardBlocks,
  buildProcessingNoteBlocks,
  escapeSlackMrkdwn,
} from "../src/slack/views/noteCard.js";

const note: Note = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "T123",
  userId: "U123",
  sourceChannelId: "D123",
  sourceMessageTs: "123.456",
  rawText: "ask <@U999> if migration affects customers",
  organizedText: "Confirm whether the migration affects customers.",
  noteType: "question",
  priority: "high",
  status: "open",
  displayMode: "organized",
  meetingId: "22222222-2222-4222-8222-222222222222",
  contextConfidence: "exact",
  reminderIntent: "before the next planning meeting",
  explicitDueAt: null,
  inferredFields: [
    "organizedText",
    "noteType",
    "priority",
    "reminderIntent",
  ],
  uncertainties: ["The next planning meeting is not resolved yet."],
  transformationVersion: "margin-note-v1",
  cardChannelId: "D123",
  cardMessageTs: "999.000",
  createdAt: new Date("2026-07-12T18:00:00.000Z"),
  updatedAt: new Date("2026-07-12T18:00:01.000Z"),
};

const meeting: MeetingContext = {
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId: "T123",
  userId: "U123",
  provider: "google_calendar",
  providerEventId: "event-1",
  title: "Workflow Migration Review",
  startsAt: new Date("2026-07-12T18:00:00.000Z"),
  endsAt: new Date("2026-07-12T18:30:00.000Z"),
  participants: [],
  confidence: "exact",
  createdAt: new Date("2026-07-12T17:00:00.000Z"),
  updatedAt: new Date("2026-07-12T17:00:00.000Z"),
};

describe("note card", () => {
  it("labels user, verified, inferred, and unresolved information", () => {
    const blocks = buildNoteCardBlocks(
      { note, meeting },
      "America/New_York",
    );
    const rendered = JSON.stringify(blocks);

    expect(rendered).toContain("Organized note");
    expect(rendered).toContain("AI-derived");
    expect(rendered).toContain("User-provided · immutable");
    expect(rendered).toContain("Verified (exact)");
    expect(rendered).toContain("Unresolved");
    expect(rendered).toContain("Original preserved");
  });

  it("escapes user-authored Slack markup", () => {
    const rendered = JSON.stringify(
      buildNoteCardBlocks({ note, meeting }, "UTC"),
    );

    expect(rendered).not.toContain("<@U999>");
    expect(rendered).toContain("&amp;lt;@U999&amp;gt;");
    expect(escapeSlackMrkdwn("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("renders all five interactive controls in one updateable action block", () => {
    const blocks = buildNoteCardBlocks({ note, meeting }, "UTC");
    const actions = blocks.find((block) => block.type === "actions") as {
      elements: Array<{ action_id: string }>;
      block_id: string;
    };

    expect(actions.block_id).toContain(note.id);
    expect(actions.elements.map((element) => element.action_id)).toEqual([
      "margin_note_edit",
      "margin_note_priority",
      "margin_note_reminder",
      "margin_note_meeting",
      "margin_note_display_mode",
    ]);
  });

  it("supports a reversible verbatim display", () => {
    const rendered = JSON.stringify(
      buildNoteCardBlocks(
        { note: { ...note, displayMode: "verbatim" }, meeting },
        "UTC",
      ),
    );

    expect(rendered).toContain("Verbatim note");
    expect(rendered).not.toContain("*Organized note*");
    expect(rendered).toContain("Use organized");
  });

  it("shows the immutable original while processing", () => {
    const rendered = JSON.stringify(buildProcessingNoteBlocks(note.rawText));
    expect(rendered).toContain("User-provided · immutable");
    expect(rendered).toContain("Saved privately");
  });
});
