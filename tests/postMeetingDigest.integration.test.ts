import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresMeetingRepository } from "../src/storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresPostMeetingDigestRepository } from "../src/storage/postgresPostMeetingDigestRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("post-meeting digest persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const meetings = new PostgresMeetingRepository(pool);
  const digests = new PostgresPostMeetingDigestRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("queues one owner-only digest, supports snooze, and honors global opt-out", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const now = new Date("2026-07-12T20:00:00.000Z");
    const meeting = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `event-${randomUUID()}`,
      title: "Workflow Migration Review",
      startsAt: new Date("2026-07-12T18:00:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: [],
      confidence: "high",
    });
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D-owner",
      sourceMessageTs: "123.456",
      rawText: "check who owns rollout flags",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: raw.id,
      meetingId: meeting.id,
      contextConfidence: "high",
      contextSource: "google_calendar",
    });
    await notes.saveDerived(owner, raw.id, {
      organizedText: "Verify rollout flag ownership.",
      noteType: "action",
      priority: "high",
      status: "open",
      displayMode: "organized",
      contextConfidence: "high",
      reminderIntent: "tomorrow morning",
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority", "reminderIntent"],
      uncertainties: [],
      transformationVersion: "margin-note-v1",
    });

    await expect(digests.prepareDue(now)).resolves.toBe(1);
    await expect(digests.prepareDue(now)).resolves.toBe(0);

    const claimed = await digests.claimDue(now);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      workspaceId,
      userId: "U-owner",
      meetingId: meeting.id,
      meetingTitle: "Workflow Migration Review",
      status: "processing",
    });

    const digest = claimed[0];
    if (!digest) {
      throw new Error("Expected a claimed digest");
    }
    const content = await digests.getContent(owner, digest.id);
    expect(content?.notes).toEqual([
      expect.objectContaining({
        id: raw.id,
        noteType: "action",
        status: "open",
        text: "Verify rollout flag ownership.",
        rawText: "check who owns rollout flags",
        reminderIntent: "tomorrow morning",
      }),
    ]);
    await expect(
      digests.getContent(
        { workspaceId, userId: "U-other" },
        digest.id,
      ),
    ).resolves.toBeNull();

    await digests.markDelivered(
      owner,
      digest.id,
      { channelId: "D-owner", messageTs: "999.000" },
      now,
    );
    const snoozedUntil = new Date("2026-07-12T21:00:00.000Z");
    const snoozed = await digests.snooze(owner, digest.id, snoozedUntil);
    expect(snoozed).toMatchObject({
      status: "snoozed",
      slackChannelId: "D-owner",
      slackMessageTs: "999.000",
    });
    expect(snoozed.snoozedUntil).toEqual(snoozedUntil);

    await digests.setDigestsEnabled(owner, false);
    await expect(digests.areDigestsEnabled(owner)).resolves.toBe(false);
    await expect(digests.claimDue(snoozedUntil)).resolves.toEqual([]);

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
    await pool.query(
      "DELETE FROM user_notification_preferences WHERE workspace_id = $1",
      [workspaceId],
    );
  });

  it("does not queue an empty meeting", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    await meetings.save({
      ...owner,
      provider: "explicit",
      providerEventId: null,
      title: "Meeting without captured notes",
      startsAt: new Date("2026-07-12T18:00:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: [],
      confidence: "exact",
    });

    await expect(
      digests.prepareDue(new Date("2026-07-12T20:00:00.000Z")),
    ).resolves.toBe(0);

    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
  });
});
