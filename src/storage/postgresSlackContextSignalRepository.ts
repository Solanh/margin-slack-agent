import type { Pool, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type {
  SaveSlackActiveContextInput,
  SaveSlackHuddleStateInput,
  SlackActiveContext,
  SlackContextSignalRepository,
  SlackHuddleState,
} from "./slackContextSignalRepository.js";

interface KnownOwnerRow extends QueryResultRow {
  exists: boolean;
}

interface HuddleRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
  call_id: string | null;
  observed_at: Date | string;
  expires_at: Date | string;
  source_event_ts: string | null;
}

interface ActiveContextRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
  entity_type: "channel" | "message";
  channel_id: string;
  message_ts: string | null;
  observed_at: Date | string;
  expires_at: Date | string;
  source_event_ts: string | null;
}

const KNOWN_OWNER_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM notes
    WHERE workspace_id = $1 AND user_id = $2
    UNION ALL
    SELECT 1 FROM oauth_connections
    WHERE workspace_id = $1 AND user_id = $2
  ) AS exists
`;

const SAVE_HUDDLE_SQL = `
  INSERT INTO slack_huddle_states (
    workspace_id,
    user_id,
    call_id,
    observed_at,
    expires_at,
    source_event_ts
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    call_id = EXCLUDED.call_id,
    observed_at = CASE
      WHEN slack_huddle_states.call_id IS NOT DISTINCT FROM EXCLUDED.call_id
      THEN LEAST(slack_huddle_states.observed_at, EXCLUDED.observed_at)
      ELSE EXCLUDED.observed_at
    END,
    expires_at = GREATEST(EXCLUDED.expires_at, EXCLUDED.observed_at + INTERVAL '1 second'),
    source_event_ts = EXCLUDED.source_event_ts
  RETURNING workspace_id, user_id, call_id, observed_at, expires_at, source_event_ts
`;

const DELETE_HUDDLE_SQL = `
  DELETE FROM slack_huddle_states
  WHERE workspace_id = $1 AND user_id = $2
`;

const GET_HUDDLE_SQL = `
  SELECT workspace_id, user_id, call_id, observed_at, expires_at, source_event_ts
  FROM slack_huddle_states
  WHERE workspace_id = $1
    AND user_id = $2
    AND observed_at <= $3
    AND expires_at > $3
  LIMIT 1
`;

const SAVE_CONTEXT_SQL = `
  INSERT INTO slack_active_contexts (
    workspace_id,
    user_id,
    entity_type,
    channel_id,
    message_ts,
    observed_at,
    expires_at,
    source_event_ts
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    entity_type = EXCLUDED.entity_type,
    channel_id = EXCLUDED.channel_id,
    message_ts = EXCLUDED.message_ts,
    observed_at = EXCLUDED.observed_at,
    expires_at = EXCLUDED.expires_at,
    source_event_ts = EXCLUDED.source_event_ts
  RETURNING
    workspace_id,
    user_id,
    entity_type,
    channel_id,
    message_ts,
    observed_at,
    expires_at,
    source_event_ts
`;

const DELETE_CONTEXT_SQL = `
  DELETE FROM slack_active_contexts
  WHERE workspace_id = $1 AND user_id = $2
`;

const GET_CONTEXT_SQL = `
  SELECT
    workspace_id,
    user_id,
    entity_type,
    channel_id,
    message_ts,
    observed_at,
    expires_at,
    source_event_ts
  FROM slack_active_contexts
  WHERE workspace_id = $1
    AND user_id = $2
    AND observed_at <= $3
    AND expires_at > $3
  LIMIT 1
`;

const DELETE_EXPIRED_SQL = `
  WITH deleted_huddles AS (
    DELETE FROM slack_huddle_states
    WHERE expires_at <= $1
    RETURNING 1
  ), deleted_contexts AS (
    DELETE FROM slack_active_contexts
    WHERE expires_at <= $1
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM deleted_huddles)
    +
    (SELECT COUNT(*) FROM deleted_contexts) AS count
`;

interface CountRow extends QueryResultRow {
  count: string | number;
}

export class PostgresSlackContextSignalRepository
  implements SlackContextSignalRepository
{
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async isKnownOwner(owner: OwnerScope): Promise<boolean> {
    const result = await this.pool.query<KnownOwnerRow>(KNOWN_OWNER_SQL, [
      owner.workspaceId,
      owner.userId,
    ]);
    return result.rows[0]?.exists === true;
  }

  async saveHuddleState(
    input: SaveSlackHuddleStateInput,
  ): Promise<SlackHuddleState> {
    if (input.expiresAt.getTime() <= input.observedAt.getTime()) {
      throw new Error("Slack huddle state must expire after it was observed");
    }

    const result = await this.pool.query<HuddleRow>(SAVE_HUDDLE_SQL, [
      input.workspaceId,
      input.userId,
      input.callId,
      input.observedAt,
      input.expiresAt,
      input.sourceEventTs ?? null,
    ]);
    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the saved Slack huddle state");
    }
    return this.mapHuddle(row);
  }

  async deleteHuddleState(owner: OwnerScope): Promise<boolean> {
    const result = await this.pool.query(DELETE_HUDDLE_SQL, [
      owner.workspaceId,
      owner.userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveHuddle(
    owner: OwnerScope,
    at = new Date(),
  ): Promise<SlackHuddleState | null> {
    const result = await this.pool.query<HuddleRow>(GET_HUDDLE_SQL, [
      owner.workspaceId,
      owner.userId,
      at,
    ]);
    const row = result.rows[0];
    return row ? this.mapHuddle(row) : null;
  }

  async saveActiveContext(
    input: SaveSlackActiveContextInput,
  ): Promise<SlackActiveContext> {
    if (input.expiresAt.getTime() <= input.observedAt.getTime()) {
      throw new Error("Slack active context must expire after it was observed");
    }
    if (input.entityType === "message" && !input.messageTs) {
      throw new Error("Slack message context requires a message timestamp");
    }
    if (input.entityType === "channel" && input.messageTs !== null) {
      throw new Error("Slack channel context cannot include a message timestamp");
    }

    const result = await this.pool.query<ActiveContextRow>(SAVE_CONTEXT_SQL, [
      input.workspaceId,
      input.userId,
      input.entityType,
      input.channelId,
      input.messageTs,
      input.observedAt,
      input.expiresAt,
      input.sourceEventTs ?? null,
    ]);
    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the saved Slack active context");
    }
    return this.mapContext(row);
  }

  async deleteActiveContext(owner: OwnerScope): Promise<boolean> {
    const result = await this.pool.query(DELETE_CONTEXT_SQL, [
      owner.workspaceId,
      owner.userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveContext(
    owner: OwnerScope,
    at = new Date(),
  ): Promise<SlackActiveContext | null> {
    const result = await this.pool.query<ActiveContextRow>(GET_CONTEXT_SQL, [
      owner.workspaceId,
      owner.userId,
      at,
    ]);
    const row = result.rows[0];
    return row ? this.mapContext(row) : null;
  }

  async deleteExpired(now = new Date()): Promise<number> {
    const result = await this.pool.query<CountRow>(DELETE_EXPIRED_SQL, [now]);
    return Number(result.rows[0]?.count ?? 0);
  }

  private mapHuddle(row: HuddleRow): SlackHuddleState {
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      callId: row.call_id,
      observedAt: this.toDate(row.observed_at),
      expiresAt: this.toDate(row.expires_at),
      sourceEventTs: row.source_event_ts,
    };
  }

  private mapContext(row: ActiveContextRow): SlackActiveContext {
    return {
      workspaceId: row.workspace_id,
      userId: row.user_id,
      entityType: row.entity_type,
      channelId: row.channel_id,
      messageTs: row.message_ts,
      observedAt: this.toDate(row.observed_at),
      expiresAt: this.toDate(row.expires_at),
      sourceEventTs: row.source_event_ts,
    };
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
