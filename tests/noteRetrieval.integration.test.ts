import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { OwnerScope } from "../src/domain/note.js";
import type { NoteRetrievalRequest } from "../src/domain/retrieval.js";
import { PostgresMeetingRepository } from "../src/storage/postgresMeetingRepository.js";
import { PostgresNoteRepository } from "../src/storage/postgresNoteRepository.js";
import { PostgresNoteRetrievalRepository } from "../src/storage/postgresNoteRetrievalRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

const baseRequest: NoteRetrievalRequest = {
  originalText: "Find notes",
  searchText: null,
  noteTypes: [],
  priorities: [],
  status: "any",
  limit: 8,
};

describeDatabase("private note retrieval persistence", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const notes = new PostgresNoteRepository(pool);
  const meetings = new PostgresMeetingRepository(pool);
  const retrieval = new PostgresNoteRetrievalRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("searches topic, meeting, person, and filters without crossing owners", async () => {
    const suffix = randomUUID();
    const workspaceA = `T-retrieval-a-${suffix}`;
    const workspaceB = `T-retrieval-b-${suffix}`;
    const ownerA = { workspaceId: workspaceA, userId: "U-owner" };
    const otherUser = { workspaceId: workspaceA, userId: "U-other" };
    const otherWorkspace = { workspaceId: workspaceB, userId: "U-owner" };

    const meeting = await meetings.save({
      ...ownerA,
      provider: "google_calendar",
      providerEventId: `event-${suffix}`,
      title: "Workflow Migration Review",
      startsAt: new Date("2026-07-12T18:00:00.000Z"),
      endsAt: new Date("2026-07-12T18:30:00.000Z"),
      participants: ["maya@example.com"],
      confidence: "exact",
      seriesKey: `google:series-${suffix}`,
    });

    const action = await createNote(ownerA, {
      sourceMessageTs: `1-${suffix}`,
      rawText: "Maya should confirm whether migration affects customer workflows",
      organizedText: "Ask Maya whether migration affects customer workflows.",
      noteType: "action",
      priority: "high",
      status: "open",
      uncertainties: ["The affected workflow categories are unresolved."],
    });
    await notes.setMeetingContext({
      ...ownerA,
      noteId: action.id,
      meetingId: meeting.id,
      contextConfidence: "exact",
      contextSource: "google_calendar",
    });

    await createNote(ownerA, {
      sourceMessageTs: `2-${suffix}`,
      rawText: "The legacy migration question is complete",
      organizedText: "Migration compatibility was confirmed.",
      noteType: "question",
      priority: "normal",
      status: "resolved",
      uncertainties: [],
    });

    await createNote(otherUser, {
      sourceMessageTs: `3-${suffix}`,
      rawText: "Maya has another private customer workflow note",
      organizedText: "Other user's private Maya note.",
      noteType: "action",
      priority: "high",
      status: "open",
      uncertainties: [],
    });

    await createNote(otherWorkspace, {
      sourceMessageTs: `4-${suffix}`,
      rawText: "Maya has a note in a different workspace",
      organizedText: "Different workspace Maya note.",
      noteType: "action",
      priority: "high",
      status: "open",
      uncertainties: [],
    });

    const byPerson = await retrieval.search(ownerA, {
      ...baseRequest,
      searchText: "maya",
    });
    expect(byPerson.map((note) => note.id)).toEqual([action.id]);
    expect(byPerson[0]).toMatchObject({
      organizedText: "Ask Maya whether migration affects customer workflows.",
      meetingTitle: "Workflow Migration Review",
      noteType: "action",
      priority: "high",
      status: "open",
    });

    const byMeeting = await retrieval.search(ownerA, {
      ...baseRequest,
      searchText: "workflow migration review",
    });
    expect(byMeeting.map((note) => note.id)).toEqual([action.id]);

    const filtered = await retrieval.search(ownerA, {
      ...baseRequest,
      noteTypes: ["action"],
      priorities: ["high"],
      status: "unresolved",
    });
    expect(filtered.map((note) => note.id)).toEqual([action.id]);

    await expect(
      retrieval.search(otherUser, {
        ...baseRequest,
        searchText: "customer workflows",
      }),
    ).resolves.toEqual([]);
    await expect(
      retrieval.search(otherWorkspace, {
        ...baseRequest,
        searchText: "customer workflows",
      }),
    ).resolves.toEqual([]);

    await expect(retrieval.getOriginal(ownerA, action.id)).resolves.toMatchObject({
      rawText:
        "Maya should confirm whether migration affects customer workflows",
      meetingTitle: "Workflow Migration Review",
    });
    await expect(
      retrieval.getOriginal(otherUser, action.id),
    ).resolves.toBeNull();
    await expect(
      retrieval.getOriginal(otherWorkspace, action.id),
    ).resolves.toBeNull();

    await pool.query(
      "DELETE FROM notes WHERE workspace_id = ANY($1::text[])",
      [[workspaceA, workspaceB]],
    );
    await pool.query(
      "DELETE FROM meetings WHERE workspace_id = ANY($1::text[])",
      [[workspaceA, workspaceB]],
    );
  });

  async function createNote(
    owner: OwnerScope,
    input: {
      sourceMessageTs: string;
      rawText: string;
      organizedText: string;
      noteType: "decision" | "action" | "question" | "idea" | "reference";
      priority: "low" | "normal" | "high" | "critical";
      status: "open" | "resolved" | "archived";
      uncertainties: string[];
    },
  ) {
    const raw = await notes.createRaw({
      ...owner,
      sourceChannelId: "D-retrieval",
      sourceMessageTs: input.sourceMessageTs,
      rawText: input.rawText,
    });

    return notes.saveDerived(owner, raw.id, {
      organizedText: input.organizedText,
      noteType: input.noteType,
      priority: input.priority,
      status: input.status,
      displayMode: "organized",
      contextConfidence: "unresolved",
      reminderIntent: null,
      explicitDueAt: null,
      inferredFields: ["organizedText", "noteType", "priority"],
      uncertainties: input.uncertainties,
      transformationVersion: "retrieval-test-v1",
    });
  }
});
