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
import {
  buildPostMeetingDigestBlocks,
  buildPostMeetingDigestFallback,
} from "../slack/views/postMeetingDigest.js";
import {
  buildPreMeetingResurfacingBlocks,
  buildPreMeetingResurfacingFallback,
} from "../slack/views/preMeetingResurfacing.js";
import { PostgresContextCandidateRepository } from "../storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "../storage/postgresMeetingRepository.js";
import { PostgresNoteInteractionRepository } from "../storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "../storage/postgresNoteRepository.js";
import { PostgresPostMeetingDigestRepository } from "../storage/postgresPostMeetingDigestRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "../storage/postgresPreMeetingResurfacingRepository.js";
import { loadDemoOwnerEnvironment } from "./demoEnvironment.js";

interface IdRow extends QueryResultRow {
  id: string;
}

const SEEDED_NOTE_SOURCES = [
  "margin-demo-clear-context",
  "margin-demo-ambiguous-context",
] as const;

const SEEDED_DISCLOSURE_BLOCK: SlackBlock = {
  type: "context",
  elements: [
    {
      type: "mrkdwn",
      text: ":test_tube: *Seeded demo state* · Prepared for the hackathon walkthrough; not captured live.",
    },
  ],
};

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

    await pool.query(
      `UPDATE notes
       SET source_channel_id = $3
       WHERE workspace_id = $1
         AND user_id = $2
         AND source_message_ts LIKE 'margin-demo-%'`,
      [owner.workspaceId, owner.userId, channelId],
    );

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
        SEEDED_DISCLOSURE_BLOCK,
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

    const digestRepository = new PostgresPostMeetingDigestRepository(pool);
    const resurfacingRepository = new PostgresPreMeetingResurfacingRepository(pool);
    const digestService = new PostMeetingDigestService(digestRepository, client);
    const resurfacingService = new PreMeetingResurfacingService(
      resurfacingRepository,
      meetings,
      GoogleCalendarApiService.disabled(),
      client,
    );
    const now = new Date();
    const digest = await digestService.runOnce(now);
    const resurfacing = await resurfacingService.runOnce(now);
    await labelSeededDigest(pool, client, digestRepository, owner);
    await labelSeededResurfacing(
      pool,
      client,
      resurfacingRepository,
      owner,
    );

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
            "All prepared Slack cards are visibly labeled as seeded. Capture a fresh note during recording whenever live context is available.",
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function labelSeededDigest(
  pool: Pool,
  client: WebClient,
  repository: PostgresPostMeetingDigestRepository,
  owner: { workspaceId: string; userId: string },
): Promise<void> {
  const id = await findDigestId(pool, owner.workspaceId, owner.userId);
  const content = await repository.getContent(owner, id);
  if (!content?.digest.slackChannelId || !content.digest.slackMessageTs) {
    throw new Error("seeded_digest_not_delivered");
  }
  await client.chat.update({
    channel: content.digest.slackChannelId,
    ts: content.digest.slackMessageTs,
    text: `[Seeded demo state] ${buildPostMeetingDigestFallback(content)}`,
    blocks: [
      SEEDED_DISCLOSURE_BLOCK,
      ...buildPostMeetingDigestBlocks(content),
    ] as never,
  });
}

async function labelSeededResurfacing(
  pool: Pool,
  client: WebClient,
  repository: PostgresPreMeetingResurfacingRepository,
  owner: { workspaceId: string; userId: string },
): Promise<void> {
  const id = await findResurfacingId(pool, owner.workspaceId, owner.userId);
  const content = await repository.getContent(owner, id);
  if (
    !content?.resurfacing.slackChannelId ||
    !content.resurfacing.slackMessageTs
  ) {
    throw new Error("seeded_resurfacing_not_delivered");
  }
  await client.chat.update({
    channel: content.resurfacing.slackChannelId,
    ts: content.resurfacing.slackMessageTs,
    text: `[Seeded demo state] ${buildPreMeetingResurfacingFallback(content)}`,
    blocks: [
      SEEDED_DISCLOSURE_BLOCK,
      ...buildPreMeetingResurfacingBlocks(content),
    ] as never,
  });
}

async function findSeededNoteId(
  pool: Pool,
  workspaceId: string,
  userId: string,
  sourceMessageTs: string,
): Promise<string> {
  return findId(
    pool,
    `SELECT id
     FROM notes
     WHERE workspace_id = $1
       AND user_id = $2
       AND source_message_ts = $3
     LIMIT 1`,
    [workspaceId, userId, sourceMessageTs],
    `seeded_note_missing_${sourceMessageTs}`,
  );
}

async function findDigestId(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<string> {
  return findId(
    pool,
    `SELECT d.id
     FROM post_meeting_digests d
     JOIN meetings m
       ON m.id = d.meeting_id
      AND m.workspace_id = d.workspace_id
      AND m.user_id = d.user_id
     WHERE d.workspace_id = $1
       AND d.user_id = $2
       AND m.provider_event_id = 'margin-demo-completed-launch-review'
     ORDER BY d.created_at DESC
     LIMIT 1`,
    [workspaceId, userId],
    "seeded_digest_missing",
  );
}

async function findResurfacingId(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<string> {
  return findId(
    pool,
    `SELECT r.id
     FROM pre_meeting_resurfacings r
     JOIN meetings m
       ON m.id = r.upcoming_meeting_id
      AND m.workspace_id = r.workspace_id
      AND m.user_id = r.user_id
     WHERE r.workspace_id = $1
       AND r.user_id = $2
       AND m.provider_event_id = 'margin-demo-planning-upcoming'
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [workspaceId, userId],
    "seeded_resurfacing_missing",
  );
}

async function findId(
  pool: Pool,
  sql: string,
  parameters: unknown[],
  missingCode: string,
): Promise<string> {
  const result = await pool.query<IdRow>(sql, parameters);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(missingCode);
  }
  return id;
}

main().catch((error: unknown) => {
  console.error("Unable to publish Margin demo state", describeError(error));
  process.exitCode = 1;
});
