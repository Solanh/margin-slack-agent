import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { ReminderStatusSchema, type OwnerScope } from "../domain/note.js";

export type McpReminderStatus = "any" | "pending" | "sent" | "snoozed" | "cancelled";

export interface McpReminder {
  id: string;
  noteId: string;
  text: string;
  rawText: string;
  scheduledFor: string;
  status: Exclude<McpReminderStatus, "any">;
  deliveredAt: string | null;
  createdAt: string;
}

export interface CreateMcpReminderInput {
  noteId?: string | undefined;
  text?: string | undefined;
  scheduledFor: Date;
  requestKey: string;
}

export interface MarginMcpReminderStore {
  createFixed(
    owner: OwnerScope,
    input: CreateMcpReminderInput,
  ): Promise<McpReminder>;
  list(
    owner: OwnerScope,
    status: McpReminderStatus,
    limit: number,
  ): Promise<McpReminder[]>;
  cancel(owner: OwnerScope, reminderId: string): Promise<McpReminder | null>;
}

interface IdRow extends QueryResultRow {
  id: string;
}

interface ReminderRow extends QueryResultRow {
  id: string;
  note_id: string;
  raw_text: string;
  organized_text: string | null;
  scheduled_for: Date | string;
  status: string;
  delivered_at: Date | string | null;
  created_at: Date | string;
}

const FIND_NOTE_SQL = `
  SELECT id
  FROM notes
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  LIMIT 1
`;

const CREATE_NOTE_SQL = `
  INSERT INTO notes (
    id,
    workspace_id,
    user_id,
    source_channel_id,
    source_message_ts,
    raw_text
  )
  VALUES ($1, $2, $3, 'MCP', $4, $5)
  ON CONFLICT (workspace_id, user_id, source_message_ts)
  DO UPDATE SET source_message_ts = notes.source_message_ts
  RETURNING id
`;

const CREATE_REMINDER_SQL = `
  INSERT INTO reminders (
    id,
    note_id,
    workspace_id,
    user_id,
    reminder_type,
    scheduled_for,
    relative_rule,
    next_attempt_at,
    request_key
  )
  VALUES ($1, $2, $3, $4, 'fixed', $5, NULL, $5, $6)
  ON CONFLICT (workspace_id, user_id, request_key)
    WHERE request_key IS NOT NULL
  DO UPDATE SET request_key = EXCLUDED.request_key
  RETURNING id
`;

const SELECT_REMINDER_SQL = `
  SELECT
    reminder.id,
    reminder.note_id,
    note.raw_text,
    note.organized_text,
    reminder.scheduled_for,
    reminder.status,
    reminder.delivered_at,
    reminder.created_at
  FROM reminders AS reminder
  INNER JOIN notes AS note
    ON note.id = reminder.note_id
   AND note.workspace_id = reminder.workspace_id
   AND note.user_id = reminder.user_id
  WHERE reminder.id = $1
    AND reminder.workspace_id = $2
    AND reminder.user_id = $3
  LIMIT 1
`;

const LIST_REMINDERS_SQL = `
  SELECT
    reminder.id,
    reminder.note_id,
    note.raw_text,
    note.organized_text,
    reminder.scheduled_for,
    reminder.status,
    reminder.delivered_at,
    reminder.created_at
  FROM reminders AS reminder
  INNER JOIN notes AS note
    ON note.id = reminder.note_id
   AND note.workspace_id = reminder.workspace_id
   AND note.user_id = reminder.user_id
  WHERE reminder.workspace_id = $1
    AND reminder.user_id = $2
    AND reminder.reminder_type = 'fixed'
    AND ($3::text = 'any' OR reminder.status = $3::text)
  ORDER BY
    CASE WHEN reminder.status IN ('pending', 'snoozed') THEN 0 ELSE 1 END,
    reminder.scheduled_for ASC,
    reminder.created_at DESC
  LIMIT $4
`;

const CANCEL_REMINDER_SQL = `
  UPDATE reminders
  SET status = 'cancelled',
      claimed_at = NULL,
      next_attempt_at = NULL
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND status IN ('pending', 'snoozed')
  RETURNING id
`;

export class PostgresMarginMcpReminderStore
  implements MarginMcpReminderStore
{
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async createFixed(
    owner: OwnerScope,
    input: CreateMcpReminderInput,
  ): Promise<McpReminder> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const noteId = await this.resolveNote(client, owner, input);
      const created = await client.query<IdRow>(CREATE_REMINDER_SQL, [
        randomUUID(),
        noteId,
        owner.workspaceId,
        owner.userId,
        input.scheduledFor,
        input.requestKey,
      ]);
      const reminderId = created.rows[0]?.id;
      if (!reminderId) {
        throw new Error("PostgreSQL did not return the MCP reminder");
      }
      const reminder = await this.getWithClient(client, owner, reminderId);
      if (!reminder) {
        throw new Error("Created MCP reminder could not be read back");
      }
      await client.query("COMMIT");
      return reminder;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(
    owner: OwnerScope,
    status: McpReminderStatus,
    limit: number,
  ): Promise<McpReminder[]> {
    const result = await this.pool.query<ReminderRow>(LIST_REMINDERS_SQL, [
      owner.workspaceId,
      owner.userId,
      status,
      limit,
    ]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async cancel(owner: OwnerScope, reminderId: string): Promise<McpReminder | null> {
    await this.pool.query(CANCEL_REMINDER_SQL, [
      reminderId,
      owner.workspaceId,
      owner.userId,
    ]);
    const result = await this.pool.query<ReminderRow>(SELECT_REMINDER_SQL, [
      reminderId,
      owner.workspaceId,
      owner.userId,
    ]);
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  private async resolveNote(
    client: PoolClient,
    owner: OwnerScope,
    input: CreateMcpReminderInput,
  ): Promise<string> {
    if (input.noteId) {
      const existing = await client.query<IdRow>(FIND_NOTE_SQL, [
        input.noteId,
        owner.workspaceId,
        owner.userId,
      ]);
      const noteId = existing.rows[0]?.id;
      if (!noteId) {
        throw new Error("The requested Margin note was not found for this owner");
      }
      return noteId;
    }

    if (!input.text) {
      throw new Error("A noteId or reminder text is required");
    }
    const created = await client.query<IdRow>(CREATE_NOTE_SQL, [
      randomUUID(),
      owner.workspaceId,
      owner.userId,
      `mcp:${input.requestKey}`,
      input.text,
    ]);
    const noteId = created.rows[0]?.id;
    if (!noteId) {
      throw new Error("PostgreSQL did not return the MCP-created note");
    }
    return noteId;
  }

  private async getWithClient(
    client: PoolClient,
    owner: OwnerScope,
    reminderId: string,
  ): Promise<McpReminder | null> {
    const result = await client.query<ReminderRow>(SELECT_REMINDER_SQL, [
      reminderId,
      owner.workspaceId,
      owner.userId,
    ]);
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: ReminderRow): McpReminder {
    return {
      id: row.id,
      noteId: row.note_id,
      text: row.organized_text ?? row.raw_text,
      rawText: row.raw_text,
      scheduledFor: this.iso(row.scheduled_for),
      status: ReminderStatusSchema.parse(row.status),
      deliveredAt: row.delivered_at === null ? null : this.iso(row.delivered_at),
      createdAt: this.iso(row.created_at),
    };
  }

  private iso(value: Date | string): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }
}
