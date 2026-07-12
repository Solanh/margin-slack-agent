import "dotenv/config";
import { Pool } from "pg";
import { PostgresMeetingRepository } from "../storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../storage/postgresNoteRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "../storage/postgresPreMeetingResurfacingRepository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const workspaceId = process.env.DEMO_WORKSPACE_ID ?? "T-MARGIN-DEMO";
const userId = process.env.DEMO_USER_ID ?? "U-MARGIN-DEMO";
const owner = { workspaceId, userId };
const pool = new Pool({ connectionString: databaseUrl });
const meetings = new PostgresMeetingRepository(pool);
const notes = new PostgresNoteRepository(pool);
const resurfacings = new PostgresPreMeetingResurfacingRepository(pool);
const seriesKey = "google:margin-demo-planning@example.invalid";

async function main(): Promise<void> {
  const now = new Date();
  const priorStartsAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const priorEndsAt = new Date(priorStartsAt.getTime() + 30 * 60 * 1000);
  const upcomingStartsAt = new Date(now.getTime() + 12 * 60 * 1000);
  const upcomingEndsAt = new Date(upcomingStartsAt.getTime() + 30 * 60 * 1000);

  const prior = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-planning-prior",
    seriesKey,
    title: "Planning",
    startsAt: priorStartsAt,
    endsAt: priorEndsAt,
    participants: [],
    confidence: "high",
  });
  const upcoming = await meetings.save({
    ...owner,
    provider: "google_calendar",
    providerEventId: "margin-demo-planning-upcoming",
    seriesKey,
    title: "Planning",
    startsAt: upcomingStartsAt,
    endsAt: upcomingEndsAt,
    participants: [],
    confidence: "high",
  });

  await seedNote({
    sourceMessageTs: "margin-demo-action",
    rawText: "check who owns the rollout flags",
    organizedText: "Verify rollout flag ownership.",
    noteType: "action",
    priority: "high",
    meetingId: prior.id,
  });
  await seedNote({
    sourceMessageTs: "margin-demo-question",
    rawText: "ask whether migration affects customer-created workflows",
    organizedText: "Does migration affect customer-created workflows?",
    noteType: "question",
    priority: "normal",
    meetingId: prior.id,
  });

  await resurfacings.setResurfacingEnabled(owner, true);
  await resurfacings.setSeriesEnabled(owner, seriesKey, true);
  await pool.query(
    `DELETE FROM pre_meeting_resurfacings
     WHERE upcoming_meeting_id = $1
       AND workspace_id = $2
       AND user_id = $3`,
    [upcoming.id, workspaceId, userId],
  );
  const prepared = await resurfacings.prepareForUpcoming({
    ...owner,
    upcomingMeetingId: upcoming.id,
    seriesKey,
    scheduledFor: now,
  });

  console.log(
    JSON.stringify(
      {
        prepared,
        workspaceId,
        userId,
        seriesKey,
        priorMeetingId: prior.id,
        upcomingMeetingId: upcoming.id,
        upcomingStartsAt: upcomingStartsAt.toISOString(),
        instruction:
          "Run the Margin app with DEMO_WORKSPACE_ID/DEMO_USER_ID set to a real installed workspace user to deliver the due private resurfacing.",
      },
      null,
      2,
    ),
  );
}

async function seedNote(input: {
  sourceMessageTs: string;
  rawText: string;
  organizedText: string;
  noteType: "action" | "question";
  priority: "normal" | "high";
  meetingId: string;
}): Promise<void> {
  const raw = await notes.createRaw({
    ...owner,
    sourceChannelId: "D-MARGIN-DEMO",
    sourceMessageTs: input.sourceMessageTs,
    rawText: input.rawText,
  });
  await notes.setMeetingContext({
    ...owner,
    noteId: raw.id,
    meetingId: input.meetingId,
    contextConfidence: "high",
    contextSource: "google_calendar",
  });
  await notes.saveDerived(owner, raw.id, {
    organizedText: input.organizedText,
    noteType: input.noteType,
    priority: input.priority,
    status: "open",
    displayMode: "organized",
    contextConfidence: "high",
    reminderIntent: null,
    explicitDueAt: null,
    inferredFields: ["organizedText", "noteType", "priority"],
    uncertainties: [],
    transformationVersion: "margin-note-v1",
  });
}

main()
  .catch((error: unknown) => {
    console.error("Unable to seed pre-meeting resurfacing demo", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
