import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresMeetingRepository } from "../src/storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "../src/storage/postgresPreMeetingResurfacingRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("pre-meeting resurfacing persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const meetings = new PostgresMeetingRepository(pool);
  const notes = new PostgresNoteRepository(pool);
  const resurfacings = new PostgresPreMeetingResurfacingRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("matches the latest prior verified series, prevents duplicates, and enforces opt-outs", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const seriesKey = `google:planning-${randomUUID()}@example.com`;
    const older = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `old-${randomUUID()}`,
      seriesKey,
      title: "Planning old",
      startsAt: new Date("2026-06-28T18:00:00.000Z"),
      endsAt: new Date("2026-06-28T18:30:00.000Z"),
      participants: [],
      confidence: "high",
    });
    const prior = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `prior-${randomUUID()}`,
      seriesKey,
      title: "Planning previous",
      startsAt: new Date("2026-07-05T18:00:00.000Z"),
      endsAt: new Date("2026-07-05T18:30:00.000Z"),
      participants: [],
      confidence: "high",
    });
    const upcoming = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `upcoming-${randomUUID()}`,
      seriesKey,
      title: "Planning next",
      startsAt: new Date("2026-07-12T19:00:00.000Z"),
      endsAt: new Date("2026-07-12T19:30:00.000Z"),
      participants: [],
      confidence: "high",
    });

    const oldRaw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D-owner",
      sourceMessageTs: `old-${randomUUID()}`,
      rawText: "old question",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: oldRaw.id,
      meetingId: older.id,
      contextConfidence: "high",
      contextSource: "google_calendar",
    });
    await notes.saveDerived(owner, oldRaw.id, {
      organizedText: "Old question should not appear when a newer prior meeting exists.",
      noteType: "question",
      priority: "normal",
      status: "open",
      displayMode: "organized",
      contextConfidence: "high",
      reminderIntent: null,
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority"],
      uncertainties: [],
      transformationVersion: "margin-note-v1",
    });

    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D-owner",
      sourceMessageTs: `new-${randomUUID()}`,
      rawText: "check rollout flag owner",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: raw.id,
      meetingId: prior.id,
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
      reminderIntent: "before planning",
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority", "reminderIntent"],
      uncertainties: [],
      transformationVersion: "margin-note-v1",
    });

    const scheduledFor = new Date("2026-07-12T18:50:00.000Z");
    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcoming.id,
        seriesKey,
        scheduledFor,
      }),
    ).resolves.toBe(true);
    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcoming.id,
        seriesKey,
        scheduledFor,
      }),
    ).resolves.toBe(false);

    const claimed = await resurfacings.claimDue(scheduledFor);
    expect(claimed).toHaveLength(1);
    const resurfacing = claimed[0];
    if (!resurfacing) {
      throw new Error("Expected a claimed resurfacing");
    }
    expect(resurfacing).toMatchObject({
      upcomingMeetingId: upcoming.id,
      seriesKey,
      upcomingMeetingTitle: "Planning next",
    });

    const content = await resurfacings.getContent(owner, resurfacing.id);
    expect(content?.notes).toEqual([
      expect.objectContaining({
        id: raw.id,
        priorMeetingId: prior.id,
        priorMeetingTitle: "Planning previous",
        noteType: "action",
        status: "open",
        text: "Verify rollout flag ownership.",
      }),
    ]);
    await expect(
      resurfacings.getContent(
        { workspaceId, userId: "U-other" },
        resurfacing.id,
      ),
    ).resolves.toBeNull();

    await resurfacings.markDelivered(
      owner,
      resurfacing.id,
      { channelId: "D-owner", messageTs: "999.000" },
      scheduledFor,
    );
    const snoozedUntil = new Date("2026-07-12T18:55:00.000Z");
    await expect(
      resurfacings.snooze(owner, resurfacing.id, snoozedUntil),
    ).resolves.toMatchObject({
      status: "snoozed",
      slackChannelId: "D-owner",
      slackMessageTs: "999.000",
      snoozedUntil,
    });

    await expect(
      resurfacings.markIncludedNotesResolved(owner, resurfacing.id),
    ).resolves.toBe(1);
    await expect(
      resurfacings.getContent(owner, resurfacing.id),
    ).resolves.toMatchObject({ notes: [] });

    const newRaw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D-owner",
      sourceMessageTs: `later-${randomUUID()}`,
      rawText: "ask about customer workflows",
    });
    await notes.setMeetingContext({
      ...owner,
      noteId: newRaw.id,
      meetingId: prior.id,
      contextConfidence: "high",
      contextSource: "google_calendar",
    });
    await notes.saveDerived(owner, newRaw.id, {
      organizedText: "Does migration affect customer workflows?",
      noteType: "question",
      priority: "normal",
      status: "open",
      displayMode: "organized",
      contextConfidence: "high",
      reminderIntent: null,
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority"],
      uncertainties: [],
      transformationVersion: "margin-note-v1",
    });
    const upcomingTwo = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `upcoming-two-${randomUUID()}`,
      seriesKey,
      title: "Planning after next",
      startsAt: new Date("2026-07-19T19:00:00.000Z"),
      endsAt: new Date("2026-07-19T19:30:00.000Z"),
      participants: [],
      confidence: "high",
    });

    await resurfacings.setSeriesEnabled(owner, seriesKey, false);
    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcomingTwo.id,
        seriesKey,
        scheduledFor: new Date("2026-07-19T18:50:00.000Z"),
      }),
    ).resolves.toBe(false);

    await resurfacings.setSeriesEnabled(owner, seriesKey, true);
    await resurfacings.setResurfacingEnabled(owner, false);
    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcomingTwo.id,
        seriesKey,
        scheduledFor: new Date("2026-07-19T18:50:00.000Z"),
      }),
    ).resolves.toBe(false);

    await resurfacings.setResurfacingEnabled(owner, true);
    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcomingTwo.id,
        seriesKey,
        scheduledFor: new Date("2026-07-19T18:50:00.000Z"),
      }),
    ).resolves.toBe(true);

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
    await pool.query(
      "DELETE FROM meeting_series_preferences WHERE workspace_id = $1",
      [workspaceId],
    );
    await pool.query(
      "DELETE FROM user_notification_preferences WHERE workspace_id = $1",
      [workspaceId],
    );
  });

  it("does not prepare a future event without a matching unresolved prior series", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const upcoming = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `unmatched-${randomUUID()}`,
      seriesKey: `google:unmatched-${randomUUID()}@example.com`,
      title: "Unmatched meeting",
      startsAt: new Date("2026-07-12T19:00:00.000Z"),
      endsAt: new Date("2026-07-12T19:30:00.000Z"),
      participants: [],
      confidence: "high",
    });

    await expect(
      resurfacings.prepareForUpcoming({
        ...owner,
        upcomingMeetingId: upcoming.id,
        seriesKey: `google:unmatched-${randomUUID()}@example.com`,
        scheduledFor: new Date("2026-07-12T18:50:00.000Z"),
      }),
    ).resolves.toBe(false);

    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
  });
});
