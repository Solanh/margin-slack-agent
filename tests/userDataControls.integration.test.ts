import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresMeetingRepository } from "../src/storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresUserDataRepository } from "../src/storage/postgresUserDataRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("user data controls", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const meetings = new PostgresMeetingRepository(pool);
  const userData = new PostgresUserDataRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("exports complete owner data without credential ciphertext or another owner", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const other = { workspaceId, userId: "U-other" };
    const meeting = await meetings.save({
      ...owner,
      provider: "explicit",
      providerEventId: null,
      seriesKey: null,
      title: "Private planning",
      startsAt: new Date("2026-07-12T18:00:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: [],
      confidence: "exact",
    });
    const note = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "owner private note",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: note.id,
      meetingId: meeting.id,
      contextConfidence: "exact",
      contextSource: "explicit",
    });
    await notes.saveDerived(owner, note.id, {
      organizedText: "Owner private note.",
      noteType: "reference",
      priority: "normal",
      status: "open",
      displayMode: "organized",
      contextConfidence: "exact",
      reminderIntent: null,
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority"],
      uncertainties: [],
      transformationVersion: "margin-note-v1",
    });
    await notes.createRaw({
      ...other,
      sourceChannelId: "D999",
      sourceMessageTs: "999.000",
      rawText: "other user secret",
    });
    await userData.setRetentionDays(owner, 90);
    await pool.query(
      `
        INSERT INTO oauth_connections (
          id,
          workspace_id,
          user_id,
          provider,
          access_token_ciphertext,
          refresh_token_ciphertext,
          scopes,
          expires_at,
          encryption_key_version
        )
        VALUES ($1, $2, $3, 'google_calendar', $4, $5, $6, $7, 1)
      `,
      [
        randomUUID(),
        owner.workspaceId,
        owner.userId,
        "access-secret-ciphertext",
        "refresh-secret-ciphertext",
        ["calendar.events.readonly"],
        new Date("2026-08-01T00:00:00.000Z"),
      ],
    );

    const exported = await userData.exportData(
      owner,
      new Date("2026-07-12T20:00:00.000Z"),
    );
    const serialized = JSON.stringify(exported);

    expect(exported.schemaVersion).toBe(1);
    expect(exported.settings.retentionDays).toBe(90);
    expect(exported.notes).toHaveLength(1);
    expect(serialized).toContain("owner private note");
    expect(serialized).toContain("Private planning");
    expect(serialized).not.toContain("other user secret");
    expect(serialized).not.toContain("access-secret-ciphertext");
    expect(serialized).not.toContain("refresh-secret-ciphertext");
    expect(exported.integrations).toEqual([
      expect.objectContaining({
        provider: "google_calendar",
        scopes: ["calendar.events.readonly"],
      }),
    ]);

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM oauth_connections WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM user_notification_preferences WHERE workspace_id = $1", [workspaceId]);
  });

  it("deletes one owner's data transactionally without affecting another owner", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const other = { workspaceId, userId: "U-other" };
    await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "111.111",
      rawText: "delete me",
    });
    const otherNote = await notes.createRaw({
      ...other,
      sourceChannelId: "D999",
      sourceMessageTs: "222.222",
      rawText: "preserve me",
    });
    await userData.setNotificationsEnabled(owner, false);
    await userData.setRetentionDays(owner, 30);

    const result = await userData.deleteAllData(owner);
    expect(result.deletedRows).toBeGreaterThan(0);

    const ownerCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM notes WHERE workspace_id = $1 AND user_id = $2",
      [owner.workspaceId, owner.userId],
    );
    expect(ownerCount.rows[0]?.count).toBe("0");
    await expect(notes.getById(other, otherNote.id)).resolves.toMatchObject({
      rawText: "preserve me",
    });

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });

  it("deletes only data older than the configured retention cutoff", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const cleanupNow = new Date(Date.now() + 60_000);
    const oldStartsAt = new Date(
      cleanupNow.getTime() - 60 * 24 * 60 * 60 * 1000,
    );
    const recentCreatedAt = new Date(
      cleanupNow.getTime() - 2 * 24 * 60 * 60 * 1000,
    );
    const oldMeeting = await meetings.save({
      ...owner,
      provider: "explicit",
      providerEventId: null,
      seriesKey: null,
      title: "Old meeting",
      startsAt: oldStartsAt,
      endsAt: new Date(oldStartsAt.getTime() + 30 * 60 * 1000),
      participants: [],
      confidence: "exact",
    });
    const oldNote = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "old.001",
      rawText: "old note",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: oldNote.id,
      meetingId: oldMeeting.id,
      contextConfidence: "exact",
      contextSource: "explicit",
    });
    const recentNote = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "new.001",
      rawText: "recent note",
    });
    await pool.query(
      "UPDATE notes SET created_at = $2 WHERE id = $1",
      [oldNote.id, oldStartsAt],
    );
    await pool.query(
      "UPDATE notes SET created_at = $2 WHERE id = $1",
      [recentNote.id, recentCreatedAt],
    );
    await userData.setRetentionDays(owner, 30);

    const jobs = await userData.claimRetentionJobs(cleanupNow, 10);
    expect(jobs).toEqual([
      expect.objectContaining({ ...owner, retentionDays: 30 }),
    ]);
    const cleanup = await userData.applyRetention(jobs[0]!, cleanupNow);

    expect(cleanup).toEqual({ deletedNotes: 1, deletedMeetings: 1 });
    await expect(notes.getById(owner, oldNote.id)).resolves.toBeNull();
    await expect(notes.getById(owner, recentNote.id)).resolves.toMatchObject({
      rawText: "recent note",
    });

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM user_notification_preferences WHERE workspace_id = $1", [workspaceId]);
  });
});
