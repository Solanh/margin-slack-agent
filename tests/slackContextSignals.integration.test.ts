import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresSlackContextSignalRepository } from "../src/storage/postgresSlackContextSignalRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Slack context signal persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const signals = new PostgresSlackContextSignalRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("retains active signals only for a known owner and expires them", async () => {
    const owner = {
      workspaceId: `T-${randomUUID()}`,
      userId: "U-owner",
    };

    await expect(signals.isKnownOwner(owner)).resolves.toBe(false);
    await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "private note",
    });
    await expect(signals.isKnownOwner(owner)).resolves.toBe(true);

    const firstObserved = new Date("2026-07-12T20:00:00.000Z");
    await signals.saveHuddleState({
      ...owner,
      callId: "R123",
      observedAt: firstObserved,
      expiresAt: new Date("2026-07-12T20:30:00.000Z"),
      sourceEventTs: "1783886400.000001",
    });
    await signals.saveHuddleState({
      ...owner,
      callId: "R123",
      observedAt: new Date("2026-07-12T20:05:00.000Z"),
      expiresAt: new Date("2026-07-12T20:45:00.000Z"),
      sourceEventTs: "1783886700.000001",
    });
    await signals.saveActiveContext({
      ...owner,
      entityType: "message",
      channelId: "C123",
      messageTs: "123.789",
      observedAt: firstObserved,
      expiresAt: new Date("2026-07-12T20:15:00.000Z"),
      sourceEventTs: "1783886400.000002",
    });

    await expect(
      signals.getActiveHuddle(
        owner,
        new Date("2026-07-12T20:10:00.000Z"),
      ),
    ).resolves.toMatchObject({
      callId: "R123",
      observedAt: firstObserved,
      expiresAt: new Date("2026-07-12T20:45:00.000Z"),
    });
    await expect(
      signals.getActiveContext(
        owner,
        new Date("2026-07-12T20:10:00.000Z"),
      ),
    ).resolves.toMatchObject({
      entityType: "message",
      channelId: "C123",
      messageTs: "123.789",
    });

    await expect(
      signals.deleteExpired(new Date("2026-07-12T21:00:00.000Z")),
    ).resolves.toBe(2);
    await expect(
      signals.getActiveHuddle(
        owner,
        new Date("2026-07-12T21:00:00.000Z"),
      ),
    ).resolves.toBeNull();
    await expect(
      signals.getActiveContext(
        owner,
        new Date("2026-07-12T21:00:00.000Z"),
      ),
    ).resolves.toBeNull();

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [
      owner.workspaceId,
    ]);
  });

  it("enforces active-context shape at the repository boundary", async () => {
    const owner = {
      workspaceId: `T-${randomUUID()}`,
      userId: "U-owner",
    };

    await expect(
      signals.saveActiveContext({
        ...owner,
        entityType: "message",
        channelId: "C123",
        messageTs: null,
        observedAt: new Date("2026-07-12T20:00:00.000Z"),
        expiresAt: new Date("2026-07-12T20:15:00.000Z"),
      }),
    ).rejects.toThrow("requires a message timestamp");
  });
});
