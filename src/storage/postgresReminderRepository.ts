import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  ReminderStatusSchema,
  ReminderTypeSchema,
  type OwnerScope,
  type Reminder,
} from "../domain/note.js";
import type {
  CreateReminderInput,
  DueReminder,
  ReminderDeliveryRepository,
  ReminderSlackMessageReference,
} from "./reminderRepository.js";

interface ReminderRow extends QueryResultRow {
  id: string;
  note_id: string;
  workspace_id: string;
  user_id: string;
  reminder_type: string;
  scheduled_for: Date | string | null;
  relative_rule: unknown;
  status: string;
  delivered_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DueReminderRow extends ReminderRow {
  raw_text: string;
  organized_text: string | null;
  attempts: number;
}

const CREATE_SQL = `
  INSERT INTO reminders (
    id,
    note_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_for,
    relative_rule,
    next_attempt_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING *
`;

const GET_SQL = `
  SELECT *
  FROM reminders
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  LIMIT 1
`;

const CANCEL_SQL = `
  UPDATE reminders
  SET status = 'cancelled',
      claimed_at = NULL,
      next_attempt_at = NULL
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND status <> 'cancelled'
  RETURNING *
`;

const CLAIM_DUE_SQL = `
  WITH due AS (
    SELECT id
    FROM reminders
    WHERE reminder_type = 'fixed'
      AND status = 'pending'
      AND scheduled_for <= $1
      AND COALESCE(next_attempt_at, scheduled_for) <= $1
      AND (
        claimed_at IS NULL
        OR claimed_at < $1 - INTERVAL '5 minutes'
      )
    ORDER BY scheduled_for ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT $2
  ), claimed AS (
    UPDATE reminders AS reminder
    SET claimed_at = $1,
        attempts = reminder.attempts + 1
    FROM due
    WHERE reminder.id = due.id
    RETURNING reminder.*
  )
  SELECT
    claimed.*,
    note.raw_text,
    note.organized_text
  FROM claimed
  INNER JOIN notes AS note
    ON note.id = claimed.note_id
   AND note.workspace_id = claimed.workspace_id
   AND note.user_id = claimed.user_id
  ORDER BY claimed.scheduled_for ASC, claimed.id ASC
`;

const MARK_DELIVERED_SQL = `
  UPDATE reminders
  SET status = 'sent',
      delivered_at = $4,
      claimed_at = NULL,
      next_attempt_at = NULL,
      last_error_code = NULL,
      slack_channel_id = $5,
      slack_message_ts = $6
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND status = 'pending'
`;

const MARK_FAILED_SQL = `
  UPDATE reminders
  SET claimed_at = NULL,
      last_error_code = $4,
      next_attempt_at = $5
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND status = 'pending'
`;

export class PostgresReminderRepository
  implements ReminderDeliveryRepository
{
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async create(input: CreateReminderInput): Promise<Reminder> {
    const scheduledFor =
      input.reminderType === "fixed" ? input.scheduledFor : null;
    const relativeRule =
      input.reminderType === "event_relative"
        ? JSON.stringify(input.relativeRule)
        : null;

    const result = await this.pool.query<ReminderRow>(CREATE_SQL, [
      randomUUID(),
      input.noteId,
      input.workspaceId,
      input.userId,
      input.reminderType,
      scheduledFor,
      relativeRule,
      scheduledFor,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the created reminder");
    }

    return this.mapRow(row);
  }

  async getById(owner: OwnerScope, id: string): Promise<Reminder | null> {
    const result = await this.pool.query<ReminderRow>(GET_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
    ]);

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async cancel(owner: OwnerScope, id: string): Promise<Reminder | null> {
    const result = await this.pool.query<ReminderRow>(CANCEL_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
    ]);

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async claimDue(now: Date, limit: number): Promise<DueReminder[]> {
    const result = await this.pool.query<DueReminderRow>(CLAIM_DUE_SQL, [
      now,
      limit,
    ]);

    return result.rows.map((row) => {
      if (row.scheduled_for === null) {
        throw new Error("Claimed fixed reminder has no scheduled time");
      }
      return {
        id: row.id,
        noteId: row.note_id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        scheduledFor: this.toDate(row.scheduled_for),
        rawText: row.raw_text,
        organizedText: row.organized_text,
        attempts: row.attempts,
      };
    });
  }

  async markDelivered(
    owner: OwnerScope,
    id: string,
    reference: ReminderSlackMessageReference,
    deliveredAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_DELIVERED_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
      deliveredAt,
      reference.channelId,
      reference.messageTs,
    ]);
  }

  async markFailed(
    owner: OwnerScope,
    id: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_FAILED_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
      errorCode,
      retryAt,
    ]);
  }

  private mapRow(row: ReminderRow): Reminder {
    return {
      id: row.id,
      noteId: row.note_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      reminderType: ReminderTypeSchema.parse(row.reminder_type),
      scheduledFor: this.optionalDate(row.scheduled_for),
      relativeRule: this.objectOrNull(row.relative_rule),
      status: ReminderStatusSchema.parse(row.status),
      deliveredAt: this.optionalDate(row.delivered_at),
      createdAt: this.toDate(row.created_at),
      updatedAt: this.toDate(row.updated_at),
    };
  }

  private objectOrNull(value: unknown): Record<string, unknown> | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected reminder relative rule to be an object");
    }
    return value as Record<string, unknown>;
  }

  private optionalDate(value: Date | string | null): Date | null {
    return value === null ? null : this.toDate(value);
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
