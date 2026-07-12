import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type {
  DigestNoteItem,
  PostMeetingDigest,
  PostMeetingDigestContent,
  PostMeetingDigestRepository,
  PostMeetingDigestStatus,
  SlackMessageReference,
} from "./postMeetingDigestRepository.js";

interface EligibleMeetingRow extends QueryResultRow {
  meeting_id: string;
  workspace_id: string;
  user_id: string;
  ends_at: Date | string;
}

interface DigestRow extends QueryResultRow {
  id: string;
  meeting_id: string;
  workspace_id: string;
  user_id: string;
  meeting_title: string;
  meeting_starts_at: Date | string;
  meeting_ends_at: Date | string;
  status: PostMeetingDigestStatus;
  scheduled_for: Date | string;
  delivered_at: Date | string | null;
  snoozed_until: Date | string | null;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  attempts: number;
}

interface DigestNoteRow extends QueryResultRow {
  id: string;
  note_type: DigestNoteItem["noteType"] | null;
  priority: DigestNoteItem["priority"];
  status: DigestNoteItem["status"];
  text: string;
  raw_text: string;
  reminder_intent: string | null;
  explicit_due_at: Date | string | null;
  created_at: Date | string;
}

interface PreferenceRow extends QueryResultRow {
  digests_enabled: boolean;
}

const RESET_STALE_SQL = `
  UPDATE post_meeting_digests
  SET status = 'pending',
      scheduled_for = $1::timestamptz,
      locked_at = NULL,
      last_error_code = 'stale_processing_lock'
  WHERE status = 'processing'
    AND locked_at < $1::timestamptz - INTERVAL '10 minutes'
`;

const LIST_ELIGIBLE_SQL = `
  SELECT m.id AS meeting_id, m.workspace_id, m.user_id, m.ends_at
  FROM meetings m
  LEFT JOIN user_notification_preferences p
    ON p.workspace_id = m.workspace_id
   AND p.user_id = m.user_id
  WHERE m.ends_at <= $1::timestamptz
    AND m.ends_at > $1::timestamptz - INTERVAL '24 hours'
    AND COALESCE(p.digests_enabled, TRUE) = TRUE
    AND EXISTS (
      SELECT 1
      FROM notes n
      WHERE n.meeting_id = m.id
        AND n.workspace_id = m.workspace_id
        AND n.user_id = m.user_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM post_meeting_digests d
      WHERE d.meeting_id = m.id
        AND d.workspace_id = m.workspace_id
        AND d.user_id = m.user_id
    )
  ORDER BY m.ends_at ASC
  LIMIT $2
`;

const INSERT_DIGEST_SQL = `
  INSERT INTO post_meeting_digests (
    id, meeting_id, workspace_id, user_id, status, scheduled_for
  )
  VALUES ($1, $2, $3, $4, 'pending', $5)
  ON CONFLICT (meeting_id, workspace_id, user_id) DO NOTHING
`;

const CLAIM_DUE_SQL = `
  WITH due AS (
    SELECT d.id
    FROM post_meeting_digests d
    LEFT JOIN user_notification_preferences p
      ON p.workspace_id = d.workspace_id
     AND p.user_id = d.user_id
    WHERE d.status IN ('pending', 'snoozed')
      AND d.scheduled_for <= $1::timestamptz
      AND COALESCE(p.digests_enabled, TRUE) = TRUE
    ORDER BY d.scheduled_for ASC
    FOR UPDATE OF d SKIP LOCKED
    LIMIT $2
  ), claimed AS (
    UPDATE post_meeting_digests d
    SET status = 'processing',
        locked_at = $1::timestamptz,
        attempts = attempts + 1,
        last_error_code = NULL
    FROM due
    WHERE d.id = due.id
    RETURNING d.*
  )
  SELECT
    c.*,
    m.title AS meeting_title,
    m.starts_at AS meeting_starts_at,
    m.ends_at AS meeting_ends_at
  FROM claimed c
  JOIN meetings m
    ON m.id = c.meeting_id
   AND m.workspace_id = c.workspace_id
   AND m.user_id = c.user_id
  ORDER BY c.scheduled_for ASC
`;

const GET_DIGEST_SQL = `
  SELECT
    d.*,
    m.title AS meeting_title,
    m.starts_at AS meeting_starts_at,
    m.ends_at AS meeting_ends_at
  FROM post_meeting_digests d
  JOIN meetings m
    ON m.id = d.meeting_id
   AND m.workspace_id = d.workspace_id
   AND m.user_id = d.user_id
  WHERE d.id = $1
    AND d.workspace_id = $2
    AND d.user_id = $3
  LIMIT 1
`;

const GET_NOTES_SQL = `
  SELECT
    n.id,
    n.note_type,
    n.priority,
    n.status,
    COALESCE(n.organized_text, n.raw_text) AS text,
    n.raw_text,
    n.reminder_intent,
    n.explicit_due_at,
    n.created_at
  FROM notes n
  JOIN post_meeting_digests d
    ON d.meeting_id = n.meeting_id
   AND d.workspace_id = n.workspace_id
   AND d.user_id = n.user_id
  WHERE d.id = $1
    AND d.workspace_id = $2
    AND d.user_id = $3
  ORDER BY n.created_at ASC
`;

const MARK_DELIVERED_SQL = `
  UPDATE post_meeting_digests
  SET status = 'sent',
      delivered_at = $4,
      snoozed_until = NULL,
      slack_channel_id = $5,
      slack_message_ts = $6,
      locked_at = NULL,
      last_error_code = NULL
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const MARK_FAILED_SQL = `
  UPDATE post_meeting_digests
  SET status = 'pending',
      scheduled_for = $4,
      locked_at = NULL,
      last_error_code = $5
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const SNOOZE_SQL = `
  UPDATE post_meeting_digests
  SET status = 'snoozed',
      scheduled_for = $4,
      snoozed_until = $4,
      locked_at = NULL
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  RETURNING id
`;

const SET_PREFERENCE_SQL = `
  INSERT INTO user_notification_preferences (
    workspace_id, user_id, digests_enabled
  )
  VALUES ($1, $2, $3)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET digests_enabled = EXCLUDED.digests_enabled
`;

const GET_PREFERENCE_SQL = `
  SELECT digests_enabled
  FROM user_notification_preferences
  WHERE workspace_id = $1 AND user_id = $2
`;

export class PostgresPostMeetingDigestRepository
  implements PostMeetingDigestRepository
{
  constructor(private readonly pool: Pool) {}

  async prepareDue(now = new Date(), limit = 100): Promise<number> {
    await this.pool.query(RESET_STALE_SQL, [now]);
    const eligible = await this.pool.query<EligibleMeetingRow>(
      LIST_ELIGIBLE_SQL,
      [now, limit],
    );
    let inserted = 0;
    for (const row of eligible.rows) {
      const result = await this.pool.query(INSERT_DIGEST_SQL, [
        randomUUID(),
        row.meeting_id,
        row.workspace_id,
        row.user_id,
        this.toDate(row.ends_at),
      ]);
      inserted += result.rowCount ?? 0;
    }
    return inserted;
  }

  async claimDue(now = new Date(), limit = 20): Promise<PostMeetingDigest[]> {
    const result = await this.pool.query<DigestRow>(CLAIM_DUE_SQL, [now, limit]);
    return result.rows.map((row) => this.mapDigest(row));
  }

  async getContent(
    owner: OwnerScope,
    digestId: string,
  ): Promise<PostMeetingDigestContent | null> {
    const [digestResult, notesResult] = await Promise.all([
      this.pool.query<DigestRow>(GET_DIGEST_SQL, [
        digestId,
        owner.workspaceId,
        owner.userId,
      ]),
      this.pool.query<DigestNoteRow>(GET_NOTES_SQL, [
        digestId,
        owner.workspaceId,
        owner.userId,
      ]),
    ]);
    const row = digestResult.rows[0];
    if (!row) {
      return null;
    }
    return {
      digest: this.mapDigest(row),
      notes: notesResult.rows.map((note) => ({
        id: note.id,
        noteType: note.note_type ?? "reference",
        priority: note.priority,
        status: note.status,
        text: note.text,
        rawText: note.raw_text,
        reminderIntent: note.reminder_intent,
        explicitDueAt: this.optionalDate(note.explicit_due_at),
        createdAt: this.toDate(note.created_at),
      })),
    };
  }

  async markDelivered(
    owner: OwnerScope,
    digestId: string,
    reference: SlackMessageReference,
    deliveredAt = new Date(),
  ): Promise<void> {
    if (!reference.channelId.startsWith("D")) {
      throw new Error("Digest delivery must use a private Slack DM");
    }
    const result = await this.pool.query(MARK_DELIVERED_SQL, [
      digestId,
      owner.workspaceId,
      owner.userId,
      deliveredAt,
      reference.channelId,
      reference.messageTs,
    ]);
    if (result.rowCount !== 1) {
      throw new Error("Owner-scoped digest was not found for delivery");
    }
  }

  async markFailed(
    owner: OwnerScope,
    digestId: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_FAILED_SQL, [
      digestId,
      owner.workspaceId,
      owner.userId,
      retryAt,
      errorCode.slice(0, 120),
    ]);
  }

  async snooze(
    owner: OwnerScope,
    digestId: string,
    until: Date,
  ): Promise<PostMeetingDigest> {
    const updated = await this.pool.query(SNOOZE_SQL, [
      digestId,
      owner.workspaceId,
      owner.userId,
      until,
    ]);
    if (updated.rowCount !== 1) {
      throw new Error("Owner-scoped digest was not found for snooze");
    }
    const content = await this.getContent(owner, digestId);
    if (!content) {
      throw new Error("Snoozed digest could not be reloaded");
    }
    return content.digest;
  }

  async setDigestsEnabled(owner: OwnerScope, enabled: boolean): Promise<void> {
    await this.pool.query(SET_PREFERENCE_SQL, [
      owner.workspaceId,
      owner.userId,
      enabled,
    ]);
  }

  async areDigestsEnabled(owner: OwnerScope): Promise<boolean> {
    const result = await this.pool.query<PreferenceRow>(GET_PREFERENCE_SQL, [
      owner.workspaceId,
      owner.userId,
    ]);
    return result.rows[0]?.digests_enabled ?? true;
  }

  private mapDigest(row: DigestRow): PostMeetingDigest {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      meetingTitle: row.meeting_title,
      meetingStartsAt: this.toDate(row.meeting_starts_at),
      meetingEndsAt: this.toDate(row.meeting_ends_at),
      status: row.status,
      scheduledFor: this.toDate(row.scheduled_for),
      deliveredAt: this.optionalDate(row.delivered_at),
      snoozedUntil: this.optionalDate(row.snoozed_until),
      slackChannelId: row.slack_channel_id,
      slackMessageTs: row.slack_message_ts,
      attempts: row.attempts,
    };
  }

  private optionalDate(value: Date | string | null): Date | null {
    return value === null ? null : this.toDate(value);
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
