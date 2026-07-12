import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresContextCandidateRepository } from "../src/storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "../src/storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("context candidate persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const meetings = new PostgresMeetingRepository(pool);
  const candidates = new PostgresContextCandidateRepository(pool, notes);

  afterAll(async () => {
    await pool.end();
  });

  it("stores ambiguity and applies one-tap explicit selection atomically", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "ask about migration",
    });
    const first = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `event-${randomUUID()}`,
      title: "Architecture sync",
      startsAt: new Date("2026-07-12T17:45:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: [],
      confidence: "high",
    });
    const second = await meetings.save({
      ...owner,
      provider: "google_calendar",
      providerEventId: `event-${randomUUID()}`,
      title: "Customer escalation",
      startsAt: new Date("2026-07-12T17:50:00.000Z"),
      endsAt: new Date("2026-07-12T18:15:00.000Z"),
      participants: [],
      confidence: "high",
    });
    const firstCandidateId = randomUUID();
    const secondCandidateId = randomUUID();
    const standaloneId = randomUUID();

    const ambiguous = await candidates.persistResolution({
      ...owner,
      noteId: raw.id,
      resolutionStatus: "needs_clarification",
      selectedCandidateId: null,
      candidates: [
        {
          id: firstCandidateId,
          meetingId: first.id,
          source: "google_calendar",
          score: 90,
          confidence: "high",
          signals: { temporalRelation: "active" },
        },
        {
          id: secondCandidateId,
          meetingId: second.id,
          source: "google_calendar",
          score: 87,
          confidence: "high",
          signals: { temporalRelation: "active" },
        },
        {
          id: standaloneId,
          meetingId: null,
          source: "standalone",
          score: 0,
          confidence: "unresolved",
          signals: { alwaysAvailable: true },
        },
      ],
    });

    expect(ambiguous).toMatchObject({
      meetingId: null,
      contextSource: "standalone",
      contextConfidence: "unresolved",
      contextResolutionStatus: "needs_clarification",
    });
    expect(await candidates.listForNote(owner, raw.id)).toHaveLength(3);

    const selected = await candidates.selectCandidate(
      owner,
      raw.id,
      firstCandidateId,
    );
    expect(selected).toMatchObject({
      meetingId: first.id,
      contextSource: "explicit",
      contextConfidence: "exact",
      contextResolutionStatus: "attached",
    });
    const selectedRows = await candidates.listForNote(owner, raw.id);
    expect(
      selectedRows.filter((candidate) => candidate.selected).map((candidate) => candidate.id),
    ).toEqual([firstCandidateId]);

    const standalone = await candidates.selectCandidate(
      owner,
      raw.id,
      standaloneId,
    );
    expect(standalone).toMatchObject({
      meetingId: null,
      contextSource: "standalone",
      contextConfidence: "unresolved",
      contextResolutionStatus: "standalone",
    });

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
  });

  it("auto-attaches the selected provider candidate with scored confidence", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D123",
      sourceMessageTs: "456.789",
      rawText: "remember this",
    });
    const meeting = await meetings.save({
      ...owner,
      provider: "slack_huddle",
      providerEventId: `call-${randomUUID()}`,
      title: "Slack huddle (title unavailable)",
      startsAt: new Date("2026-07-12T17:55:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: [],
      confidence: "exact",
    });
    const meetingCandidateId = randomUUID();
    const standaloneId = randomUUID();

    const attached = await candidates.persistResolution({
      ...owner,
      noteId: raw.id,
      resolutionStatus: "attached",
      selectedCandidateId: meetingCandidateId,
      candidates: [
        {
          id: meetingCandidateId,
          meetingId: meeting.id,
          source: "slack_huddle",
          score: 95,
          confidence: "exact",
          signals: { directActiveHuddleState: true },
        },
        {
          id: standaloneId,
          meetingId: null,
          source: "standalone",
          score: 0,
          confidence: "unresolved",
          signals: { alwaysAvailable: true },
        },
      ],
    });

    expect(attached).toMatchObject({
      meetingId: meeting.id,
      contextSource: "slack_huddle",
      contextConfidence: "exact",
      contextResolutionStatus: "attached",
    });

    await expect(
      candidates.selectCandidate(
        { workspaceId, userId: "U-other" },
        raw.id,
        meetingCandidateId,
      ),
    ).rejects.toThrow("Owner-scoped note was not found");

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM meetings WHERE workspace_id = $1", [workspaceId]);
  });
});
