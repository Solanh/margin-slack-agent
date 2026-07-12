import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  ContextConfidenceSchema,
  type MeetingContext,
  type OwnerScope,
} from "../domain/note.js";
import type {
  MeetingRepository,
  SaveMeetingInput,
} from "./meetingRepository.js";

interface MeetingRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: MeetingContext["provider"];
  provider_event_id: string | null;
  title: string;
  starts_at: Date | string;
  ends_at: Date | string;
  participants: unknown;
  context_confidence: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const SAVE_WITH_PROVIDER_ID_SQL = `
  INSERT INTO meetings (
    id,
    workspace_id,
    user_id,
    provider,
    provider_event_id,
    title,
    starts_at,
    ends_at,
    participants,
    context_confidence
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (workspace_id, user_id, provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    participants = EXCLUDED.participants,
    context_confidence = EXCLUDED.context_confidence
  RETURNING *
`;

const INSERT_EXPLICIT_SQL = `
  INSERT INTO meetings (
    id,
    workspace_id,
    user_id,
    provider,
    provider_event_id,
    title,
    starts_at,
    ends_at,
    participants,
    context_confidence
  )
  VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
  RETURNING *
`;

const GET_SQL = `
  SELECT *
  FROM meetings
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  LIMIT 1
`;

const LIST_OVERLAPPING_SQL = `
  SELECT *
  FROM meetings
  WHERE workspace_id = $1
    AND user_id = $2
    AND starts_at < $3
    AND ends_at > $4
  ORDER BY starts_at ASC
`;

export class PostgresMeetingRepository implements MeetingRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async save(input: SaveMeetingInput): Promise<MeetingContext> {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new Error("Meeting end time must be after its start time");
    }

    const values = input.providerEventId
      ? [
          randomUUID(),
          input.workspaceId,
          input.userId,
          input.provider,
          input.providerEventId,
          input.title,
          input.startsAt,
          input.endsAt,
          JSON.stringify(input.participants),
          input.confidence,
        ]
      : [
          randomUUID(),
          input.workspaceId,
          input.userId,
          input.provider,
          input.title,
          input.startsAt,
          input.endsAt,
          JSON.stringify(input.participants),
          input.confidence,
        ];

    const result = await this.pool.query<MeetingRow>(
      input.providerEventId ? SAVE_WITH_PROVIDER_ID_SQL : INSERT_EXPLICIT_SQL,
      values,
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the saved meeting");
    }

    return this.mapRow(row);
  }

  async getById(owner: OwnerScope, id: string): Promise<MeetingContext | null> {
    const result = await this.pool.query<MeetingRow>(GET_SQL, [
      id,
      owner.workspaceId,
      owner.userId,
    ]);

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async listOverlapping(
    owner: OwnerScope,
    startsBefore: Date,
    endsAfter: Date,
  ): Promise<MeetingContext[]> {
    const result = await this.pool.query<MeetingRow>(LIST_OVERLAPPING_SQL, [
      owner.workspaceId,
      owner.userId,
      startsBefore,
      endsAfter,
    ]);

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: MeetingRow): MeetingContext {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      provider: row.provider,
      providerEventId: row.provider_event_id,
      title: row.title,
      startsAt: this.toDate(row.starts_at),
      endsAt: this.toDate(row.ends_at),
      participants: this.stringArray(row.participants),
      confidence: ContextConfidenceSchema.parse(row.context_confidence),
      createdAt: this.toDate(row.created_at),
      updatedAt: this.toDate(row.updated_at),
    };
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error("Expected meeting participants to be a string array");
    }
    return value;
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
