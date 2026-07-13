import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresMarginMcpReminderStore } from "../src/mcp/reminderStore.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL MCP reminder store", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const store = new PostgresMarginMcpReminderStore(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("creates an immutable note and idempotent owner-scoped reminder", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const other = { workspaceId, userId: "U-other" };
    const requestKey = `mcp:${randomUUID()}`;
    const input = {
      text: "Review the ngrok configuration",
      scheduledFor: new Date("2026-07-14T13:00:00.000Z"),
      requestKey,
    };

    const first = await store.createFixed(owner, input);
    const duplicate = await store.createFixed(owner, input);

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.noteId).toBe(first.noteId);
    expect(first).toMatchObject({
      text: "Review the ngrok configuration",
      rawText: "Review the ngrok configuration",
      scheduledFor: "2026-07-14T13:00:00.000Z",
      status: "pending",
    });

    const ownerList = await store.list(owner, "pending", 10);
    const otherList = await store.list(other, "any", 10);
    expect(ownerList.map((item) => item.id)).toContain(first.id);
    expect(otherList).toEqual([]);

    const cancelled = await store.cancel(owner, first.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(await store.cancel(other, first.id)).toBeNull();

    const note = await pool.query<{ raw_text: string; source_channel_id: string }>(
      `SELECT raw_text, source_channel_id
       FROM notes
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
      [first.noteId, owner.workspaceId, owner.userId],
    );
    expect(note.rows[0]).toEqual({
      raw_text: "Review the ngrok configuration",
      source_channel_id: "MCP",
    });

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });

  it("attaches a reminder only to an existing note owned by the caller", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const noteId = randomUUID();
    await pool.query(
      `INSERT INTO notes (
         id, workspace_id, user_id, source_channel_id, source_message_ts, raw_text
       ) VALUES ($1, $2, $3, 'MCP', $4, $5)`,
      [noteId, owner.workspaceId, owner.userId, `test:${randomUUID()}`, "Existing note"],
    );

    const reminder = await store.createFixed(owner, {
      noteId,
      scheduledFor: new Date("2026-07-14T14:00:00.000Z"),
      requestKey: `mcp:${randomUUID()}`,
    });
    expect(reminder.noteId).toBe(noteId);

    await expect(
      store.createFixed(
        { workspaceId, userId: "U-other" },
        {
          noteId,
          scheduledFor: new Date("2026-07-14T15:00:00.000Z"),
          requestKey: `mcp:${randomUUID()}`,
        },
      ),
    ).rejects.toThrow("not found");

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });
});
