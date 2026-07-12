import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type {
  PreMeetingResurfacing,
  PreMeetingResurfacingContent,
  PreMeetingResurfacingRepository,
  PreMeetingResurfacingStatus,
  PrepareUpcomingInput,
  ResurfacingNoteItem,
} from "./preMeetingResurfacingRepository.js";
import type { SlackMessageReference } from "./postMeetingDigestRepository.js";

interface OwnerRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
}

interface ResurfacingRow extends QueryResultRow {
  id: string;
  upcoming_meeting_id: string;
  workspace_id: string;
  user_id: string;
  series_key: string;
  status: PreMeetingResurfacingStatus;
  scheduled_for: Date | string;
  delivered_at: Date | string | null;
  snoozed_until: Date | string | null;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  attempts: number;
  upcoming_meeting_title: string;
  upcoming_starts_at: Date | string;
}

interface NoteRow extends QueryResultRow {
  id: string;
  prior_meeting_id: string;
  prior_meeting_title: string;
  prior_meeting_starts_at: Date | string;
  note_type: "action" | "question";
  status: ResurfacingNoteItem["status"];
  priority: ResurfacingNoteItem["priority"];
  text: string;
  raw_text: string;
  reminder_intent: string | null;
}

const LIST_ELIGIBLE_OWNERS_SQL = `
  SELECT DISTINCT oc.workspace_id, oc.user_id
  FROM oauth_connections oc
  LEFT JOIN user_notification_preferences p
    ON p.workspace_id = oc.workspace_id
   AND p.user_id = oc.user_id
  WHERE oc.provider = 'google_calendar'
    AND COALESCE(p.resurfacing_enabled, TRUE) = TRUE
  ORDER BY oc.workspace_id, oc.user_id
  LIMIT $1
`;

const PREPARE_SQL = `
  INSERT INTO pre_meeting_resurfacings (
    id,
    upcoming_meeting_id,
    workspace_id,
    user_id,
    series_key,
    status,
    scheduled_for
  )
  SELECT $1, m.id, m.workspace_id, m.user_id, m.series_key, 'pending', $6
  FROM meetings m
  LEFT JOIN user_notification_preferences p
    ON p.workspace_id = m.workspace_id
   AND p.user_id = m.user_id
  LEFT JOIN meeting_series_preferences sp
    ON sp.workspace_id = m.workspace_id
   AND sp.user_id = m.user_id
   AND sp.series_key = m.series_key
  WHERE m.id = $2
    AND m.workspace_id = $3
    AND m.user_id = $4
    AND m.provider = 'google_calendar'
    AND m.series_key = $5
    AND COALESCE(p.resurfacing_enabled, TRUE) = TRUE
    AND COALESCE(sp.resurfacing_enabled, TRUE) = TRUE
    AND EXISTS (
      SELECT 1
      FROM meetings prior
      JOIN notes n
        ON n.meeting_id = prior.id
       AND n.workspace_id = prior.workspace_id
       AND n.user_id = prior.user_id
      WHERE prior.workspace_id = m.workspace_id
        AND prior.user_id = m.user_id
        AND prior.series_key = m.series_key
        AND prior.starts_at < m.starts_at
        AND n.status = 'open'
        AND n.note_type IN ('action', 'question')
    )
  ON CONFLICT (upcoming_meeting_id, workspace_id, user_id) DO NOTHING
`;

const RESET_STALE_SQL = `
  UPDATE pre_meeting_resurfacings
  SET status = 'pending',
      scheduled_for = $1::timestamptz,
      locked_at = NULL,
      last_error_code = 'stale_processing_lock'
  WHERE status = 'processing'
    AND locked_at < $1::timestamptz - INTERVAL '10 minutes'
`;

const CLAIM_DUE_SQL = `
  WITH due AS (
    SELECT r.id
    FROM pre_meeting_resurfacings r
    LEFT JOIN user_notification_preferences p
      ON p.workspace_id = r.workspace_id
     AND p.user_id = r.user_id
    LEFT JOIN meeting_series_preferences sp
      ON sp.workspace_id = r.workspace_id
     AND sp.user_id = r.user_id
     AND sp.series_key = r.series_key
    WHERE r.status IN ('pending', 'snoozed')
      AND r.scheduled_for <= $1::timestamptz
      AND COALESCE(p.resurfacing_enabled, TRUE) = TRUE
      AND COALESCE(sp.resurfacing_enabled, TRUE) = TRUE
    ORDER BY r.scheduled_for ASC
    FOR UPDATE OF r SKIP LOCKED
    LIMIT $2
  ), claimed AS (
    UPDATE pre_meeting_resurfacings r
    SET status = 'processing',
        locked_at = $1::timestamptz,
        attempts = attempts + 1,
        last_error_code = NULL
    FROM due
    WHERE r.id = due.id
    RETURNING r.*
  )
  SELECT
    c.*,
    m.title AS upcoming_meeting_title,
    m.starts_at AS upcoming_starts_at
  FROM claimed c
  JOIN meetings m
    ON m.id = c.upcoming_meeting_id
   AND m.workspace_id = c.workspace_id
   AND m.user_id = c.user_id
  ORDER BY c.scheduled_for ASC
`;

const GET_RESURFACING_SQL = `
  SELECT
    r.*,
    m.title AS upcoming_meeting_title,
    m.starts_at AS upcoming_starts_at
  FROM pre_meeting_resurfacings r
  JOIN meetings m
    ON m.id = r.upcoming_meeting_id
   AND m.workspace_id = r.workspace_id
   AND m.user_id = r.user_id
  WHERE r.id = $1
    AND r.workspace_id = $2
    AND r.user_id = $3
  LIMIT 1
`;

const GET_NOTES_SQL = `
  WITH latest_prior AS (
    SELECT prior.id, prior.title, prior.starts_at
    FROM pre_meeting_resurfacings r
    JOIN meetings upcoming
      ON upcoming.id = r.upcoming_meeting_id
     AND upcoming.workspace_id = r.workspace_id
     AND upcoming.user_id = r.user_id
    JOIN meetings prior
      ON prior.workspace_id = r.workspace_id
     AND prior.user_id = r.user_id
     AND prior.series_key = r.series_key
     AND prior.starts_at < upcoming.starts_at
    WHERE r.id = $1
      AND r.workspace_id = $2
      AND r.user_id = $3
      AND EXISTS (
        SELECT 1
        FROM notes eligible
        WHERE eligible.meeting_id = prior.id
          AND eligible.workspace_id = prior.workspace_id
          AND eligible.user_id = prior.user_id
          AND eligible.status = 'open'
          AND eligible.note_type IN ('action', 'question')
      )
    ORDER BY prior.starts_at DESC
    LIMIT 1
  )
  SELECT
    n.id,
    latest_prior.id AS prior_meeting_id,
    latest_prior.title AS prior_meeting_title,
    latest_prior.starts_at AS prior_meeting_starts_at,
    n.note_type,
    n.status,
    n.priority,
    COALESCE(n.organized_text, n.raw_text) AS text,
    n.raw_text,
    n.reminder_intent
  FROM latest_prior
  JOIN notes n
    ON n.meeting_id = latest_prior.id
   AND n.workspace_id = $2
   AND n.user_id = $3
  WHERE n.status = 'open'
    AND n.note_type IN ('action', 'question')
  ORDER BY
    CASE n.note_type WHEN 'action' THEN 0 ELSE 1 END,
    n.created_at ASC
`;

const MARK_DELIVERED_SQL = `
  UPDATE pre_meeting_resurfacings
  SET status = 'sent',
      delivered_at = $4,
      snoozed_until = NULL,
      slack_channel_id = $5,
      slack_message_ts = $6,
      locked_at = NULL,
      last_error_code = NULL
  WHERE id = $1 AND workspace_id = $2 AND user_id = $3
`;

const MARK_FAILED_SQL = `
  UPDATE pre_meeting_resurfacings
  SET status = 'pending',
      scheduled_for = $4,
      locked_at = NULL,
      last_error_code = $5
  WHERE id = $1 AND workspace_id = $2 AND user_id = $3
`;

const SNOOZE_SQL = `
  UPDATE pre_meeting_resurfacings
  SET status = 'snoozed',
      scheduled_for = $4,
      snoozed_until = $4,
      locked_at = NULL
  WHERE id = $1 AND workspace_id = $2 AND user_id = $3
  RETURNING id
`;

const RESOLVE_INCLUDED_SQL = `
  WITH latest_prior AS (
    SELECT prior.id
    FROM pre_meeting_resurfacings r
    JOIN meetings upcoming
      ON upcoming.id = r.upcoming_meeting_id
     AND upcoming.workspace_id = r.workspace_id
     AND upcoming.user_id = r.user_id
    JOIN meetings prior
      ON prior.workspace_id = r.workspace_id
     AND prior.user_id = r.user_id
     AND prior.series_key = r.series_key
     AND prior.starts_at < upcoming.starts_at
    WHERE r.id = $1
      AND r.workspace_id = $2
      AND r.user_id = $3
      AND EXISTS (
        SELECT 1 FROM notes eligible
        WHERE eligible.meeting_id = prior.id
          AND eligible.workspace_id = prior.workspace_id
          AND eligible.user_id = prior.user_id
          AND eligible.status = 'open'
          AND eligible.note_type IN ('action', 'question')
      )
    ORDER BY prior.starts_at DESC
    LIMIT 1
  )
  UPDATE notes n
  SET status = 'resolved'
  FROM latest_prior
  WHERE n.meeting_id = latest_prior.id
    AND n.workspace_id = $2
    AND n.user_id = $3
    AND n.status = 'open'
    AND n.note_type IN ('action', 'question')
`;

const SET_GLOBAL_SQL = `
  INSERT INTO user_notification_preferences (
    workspace_id, user_id, resurfacing_enabled
  ) VALUES ($1, $2, $3)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET resurfacing_enabled = EXCLUDED.resurfacing_enabled
`;

const SET_SERIES_SQL = `
  INSERT INTO meeting_series_preferences (
    workspace_id, user_id, series_key, resurfacing_enabled
  ) VALUES ($1, $2, $3, $4)
  ON CONFLICT (workspace_id, user_id, series_key)
  DO UPDATE SET resurfacing_enabled = EXCLUDED.resurfacing_enabled
`;

export class PostgresPreMeetingResurfacingRepository
  implements PreMeetingResurfacingRepository
{
  constructor(private readonly pool: Pool) {}

  async listEligibleOwners(limit = 100): Promise<OwnerScope[]> {
    const result = await this.pool.query<OwnerRow>(LIST_ELIGIBLE_OWNERS_SQL, [
      limit,
    ]);
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      userId: row.user_id,
    }));
  }

  async prepareForUpcoming(input: PrepareUpcomingInput): Promise<boolean> {
    if (!input.seriesKey.trim()) {
      return false;
    }
    const result = await this.pool.query(PREPARE_SQL, [
      randomUUID(),
      input.upcomingMeetingId,
      input.workspaceId,
      input.userId,
      input.seriesKey,
      input.scheduledFor,
    ]);
    return (result.rowCount ?? 0) === 1;
  }

  async claimDue(
    now = new Date(),
    limit = 20,
  ): Promise<PreMeetingResurfacing[]> {
    await this.pool.query(RESET_STALE_SQL, [now]);
    const result = await this.pool.query<ResurfacingRow>(CLAIM_DUE_SQL, [
      now,
      limit,
    ]);
    return result.rows.map((row) => this.mapResurfacing(row));
  }

  async getContent(
    owner: OwnerScope,
    resurfacingId: string,
  ): Promise<PreMeetingResurfacingContent | null> {
    const [resurfacingResult, notesResult] = await Promise.all([
      this.pool.query<ResurfacingRow>(GET_RESURFACING_SQL, [
        resurfacingId,
        owner.workspaceId,
        owner.userId,
      ]),
      this.pool.query<NoteRow>(GET_NOTES_SQL, [
        resurfacingId,
        owner.workspaceId,
        owner.userId,
      ]),
    ]);
    const row = resurfacingResult.rows[0];
    if (!row) {
      return null;
    }
    return {
      resurfacing: this.mapResurfacing(row),
      notes: notesResult.rows.map((note) => ({
        id: note.id,
        priorMeetingId: note.prior_meeting_id,
        priorMeetingTitle: note.prior_meeting_title,
        priorMeetingStartsAt: this.toDate(note.prior_meeting_starts_at),
        noteType: note.note_type,
        status: note.status,
        priority: note.priority,
        text: note.text,
        rawText: note.raw_text,
        reminderIntent: note.reminder_intent,
      })),
    };
  }

  async markDelivered(
    owner: OwnerScope,
    resurfacingId: string,
    reference: SlackMessageReference,
    deliveredAt = new Date(),
  ): Promise<void> {
    if (!reference.channelId.startsWith("D")) {
      throw new Error("Resurfacing delivery must use a private Slack DM");
    }
    const result = await this.pool.query(MARK_DELIVERED_SQL, [
      resurfacingId,
      owner.workspaceId,
      owner.userId,
      deliveredAt,
      reference.channelId,
      reference.messageTs,
    ]);
    if (result.rowCount !== 1) {
      throw new Error("Owner-scoped resurfacing was not found for delivery");
    }
  }

  async markFailed(
    owner: OwnerScope,
    resurfacingId: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_FAILED_SQL, [
      resurfacingId,
      owner.workspaceId,
      owner.userId,
      retryAt,
      errorCode.slice(0, 120),
    ]);
  }

  async snooze(
    owner: OwnerScope,
    resurfacingId: string,
    until: Date,
  ): Promise<PreMeetingResurfacing> {
    const result = await this.pool.query(SNOOZE_SQL, [
      resurfacingId,
      owner.workspaceId,
      owner.userId,
      until,
    ]);
    if (result.rowCount !== 1) {
      throw new Error("Owner-scoped resurfacing was not found for snooze");
    }
    const content = await this.getContent(owner, resurfacingId);
    if (!content) {
      throw new Error("Snoozed resurfacing could not be reloaded");
    }
    return content.resurfacing;
  }

  async markIncludedNotesResolved(
    owner: OwnerScope,
    resurfacingId: string,
  ): Promise<number> {
    const result = await this.pool.query(RESOLVE_INCLUDED_SQL, [
      resurfacingId,
      owner.workspaceId,
      owner.userId,
    ]);
    return result.rowCount ?? 0;
  }

  async setResurfacingEnabled(
    owner: OwnerScope,
    enabled: boolean,
  ): Promise<void> {
    await this.pool.query(SET_GLOBAL_SQL, [
      owner.workspaceId,
      owner.userId,
      enabled,
    ]);
  }

  async setSeriesEnabled(
    owner: OwnerScope,
    seriesKey: string,
    enabled: boolean,
  ): Promise<void> {
    if (!seriesKey.trim()) {
      throw new Error("Meeting series key is required");
    }
    await this.pool.query(SET_SERIES_SQL, [
      owner.workspaceId,
      owner.userId,
      seriesKey,
      enabled,
    ]);
  }

  private mapResurfacing(row: ResurfacingRow): PreMeetingResurfacing {
    return {
      id: row.id,
      upcomingMeetingId: row.upcoming_meeting_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      upcomingMeetingTitle: row.upcoming_meeting_title,
      upcomingStartsAt: this.toDate(row.upcoming_starts_at),
      seriesKey: row.series_key,
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
