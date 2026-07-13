import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { Pool, type QueryResultRow } from "pg";
import { loadEnvironment } from "../config.js";
import { describeError } from "../observability/safeLogger.js";
import { GoogleCalendarApiService } from "../services/googleCalendarApi.js";
import { NoteCardService } from "../services/noteCard.js";
import { PostMeetingDigestService } from "../services/postMeetingDigest.js";
import { PreMeetingResurfacingService } from "../services/preMeetingResurfacing.js";
import {
  buildNoteCardBlocks,
  buildNoteCardFallbackText,
  type SlackBlock,
} from "../slack/views/noteCard.js";
import { PostgresContextCandidateRepository } from "../storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "../storage/postgresMeetingRepository.js";
import { PostgresNoteInteractionRepository } from "../storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "../storage/postgresNoteRepository.js";
import { PostgresPostMeetingDigestRepository } from "../storage/postgresPostMeetingDigestRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "../storage/postgresPreMeetingResurfacingRepository.js";
import { loadDemoOwnerEnvironment } from "./demoEnvironment.js";

interface NoteIdRow extends QueryResultRow {
  id: string;
}

const SEEDED_NOTE_SOURCES = [
  "margin-demo-clear-context",
  "margin-demo-ambiguous-context",
] as const;

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const demo = loadDemoOwnerEnvironment();
  const owner = { workspaceId: demo.workspaceId, userId: demo.userId };
  const pool = new Pool({ connectionString: environment.DATABASE_URL });
  const client = new WebClient(environment.SLACK_BOT_TOKEN);

  try {
    const authentication = await client.auth.test();
    if (authentication.team_id !== owner.workspaceId) {
      throw new Error("slack_workspace_mismatch");
    }

    const opened = await client.conversations.open({ users: owner.userId });
    const channelId = opened.channel?.id;
    if (!channelId?.startsWith("D")) {
      throw new Error("private_demo_channel_unavailable");
    }

    const userResult = await client.users.info({ user: owner.userId });
    const timeZone = userResult.user?.tz ?? "UTC";
    const meetings = new PostgresMeetingRepository(pool);
    const notes = new PostgresNoteRepository(pool);
    const interactions = new PostgresNoteInteractionRepository(pool, notes);
    const contextCandidates = new PostgresContextCandidateRepository(pool, notes);
    const cards = new NoteCardService(
      notes,
      interactions,
      meetings,
      contextCandidates,
    );

    const publishedCards: Array<{
      sourceMessageTs: string;
      noteId: string;
      channelId: string;
      messageTs: string;
      operation: "posted" | "updated";
    }> = [];

    for (const sourceMessageTs of SEEDED_NOTE_SOURCES) {
      const noteId = await findSeededNoteId(
        pool,
        owner.workspaceId,
        owner.userId,
        sourceMessageTs,
      );
      const data = await cards.getCardData(owner, noteId);
      const blocks: SlackBlock[] = [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: ":test_tube: *Seeded demo state* · Prepared for the hackathon walkthrough; not captured live.",
            },
          ],
        },
        ...buildNoteCardBlocks(data, timeZone),
      ];
      const text = `[Seeded demo state] ${buildNoteCardFallbackText(data)}`;

      if (data.note.cardChannelId && data.note.cardMessageTs) {
        await client.chat.update({
          channel: data.note.cardChannelId,
          ts: data.note.cardMessageTs,
          text,
          blocks: blocks as never,
        });
        publishedCards.push({
          sourceMessageTs,
          noteId,
          channelId: data.note.cardChannelId,
          messageTs: data.note.cardMessageTs,
          operation: "updated",
        });
        continue;
      }

      const posted = await client.chat.postMessage({
        channel: channelId,
        text,
        blocks: blocks as never,
      });
      if (!posted.ts) {
        throw new Error("seeded_note_message_timestamp_unavailable");
      }
      await cards.recordCardReference(owner, noteId, {
        channelId,
        messageTs: posted.ts,
      });
      publishedCards.push({
        sourceMessageTs,
        noteId,
        channelId,
        messageTs: posted.ts,
        operation: "posted",
      });
    }

    const digestService = new PostMeetingDigestService(
      new PostgresPostMeetingDigestRepository(pool),
      client,
    );
    const resurfacingService = new PreMeetingResurfacingService(
      new PostgresPreMeetingResurfacingRepository(pool),
      meetings,
      GoogleCalendarApiService.disabled(),
      client,
    );
    const now = new Date();
    const digest = await digestService.runOnce(now);
    const resurfacing = await resurfacingService.runOnce(now);

    console.log(
      JSON.stringify(
        {
          workspaceId: owner.workspaceId,
          userId: owner.userId,
          channelId,
          publishedCards,
          digest,
          resurfacing,
          disclosure:
            "Published note cards are visibly labeled as seeded. Capture a fresh note during recording whenever live context is available.",
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function findSeededNoteId(
  pool: Pool,
  workspaceId: string,
  userId: string,
  sourceMessageTs: string,
): Promise<string> {
  const result = await pool.query<NoteIdRow>(
    `SELECT id
     FROM notes
     WHERE workspace_id = $1
       AND user_id = $2
       AND source_message_ts = $3
     LIMIT 1`,
    [workspaceId, userId, sourceMessageTs],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`seeded_note_missing_${sourceMessageTs}`);
  }
  return id;
}

main().catch((error: unknown) => {
  console.error("Unable to publish Margin demo state", describeError(error));
  process.exitCode = 1;
});
