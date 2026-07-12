import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { RawNote } from "../domain/note.js";
import type {
  CreateRawNoteInput,
  RawNoteRepository,
} from "./noteRepository.js";

interface RawNoteRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  source_channel_id: string;
  source_message_ts: string;
  raw_text: string;
  created_at: Date | string;
}

const CREATE_RAW_NOTE_SQL = `
  INSERT INTO notes (
    id,
    workspace_id,
    user_id,
    source_channel_id,
    source_message_ts,
    raw_text
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (workspace_id, user_id, source_message_ts)
  DO UPDATE SET source_message_ts = notes.source_message_ts
  RETURNING
    id,
    workspace_id,
    user_id,
    source_channel_id,
    source_message_ts,
    raw_text,
    created_at
`;

export class PostgresRawNoteRepository implements RawNoteRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async createRaw(input: CreateRawNoteInput): Promise<RawNote> {
    const result = await this.pool.query<RawNoteRow>(CREATE_RAW_NOTE_SQL, [
      randomUUID(),
      input.workspaceId,
      input.userId,
      input.sourceChannelId,
      input.sourceMessageTs,
      input.rawText,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the persisted raw note");
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      sourceChannelId: row.source_channel_id,
      sourceMessageTs: row.source_message_ts,
      rawText: row.raw_text,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(row.created_at),
    };
  }
}
