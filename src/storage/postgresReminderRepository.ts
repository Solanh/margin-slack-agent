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
  ReminderRepository,
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

const CREATE_SQL = `
  INSERT INTO reminders (
    id,
    note_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_for,
    relative_rule
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
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
  SET status = 'cancelled'
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND status <> 'cancelled'
  RETURNING *
`;

export class PostgresReminderRepository implements ReminderRepository {
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
