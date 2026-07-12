import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { Transformation } from "../src/domain/note.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresTransformationRepository } from "../src/storage/postgresTransformationRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("transformation persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const transformations = new PostgresTransformationRepository(pool, notes);

  afterAll(async () => {
    await pool.end();
  });

  it("commits current derived state and its AI revision together", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText:
        "important ask if migration affects customers remind me before planning",
    });
    const transformation: Transformation = {
      organizedText: "Confirm whether the migration affects customers.",
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
    };

    const saved = await transformations.applyTransformation({
      ...owner,
      noteId: raw.id,
      transformation,
      transformationVersion: "margin-note-v1",
    });

    expect(saved.rawText).toBe(raw.rawText);
    expect(saved.organizedText).toBe(transformation.organizedText);
    expect(saved.noteType).toBe("question");
    expect(saved.priority).toBe("high");
    expect(saved.reminderIntent).toBe(
      "before the next planning meeting",
    );
    expect(saved.inferredFields).toEqual(transformation.inferredFields);
    expect(saved.uncertainties).toEqual(transformation.uncertainties);
    expect(saved.transformationVersion).toBe("margin-note-v1");

    const revisions = await pool.query<{
      raw_text: string;
      organized_text: string;
      revision_source: string;
      transformation_version: string;
      inferred_fields: string[];
      uncertainties: string[];
    }>(
      `
        SELECT
          n.raw_text,
          r.organized_text,
          r.revision_source,
          r.transformation_version,
          r.inferred_fields,
          r.uncertainties
        FROM note_revisions r
        JOIN notes n
          ON n.id = r.note_id
         AND n.workspace_id = r.workspace_id
         AND n.user_id = r.user_id
        WHERE r.note_id = $1
          AND r.workspace_id = $2
          AND r.user_id = $3
      `,
      [raw.id, workspaceId, owner.userId],
    );

    expect(revisions.rows).toEqual([
      {
        raw_text: raw.rawText,
        organized_text: transformation.organizedText,
        revision_source: "ai",
        transformation_version: "margin-note-v1",
        inferred_fields: transformation.inferredFields,
        uncertainties: transformation.uncertainties,
      },
    ]);

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [
      workspaceId,
    ]);
  });

  it("does not write a revision when the owner-scoped note is absent", async () => {
    const workspaceId = `T-${randomUUID()}`;

    await expect(
      transformations.applyTransformation({
        workspaceId,
        userId: "U-owner",
        noteId: randomUUID(),
        transformation: {
          organizedText: "Remember this.",
          noteType: "reference",
          priority: "normal",
          reminderIntent: null,
          explicitDueAt: null,
          inferredFields: ["organizedText", "noteType", "priority"],
          uncertainties: [],
        },
        transformationVersion: "margin-note-v1",
      }),
    ).rejects.toThrow("Owner-scoped note was not found");

    const revisions = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM note_revisions WHERE workspace_id = $1",
      [workspaceId],
    );
    expect(revisions.rows[0]?.count).toBe("0");
  });
});
