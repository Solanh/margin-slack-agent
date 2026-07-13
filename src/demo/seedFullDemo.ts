import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describeError } from "../observability/safeLogger.js";
import { PostgresContextCandidateRepository } from "../storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "../storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../storage/postgresNoteRepository.js";
import { PostgresPostMeetingDigestRepository } from "../storage/postgresPostMeetingDigestRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "../storage/postgresPreMeetingResurfacingRepository.js";
import { loadDemoOwnerEnvironment } from "./demoEnvironment.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const demo = loadDemoOwnerEnvironment();
const owner = { workspaceId: demo.workspaceId, userId: demo.userId };
const pool = new Pool({ connectionString: databaseUrl });
const meetings = new PostgresMeetingRepository(pool);
const notes = new PostgresNoteRepository(pool);
const candidates = new PostgresContextCandidateRepository(pool, notes);
const digests = new PostgresPostMeetingDigestRepository(pool);
const resurfacings = new PostgresPreMeetingResurfacingRepository(pool);
const seriesKey = "google:margin-demo-planning@example.invalid";

async function main(): Promise<void> {
  await requireEmptyOwner();

  const now = new Date();
  const clearMeeting = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-current-workflow-review",
    title: "Workflow Migration Review",
    startsAt: minutesFrom(now, -10),
    endsAt: minutesFrom(now, 20),
    participants: [],
    confidence: "high",
  });
  const ambiguousCalendarMeeting = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-overlap-calendar",
    title: "Launch Readiness",
    startsAt: minutesFrom(now, -5),
    endsAt: minutesFrom(now, 25),
    participants: [],
    confidence: "medium",
  });
  const ambiguousHuddleMeeting = await meetings.save({
    ...owner,
    provider: "slack_huddle",
    providerEventId: "margin-demo-overlap-huddle",
    title: "Slack huddle (title unavailable)",
    startsAt: minutesFrom(now, -4),
    endsAt: minutesFrom(now, 26),
    participants: [],
    confidence: "medium",
  });
  const completedMeeting = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-completed-launch-review",
    title: "Launch Review",
    startsAt: minutesFrom(now, -50),
    endsAt: minutesFrom(now, -15),
    participants: [],
    confidence: "high",
  });
  const priorRecurringMeeting = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-planning-prior",
    seriesKey,
    title: "Planning",
    startsAt: daysFrom(now, -7),
    endsAt: minutesFrom(daysFrom(now, -7), 30),
    participants: [],
    confidence: "high",
  });
  const upcomingRecurringMeeting = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-planning-upcoming",
    seriesKey,
    title: "Planning",
    startsAt: minutesFrom(now, 12),
    endsAt: minutesFrom(now, 42),
    participants: [],
    confidence: "high",
  });

  const clearNote = await seedNote({
    sourceMessageTs: "margin-demo-clear-context",
    rawText:
      "important ask if migration also affects customer-created workflows",
    organizedText: "Does migration affect customer-created workflows?",
    noteType: "question",
    priority: "high",
    status: "open",
    meetingId: clearMeeting.id,
  });

  const ambiguousRaw = await notes.createRaw({
    ...owner,
    sourceChannelId: demo.sourceChannelId,
    sourceMessageTs: "margin-demo-ambiguous-context",
    rawText: "check whether legal approved the rollout",
  });
  const calendarCandidateId = randomUUID();
  const huddleCandidateId = randomUUID();
  await candidates.persistResolution({
    ...owner,
    noteId: ambiguousRaw.id,
    resolutionStatus: "needs_clarification",
    selectedCandidateId: null,
    candidates: [
      {
        id: calendarCandidateId,
        meetingId: ambiguousCalendarMeeting.id,
        source: "google_calendar",
        score: 82,
        confidence: "medium",
        signals: { overlapsCapture: true, primaryCalendar: true },
      },
      {
        id: huddleCandidateId,
        meetingId: ambiguousHuddleMeeting.id,
        source: "slack_huddle",
        score: 78,
        confidence: "medium",
        signals: { activeHuddle: true, titleUnavailable: true },
      },
      {
        id: randomUUID(),
        meetingId: null,
        source: "standalone",
        score: 0,
        confidence: "unresolved",
        signals: {},
      },
    ],
  });
  await notes.saveDerived(owner, ambiguousRaw.id, {
    organizedText: "Has Legal approved the rollout?",
    noteType: "question",
    priority: "normal",
    status: "open",
    displayMode: "organized",
    contextConfidence: "unresolved",
    reminderIntent: null,
    explicitDueAt: null,
    inferredFields: ["organizedText", "noteType"],
    uncertainties: ["Meeting context needs confirmation."],
    transformationVersion: "margin-note-v1",
  });

  await seedNote({
    sourceMessageTs: "margin-demo-digest-decision",
    rawText: "decision staged rollout starting with internal teams",
    organizedText: "Use a staged rollout beginning with internal teams.",
    noteType: "decision",
    priority: "normal",
    status: "resolved",
    meetingId: completedMeeting.id,
  });
  await seedNote({
    sourceMessageTs: "margin-demo-digest-action",
    rawText: "maya owns the rollout flags",
    organizedText: "Maya owns the rollout flags.",
    noteType: "action",
    priority: "high",
    status: "open",
    meetingId: completedMeeting.id,
  });
  await seedNote({
    sourceMessageTs: "margin-demo-digest-question",
    rawText: "confirm enterprise migration window",
    organizedText: "What is the enterprise migration window?",
    noteType: "question",
    priority: "normal",
    status: "open",
    meetingId: completedMeeting.id,
  });

  await seedNote({
    sourceMessageTs: "margin-demo-resurfacing-action",
    rawText: "check who owns the rollout flags",
    organizedText: "Verify rollout flag ownership.",
    noteType: "action",
    priority: "high",
    status: "open",
    meetingId: priorRecurringMeeting.id,
  });
  await seedNote({
    sourceMessageTs: "margin-demo-resurfacing-question",
    rawText: "ask whether migration affects customer-created workflows",
    organizedText: "Does migration affect customer-created workflows?",
    noteType: "question",
    priority: "normal",
    status: "open",
    meetingId: priorRecurringMeeting.id,
  });

  await seedNote({
    sourceMessageTs: "margin-demo-retrieval-idea",
    rawText: "try an opt in beta for workflow owners",
    organizedText: "Offer workflow owners an opt-in beta.",
    noteType: "idea",
    priority: "low",
    status: "open",
  });
  await seedNote({
    sourceMessageTs: "margin-demo-retrieval-reference",
    rawText: "workflow api docs are in the migration folder",
    organizedText: "Workflow API documentation is in the migration folder.",
    noteType: "reference",
    priority: "normal",
    status: "archived",
  });

  await digests.setDigestsEnabled(owner, true);
  const digestId = randomUUID();
  await pool.query(
    `INSERT INTO post_meeting_digests (
       id, meeting_id, workspace_id, user_id, status, scheduled_for
     ) VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [digestId, completedMeeting.id, owner.workspaceId, owner.userId, now],
  );

  await resurfacings.setResurfacingEnabled(owner, true);
  await resurfacings.setSeriesEnabled(owner, seriesKey, true);
  const resurfacingPrepared = await resurfacings.prepareForUpcoming({
    ...owner,
    upcomingMeetingId: upcomingRecurringMeeting.id,
    seriesKey,
    scheduledFor: now,
  });

  console.log(
    JSON.stringify(
      {
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        sourceChannelId: demo.sourceChannelId,
        clearNoteId: clearNote.id,
        ambiguousNoteId: ambiguousRaw.id,
        ambiguousCandidateIds: [calendarCandidateId, huddleCandidateId],
        digestId,
        resurfacingPrepared,
        upcomingMeetingStartsAt: upcomingRecurringMeeting.startsAt.toISOString(),
        retrievalExamples: [
          "What did I note about customer workflows?",
          "Show unresolved high priority actions",
          "Find notes about workflow owners",
        ],
        instruction:
          "Start Margin for this installed workspace/user. The digest and resurfacing jobs are due immediately; seeded capture and ambiguity cards can be opened through the database-backed demo flow.",
      },
      null,
      2,
    ),
  );
}

async function requireEmptyOwner(): Promise<void> {
  const result = await pool.query<{
    note_count: string;
    meeting_count: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM notes WHERE workspace_id = $1 AND user_id = $2)::text AS note_count,
       (SELECT COUNT(*) FROM meetings WHERE workspace_id = $1 AND user_id = $2)::text AS meeting_count`,
    [owner.workspaceId, owner.userId],
  );
  const row = result.rows[0];
  if (row && (Number(row.note_count) > 0 || Number(row.meeting_count) > 0)) {
    throw new Error(
      "Demo owner already contains notes or meetings. Run npm run demo:reset with the required confirmation first.",
    );
  }
}

async function seedNote(input: {
  sourceMessageTs: string;
  rawText: string;
  organizedText: string;
  noteType: "decision" | "action" | "question" | "idea" | "reference";
  priority: "low" | "normal" | "high" | "critical";
  status: "open" | "resolved" | "archived";
  meetingId?: string;
}): Promise<{ id: string }> {
  const raw = await notes.createRaw({
    ...owner,
    sourceChannelId: demo.sourceChannelId,
    sourceMessageTs: input.sourceMessageTs,
    rawText: input.rawText,
  });
  if (input.meetingId) {
    await notes.setMeetingContext({
      ...owner,
      noteId: raw.id,
      meetingId: input.meetingId,
      contextConfidence: "high",
      contextSource: "google_calendar",
    });
  }
  await notes.saveDerived(owner, raw.id, {
    organizedText: input.organizedText,
    noteType: input.noteType,
    priority: input.priority,
    status: input.status,
    displayMode: "organized",
    contextConfidence: input.meetingId ? "high" : "unresolved",
    reminderIntent: null,
    explicitDueAt: null,
    inferredFields: ["organizedText", "noteType", "priority"],
    uncertainties: [],
    transformationVersion: "margin-note-v1",
  });
  return raw;
}

function minutesFrom(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function daysFrom(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

main()
  .catch((error: unknown) => {
    console.error("Unable to seed full Margin demo", describeError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
