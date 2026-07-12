import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresNoteInteractionRepository } from "../src/storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresTransformationRepository } from "../src/storage/postgresTransformationRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("interactive note persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const interactions = new PostgresNoteInteractionRepository(pool, notes);
  const transformations = new PostgresTransformationRepository(pool, notes);

  afterAll(async () => {
    await pool.end();
  });

  it("keeps raw text immutable while recording user-edited provenance", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "important ask if migration affects customers",
    });

    await transformations.applyTransformation({
      ...owner,
      noteId: raw.id,
      transformation: {
        organizedText: "Confirm whether the migration affects customers.",
        noteType: "question",
        priority: "high",
        reminderIntent: "before planning",
        explicitDueAt: null,
        inferredFields: [
          "organizedText",
          "noteType",
          "priority",
          "reminderIntent",
        ],
        uncertainties: [],
      },
      transformationVersion: "margin-note-v1",
    });

    await interactions.setCardReference(owner, raw.id, {
      channelId: "D123",
      messageTs: "999.000",
    });
    await interactions.applyUserPatch({
      ...owner,
      noteId: raw.id,
      patch: {
        organizedText: "Check whether migration affects customer workflows.",
        priority: "normal",
        reminderIntent: "tomorrow morning",
        explicitDueAt: null,
        displayMode: "verbatim",
        removeInferredFields: [
          "organizedText",
          "priority",
          "reminderIntent",
          "explicitDueAt",
        ],
      },
    });

    const saved = await notes.getById(owner, raw.id);
    expect(saved).toMatchObject({
      rawText: raw.rawText,
      organizedText: "Check whether migration affects customer workflows.",
      priority: "normal",
      reminderIntent: "tomorrow morning",
      displayMode: "verbatim",
      cardChannelId: "D123",
      cardMessageTs: "999.000",
    });
    expect(saved?.inferredFields).toEqual(["noteType"]);

    const revisions = await pool.query<{
      revision_source: string;
      display_mode: string;
      organized_text: string;
      priority: string;
    }>(
      `
        SELECT revision_source, display_mode, organized_text, priority
        FROM note_revisions
        WHERE note_id = $1
        ORDER BY created_at ASC
      `,
      [raw.id],
    );

    expect(revisions.rows.map((revision) => revision.revision_source)).toEqual([
      "ai",
      "user",
    ]);
    expect(revisions.rows[1]).toMatchObject({
      display_mode: "verbatim",
      organized_text: "Check whether migration affects customer workflows.",
      priority: "normal",
    });

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });

  it("rejects non-DM card references and cross-owner edits", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "456.789",
      rawText: "private note",
    });

    await expect(
      interactions.setCardReference(owner, raw.id, {
        channelId: "C-public",
        messageTs: "999.000",
      }),
    ).rejects.toThrow("only be stored in a Slack DM");

    await expect(
      interactions.applyUserPatch({
        workspaceId,
        userId: "U-other",
        noteId: raw.id,
        patch: { priority: "critical" },
      }),
    ).rejects.toThrow("Owner-scoped note was not found");

    const preserved = await notes.getById(owner, raw.id);
    expect(preserved?.priority).toBe("normal");
    expect(preserved?.rawText).toBe("private note");

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });
});
