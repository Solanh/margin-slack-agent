import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresReminderRepository } from "../src/storage/postgresReminderRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL schema invariants", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const reminders = new PostgresReminderRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("keeps raw text immutable and scopes reads by owner", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const note = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "exact original",
    });

    expect(await notes.getById(owner, note.id)).not.toBeNull();
    expect(
      await notes.getById(
        { workspaceId, userId: "U-other" },
        note.id,
      ),
    ).toBeNull();

    await expect(
      pool.query("UPDATE notes SET raw_text = $1 WHERE id = $2", [
        "changed",
        note.id,
      ]),
    ).rejects.toThrow("notes.raw_text is immutable");

    const preserved = await notes.getById(owner, note.id);
    expect(preserved?.rawText).toBe("exact original");

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [
      workspaceId,
    ]);
  });

  it("rejects reminders that cross user ownership boundaries", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const note = await notes.createRaw({
      workspaceId,
      userId: "U-owner",
      sourceChannelId: "D123",
      sourceMessageTs: "456.789",
      rawText: "private note",
    });

    await expect(
      reminders.create({
        workspaceId,
        userId: "U-other",
        noteId: note.id,
        reminderType: "fixed",
        scheduledFor: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow();

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [
      workspaceId,
    ]);
  });

  it("treats duplicate Slack delivery as a no-op", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const input = {
      workspaceId,
      userId: "U-owner",
      sourceChannelId: "D123",
      sourceMessageTs: "789.012",
      rawText: "first and permanent",
    };

    const first = await notes.createRaw(input);
    const duplicate = await notes.createRaw({
      ...input,
      rawText: "attempted replacement",
    });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.rawText).toBe("first and permanent");
    expect(duplicate.createdAt.getTime()).toBe(first.createdAt.getTime());

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [
      workspaceId,
    ]);
  });
});
