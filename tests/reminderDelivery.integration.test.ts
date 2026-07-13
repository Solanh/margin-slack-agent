import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresReminderRepository } from "../src/storage/postgresReminderRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL reminder delivery", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const reminders = new PostgresReminderRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("claims once, retries durably, and stops after delivery", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const now = new Date("2026-07-13T22:00:00.000Z");
    const note = await notes.createRaw({
      ...owner,
      sourceChannelId: "MCP",
      sourceMessageTs: `mcp-${randomUUID()}`,
      rawText: "remind me to review the deployment",
    });
    const reminder = await reminders.create({
      ...owner,
      noteId: note.id,
      reminderType: "fixed",
      scheduledFor: new Date(now.getTime() - 1_000),
    });

    const firstClaim = await reminders.claimDue(now, 10);
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({
      id: reminder.id,
      noteId: note.id,
      workspaceId,
      userId: owner.userId,
      attempts: 1,
      rawText: "remind me to review the deployment",
    });
    await expect(reminders.claimDue(now, 10)).resolves.toHaveLength(0);

    const retryAt = new Date(now.getTime() + 60_000);
    await reminders.markFailed(owner, reminder.id, "temporary_failure", retryAt);
    await expect(
      reminders.claimDue(new Date(retryAt.getTime() - 1), 10),
    ).resolves.toHaveLength(0);

    const secondClaim = await reminders.claimDue(retryAt, 10);
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim[0]?.attempts).toBe(2);

    await reminders.markDelivered(
      owner,
      reminder.id,
      { channelId: "D-owner", messageTs: "123.456" },
      retryAt,
    );
    await expect(
      reminders.claimDue(new Date(retryAt.getTime() + 60_000), 10),
    ).resolves.toHaveLength(0);
    expect((await reminders.getById(owner, reminder.id))?.status).toBe("sent");

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });
});
